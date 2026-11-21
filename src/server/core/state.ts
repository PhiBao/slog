/**
 * Redis state layer — every persistent byte of Slog lives here.
 *
 * Key map (see ARCHITECTURE.md in the build package):
 *   slog:currentFloor              → number (current floor id)
 *   slog:floor:{id}:gen            → FloorGen JSON (effective seed, not just f(id))
 *   slog:floor:{id}:state          → FloorState JSON (versioned)
 *   slog:floor:{id}:log            → MoveLogEntry[] JSON (capped, LOG_CAP)
 *   slog:floor:{id}:lastMoveAt     → unix ms of the last applied move
 *   slog:floor:{id}:mover:{user}   → "1" (move budget; NX + expires at floor end)
 *   slog:floor:{id}:lock           → lock token (NX + short TTL)
 *   slog:user:{user}:streak        → { n, last } JSON
 *   slog:user:{user}:best          → fewest moves to clear a practice tunnel
 *   slog:archive                   → sorted set of FloorSummary JSON, newest first
 */

import { redis } from "@devvit/web/server";
import { z } from "zod";

import { generateFloor } from "../../shared/floor";
import { floorGenSchema, floorStateSchema, floorSummarySchema, moveLogEntrySchema, streakSchema } from "../../shared/schemas";
import { MAX_HP, type FloorGen, type FloorState, type MoveLogEntry, type FloorSummary } from "../../shared/types";

export const LOG_CAP = 250;
export const ARCHIVE_CAP = 60;

/** Floor #1 opened at noon UTC on the day the app first ran. */
export const FLOOR_EPOCH_UTC = Date.UTC(2026, 10, 21, 12, 0, 0);
export const FLOOR_WINDOW_MS = 24 * 60 * 60 * 1000;

export function floorIdAt(now: number): number {
  // Floor #1 opens at the epoch (first 12:00 UTC after launch). Anything
  // before it is still Floor #1 — the launch grace window.
  return Math.max(1, Math.floor((now - FLOOR_EPOCH_UTC) / FLOOR_WINDOW_MS) + 1);
}

export function floorEndsAt(id: number): number {
  return FLOOR_EPOCH_UTC + id * FLOOR_WINDOW_MS;
}

export function floorSeedFor(id: number): number {
  return 1000 + id * 7919;
}

const keys = {
  currentFloor: "slog:currentFloor",
  floorGen: (id: number) => `slog:floor:${id}:gen`,
  floorState: (id: number) => `slog:floor:${id}:state`,
  floorLog: (id: number) => `slog:floor:${id}:log`,
  floorLastMoveAt: (id: number) => `slog:floor:${id}:lastMoveAt`,
  mover: (id: number, user: string) => `slog:floor:${id}:mover:${user.toLowerCase()}`,
  lock: (id: number) => `slog:floor:${id}:lock`,
  streak: (user: string) => `slog:user:${user.toLowerCase()}:streak`,
  best: (user: string) => `slog:user:${user.toLowerCase()}:best`,
  archive: "slog:archive",
};

