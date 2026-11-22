/**
 * Move application — the trust core of Slog.
 *
 * Every rule is enforced here, server-side only:
 *   - the client never asserts state or identity;
 *   - one shared move per user per floor (Redis SETNX budget);
 *   - actions are validated against the deterministic floor generation;
 *   - commits are optimistic (WATCH) with bounded retries;
 *   - an illegal action is refunded — a stray tap never burns the daily move.
 */

import { context, reddit } from "@devvit/web/server";

import { hashString } from "../../shared/rng";
import type { Action, FloorGen, FloorState, MoveLogEntry, Pos, Twist } from "../../shared/types";
import { DIRECTIONS, isLegalMove, MAX_HP, tileAt } from "../../shared/types";
import {
  commitFloorUpdate,
  ensureCurrentFloor,
  floorIdAt,
  floorSeedFor,
  getFloorLog,
  getFloorState,
  getStreak,
  nextStreak,
  acquireMoveTurn,
  releaseMoveTurn,
  setFloorLastMoveAt,
  setSnoo,
  setStreak,
  trySpendMove,
  refundMove,
} from "./state";

export type MoveEvent = "moved" | "shell" | "salt" | "dew" | "cleared" | "failed";

export type ApplyOutcome =
  | { ok: true; state: FloorState; event: MoveEvent }
  | { ok: false; reason: "illegal" | "closed" };

const LOG_CAP = 250;
const RETRIES = 3;

/**
 * Pure transition for a single shared action. No I/O — fully unit-testable.
 * `username` feeds the contribution-role counters; `twist` gates the shell.
 */
export function applyAction(
  gen: FloorGen,
  state: FloorState,
  action: Action,
  now: number,
  username: string,
  twist: Twist = gen.twist,
): ApplyOutcome {
  if (state.status !== "open") return { ok: false, reason: "closed" };

  if (action === "shell") {
    if (twist === "restless") return { ok: false, reason: "illegal" };
    const rested: FloorState = {
      ...state,
      v: state.v + 1,
      moves: state.moves + 1,
      hp: Math.min(state.hp + 1, MAX_HP),
      medicBy: state.medicBy ?? (state.hp < MAX_HP ? username : null),
    };
    return { ok: true, state: rested, event: "shell" };
  }

  // action is one of the four directions here — narrowed without a cast.
  if (!isLegalMove(gen, state.hero, action)) return { ok: false, reason: "illegal" };

  const d = DIRECTIONS[action];
  const next: Pos = { x: state.hero.x + d.x, y: state.hero.y + d.y };
  const tile = tileAt(gen, next);

  let event: MoveEvent = "moved";
  let hp = state.hp;
  let status: FloorState["status"] = state.status;
  let deaths = state.deaths;
  let clearedAt: number | null = null;
  const collected = [...state.collected];
  const saltBy = { ...state.saltBy };
  const medicBy = state.medicBy;
  let bestStep = state.bestStep;
  let finisherBy = state.finisherBy;

  const alreadyCollected = collected.some((p) => p.x === next.x && p.y === next.y);

  if (tile === "salt") {
    hp -= 1;
    saltBy[username] = (saltBy[username] ?? 0) + 1;
    if (hp <= 0) {
      event = "failed";
      status = "failed";
      deaths += 1;
      clearedAt = now;
    } else {
      event = "salt";
    }
  } else if (tile === "dew" && !alreadyCollected) {
    // Dew is the community's medicine: heal one heart, consume the drop.
    hp = Math.min(hp + 1, MAX_HP);
    collected.push({ ...next });
    event = "dew";
  } else if (tile === "burrow") {
    event = "cleared";
    status = "cleared";
    clearedAt = now;
    finisherBy = username;
  }

  // Pathfinder: the single biggest step toward the burrow this floor.
  const distNow = Math.abs(state.hero.x - gen.burrow.x) + Math.abs(state.hero.y - gen.burrow.y);
  const distNext = Math.abs(next.x - gen.burrow.x) + Math.abs(next.y - gen.burrow.y);
  const gain = distNow - distNext;
  if (gain > 0 && (!bestStep || gain > bestStep.gain)) {
    bestStep = { u: username, gain };
  }

  const nextState: FloorState = {
    ...state,
    v: state.v + 1,
    hero: next,
    hp,
    moves: state.moves + 1,
    deaths,
    status,
    clearedAt,
    collected,
    saltBy,
    medicBy,
    bestStep,
    finisherBy,
  };
  return { ok: true, state: nextState, event };
}