function readJson<S extends z.ZodType>(raw: string | undefined, schema: S): z.output<S> | null {
  if (!raw) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const logListSchema = z.array(moveLogEntrySchema);

// ---------------------------------------------------------------------------
// Floor lifecycle
// ---------------------------------------------------------------------------

export async function getCurrentFloorId(): Promise<number | null> {
  const raw = await redis.get(keys.currentFloor);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function setCurrentFloorId(id: number): Promise<void> {
  await redis.set(keys.currentFloor, String(id));
}

export async function getFloorGen(id: number): Promise<FloorGen | null> {
  return readJson(await redis.get(keys.floorGen(id)), floorGenSchema);
}

export async function getFloorState(id: number): Promise<FloorState | null> {
  return readJson(await redis.get(keys.floorState(id)), floorStateSchema);
}

export async function setFloorState(id: number, state: FloorState): Promise<void> {
  await redis.set(keys.floorState(id), JSON.stringify(state));
}

export async function getFloorLog(id: number): Promise<MoveLogEntry[]> {
  return readJson(await redis.get(keys.floorLog(id)), logListSchema) ?? [];
}

export async function appendFloorLog(id: number, entry: MoveLogEntry): Promise<void> {
  const log = await getFloorLog(id);
  log.push(entry);
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  await redis.set(keys.floorLog(id), JSON.stringify(log));
}

export async function getFloorLastMoveAt(id: number): Promise<number | null> {
  const raw = await redis.get(keys.floorLastMoveAt(id));
  if (!raw) return null;
  const t = Number(raw);
  return Number.isFinite(t) ? t : null;
}

export async function setFloorLastMoveAt(id: number, at: number): Promise<void> {
  await redis.set(keys.floorLastMoveAt(id), String(at));
}

export function freshFloorState(entrance: { x: number; y: number }): FloorState {
  return { v: 1, hero: { ...entrance }, hp: MAX_HP, moves: 0, deaths: 0, status: "open", clearedAt: null };
}

/**
 * Ensures today's floor exists (idempotent). If no floor exists yet — or the
 * stored floor is older than today's — creates today's floor, closes the
 * previous one (open ⇒ failed retreat), and archives it. This is the
 * resilience path: the daily cron calls it too, but any request can repair
 * a missed cron tick.
 */
export async function ensureCurrentFloor(now: number): Promise<{ id: number; gen: FloorGen; state: FloorState }> {
  const todayId = floorIdAt(now);

  const existingId = await getCurrentFloorId();
  if (existingId === null) {
    await openFloor(todayId, now);
    const gen = await mustGetGen(todayId);
    const state = await mustGetState(todayId);
    return { id: todayId, gen, state };
  }

  if (existingId >= todayId) {
    const gen = await mustGetGen(existingId);
    const state = await mustGetState(existingId);
    return { id: existingId, gen, state };
  }

  // A previous floor is still current — close it out, then open today's.
  await closeFloor(existingId, "failed", now);
  await openFloor(todayId, now);
  const gen = await mustGetGen(todayId);
  const state = await mustGetState(todayId);
  return { id: todayId, gen, state };
}

/** Creates the floor's gen + state if they do not exist yet (idempotent per id). */
export async function openFloor(id: number, now: number): Promise<void> {
  const existingGen = await getFloorGen(id);
  if (existingGen) return;

  const gen = generateFloor(id, floorSeedFor(id));
  await redis.set(keys.floorGen(id), JSON.stringify(gen));

  const existingState = await getFloorState(id);
  if (!existingState) {
    await setFloorState(id, freshFloorState(gen.entrance));
  }
  await setFloorLastMoveAt(id, now);
  const currentId = await getCurrentFloorId();
  if (currentId === null || currentId < id) {
    await setCurrentFloorId(id);
  }
}

/** Marks a floor cleared/failed and archives its summary. */
export async function closeFloor(id: number, status: "cleared" | "failed", now: number): Promise<void> {
  const state = await getFloorState(id);
  if (!state) return;
  if (state.status === "open") {
    state.status = status;
    state.clearedAt = now;
    await setFloorState(id, state);
  }
  await archiveFloor(id);
}

export async function archiveFloor(id: number): Promise<void> {
  const gen = await getFloorGen(id);
  const state = await getFloorState(id);
  if (!gen || !state) return;
  const log = await getFloorLog(id);
  const movers = new Set(log.map((e) => e.u).filter((u) => u !== "Slog")).size;
  const summary: FloorSummary = {
    id,
    status: state.status,
    moves: state.moves,
    movers,
    deaths: state.deaths,
    flavor: gen.flavor,
  };
  await redis.zAdd(keys.archive, { member: JSON.stringify(summary), score: -id });
  // Keep the newest ARCHIVE_CAP summaries.
  await redis.zRemRangeByRank(keys.archive, ARCHIVE_CAP, -1);
}

export async function getArchive(limit = 20): Promise<FloorSummary[]> {
  const raw = await redis.zRange(keys.archive, 0, limit - 1);
  const summaries: FloorSummary[] = [];
  for (const item of raw) {
    const parsed = readJson(item.member, floorSummarySchema);
    if (parsed) summaries.push(parsed);
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// Move budget — one shared move per user per floor, enforced by Redis NX
// ---------------------------------------------------------------------------

export async function trySpendMove(id: number, username: string, now: number): Promise<boolean> {
  const endsAt = floorEndsAt(id);
  const expiration = new Date(Math.max(endsAt, now + 1000));
  const result = await redis.set(keys.mover(id, username), "1", { nx: true, expiration });
  return result === "OK";
}

export async function hasMoveLeft(id: number, username: string): Promise<boolean> {
  return !(await redis.exists(keys.mover(id, username)));
}

/**
 * Removes a user's move budget for a floor. Only valid in the same request
 * that created the budget via trySpendMove — used to refund illegal actions
 * so a stray tap never burns the daily move.
 */
export async function refundMove(id: number, username: string): Promise<void> {
  await redis.del(keys.mover(id, username));
}

// ---------------------------------------------------------------------------
// Optimistic concurrency — the trust core
//
// Moves are applied with Redis WATCH transactions instead of lock keys:
// read state+log, compute the next state (pure rules), then watch+multi+set+exec.
// If another request applied a move in between, EXEC aborts and the caller
// retries the whole read-validate-commit cycle. No locks to leak, no TTL
// takeover races, and the version counter `v` makes every update explicit.
// ---------------------------------------------------------------------------

export type CommitResult = "committed" | "conflict" | "error";

/**
 * Atomically commits a new FloorState + move log for a floor.
 * Returns "conflict" when another writer won the race (caller retries the
 * read-validate-commit cycle) and "error" on infrastructure failure.
 */
export async function commitFloorUpdate(id: number, state: FloorState, log: MoveLogEntry[]): Promise<CommitResult> {
  try {
    const tx = await redis.watch(keys.floorState(id), keys.floorLog(id));
    await tx.multi();
    await tx.set(keys.floorState(id), JSON.stringify(state));
    await tx.set(keys.floorLog(id), JSON.stringify(log));
    const results = await tx.exec();
    // An aborted WATCH transaction returns an empty result set.
    if (!results || results.length < 2) return "conflict";
    return "committed";
  } catch {
    return "error";
  }
}

// ---------------------------------------------------------------------------
// Streaks & practice bests
// ---------------------------------------------------------------------------

export type Streak = { n: number; last: number };

export async function getStreak(username: string): Promise<Streak> {
  return readJson(await redis.get(keys.streak(username)), streakSchema) ?? { n: 0, last: 0 };
}

export async function setStreak(username: string, streak: Streak): Promise<void> {
  await redis.set(keys.streak(username), JSON.stringify(streak));
}

export async function getBest(username: string): Promise<number | null> {
  const raw = await redis.get(keys.best(username));
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setBestIfLower(username: string, moves: number): Promise<boolean> {
  const current = await getBest(username);
  if (current === null || moves < current) {
    await redis.set(keys.best(username), String(moves));
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mustGetGen(id: number): Promise<FloorGen> {
  const gen = await getFloorGen(id);
  if (!gen) throw new Error(`floor ${id} gen missing after ensure`);
  return gen;
}

async function mustGetState(id: number): Promise<FloorState> {
  const state = await getFloorState(id);
  if (!state) throw new Error(`floor ${id} state missing after ensure`);
  return state;
}