export type MoveResult =
  | { kind: "applied"; id: number; state: FloorState; log: MoveLogEntry[]; event: MoveEvent; streak: number }
  | { kind: "already-moved"; id: number; state: FloorState; log: MoveLogEntry[]; streak: number }
  | { kind: "closed"; id: number; state: FloorState; log: MoveLogEntry[]; streak: number }
  | { kind: "illegal"; id: number; state: FloorState; log: MoveLogEntry[]; message: string; streak: number }
  | { kind: "busy"; id: number; state: FloorState; log: MoveLogEntry[]; streak: number };

/**
 * Applies one shared move for `username`. Callers pass the identity resolved
 * from the request context — never a client-supplied name.
 */
export async function applySharedMove(username: string, action: Action, now: number): Promise<MoveResult> {
  // Serialize move application: the WATCH commit is the correctness layer,
  // this short-TTL mutex keeps concurrent writers from racing in practice.
  let turn: string | null = null;
  for (let i = 0; i < 14; i++) {
    turn = await acquireMoveTurn(floorIdAt(now), now);
    if (turn) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!turn) {
    const { id, state } = await ensureCurrentFloor(now);
    return { kind: "busy", id, state, log: await getFloorLog(id), streak: (await getStreak(username)).n };
  }

  try {
    const { id, gen, state } = await ensureCurrentFloor(now);

    const view = async (): Promise<{ state: FloorState; log: MoveLogEntry[]; streak: number }> => {
      const fresh = (await getFloorState(id)) ?? state;
      const log = await getFloorLog(id);
      const streak = await getStreak(username);
      return { state: fresh, log, streak: streak.n };
    };

    if (state.status !== "open") {
      const v = await view();
      return { kind: "closed", id, ...v };
    }

    // One shared move per user per floor — the SETNX budget is the law.
    const spent = await trySpendMove(id, username, now);
    if (!spent) {
      const v = await view();
      return { kind: "already-moved", id, ...v };
    }

    for (let attempt = 0; attempt < RETRIES; attempt++) {
      const current = (await getFloorState(id)) ?? state;
      const outcome = applyAction(gen, current, action, now, username);

      if (!outcome.ok) {
        if (outcome.reason === "illegal") {
          // Refund: an illegal action never happened and must not burn the move.
          await refundMove(id, username);
          const v = await view();
          return { kind: "illegal", id, ...v, message: "That way is solid rock — your move is safe for today." };
        }
        const v = await view();
        return { kind: "closed", id, ...v };
      }

      const entry: MoveLogEntry = { u: username, action, t: now };
      const log = await getFloorLog(id);
      log.push(entry);
      if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);

      const commit = await commitFloorUpdate(id, outcome.state, log);
      if (commit === "committed") {
        // A human move resets the idle clock — Slog only crawls when alone.
        await setFloorLastMoveAt(id, now);
        // Streaks count floors with at least one applied move.
        const streak = await getStreak(username);
        if (streak.last !== id) {
          const next = nextStreak(streak, id);
          await setStreak(username, next);
          // Native identity extras — best-effort, never block the move (T14/T15).
          await applyIdentityExtras(username, next.n);
          return { kind: "applied", id, state: outcome.state, log, event: outcome.event, streak: next.n };
        }
        return { kind: "applied", id, state: outcome.state, log, event: outcome.event, streak: streak.n };
      }
      if (commit === "error") {
        const v = await view();
        return { kind: "busy", id, ...v };
      }
      // conflict → retry the read-validate-commit cycle
    }
    const v = await view();
    return { kind: "busy", id, ...v };
  } finally {
    await releaseMoveTurn(floorIdAt(now), turn);
  }
}

// ---------------------------------------------------------------------------
// Native identity extras (Should Ship / Stretch) — all failures are swallowed
// so a Reddit API hiccup can never burn a player's move.
// ---------------------------------------------------------------------------

async function applyIdentityExtras(username: string, streakN: number): Promise<void> {
  const subredditName = context?.subredditName;
  if (!subredditName) return; // test harness / no request context

  await Promise.allSettled([
    reddit.setUserFlair({
      subredditName,
      username,
      text: `🐌🔥${streakN}`,
      backgroundColor: "#FFB84D",
      textColor: "dark",
    }),
    (async () => {
      const url = await reddit.getSnoovatarUrl(username);
      if (url) await setSnoo(username, url);
    })(),
  ]);
}

// ---------------------------------------------------------------------------
// Practice Tunnels — unlimited solo floors, no effect on the shared run
// ---------------------------------------------------------------------------

export function practiceSeed(username: string, floorId: number, attempt: number): number {
  return (hashString(username) ^ floorSeedFor(floorId)) + attempt * 101;
}
