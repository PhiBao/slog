/**
 * Practice Tunnels — unlimited solo floors per user, zero effect on the
 * shared run. Exists so a lone judge at 3am experiences the full game and
 * so players can learn the day's hazards risk-free.
 *
 * Storage: slog:practice:{user}:{floorId} → { attempt, state } JSON.
 * The tunnel for a given (user, floor, attempt) is deterministic, so
 * restarting is instant and identical for everyone involved.
 */

import { redis } from "@devvit/web/server";
import { z } from "zod";

import { generateFloor } from "../../shared/floor";
import { practiceRecordSchema } from "../../shared/schemas";
import { MAX_HP, type FloorGen, type FloorState } from "../../shared/types";
import { applyAction, practiceSeed, type MoveEvent } from "./moves";
import { getBest, setBestIfLower } from "./state";

const practiceKey = (username: string, floorId: number) => `slog:practice:${username.toLowerCase()}:${floorId}`;

function readJson<S extends z.ZodType>(raw: string | undefined, schema: S): z.output<S> | null {
  if (!raw) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type PracticeView = {
  floorId: number;
  attempt: number;
  gen: FloorGen;
  state: FloorState;
  best: number | null;
};

export async function getPractice(username: string, floorId: number): Promise<PracticeView> {
  const raw = await redis.get(practiceKey(username, floorId));
  const record = readJson(raw, practiceRecordSchema);
  const attempt = record?.attempt ?? 0;
  const state: FloorState =
    record?.state ?? { v: 1, hero: { x: 0, y: 0 }, hp: MAX_HP, moves: 0, deaths: 0, status: "open", clearedAt: null };
  const gen = generateFloor(floorId, practiceSeed(username, floorId, attempt));
  const best = await getBest(username);
  return { floorId, attempt, gen, state, best };
}

export type PracticeMoveResult = {
  kind: "applied" | "illegal" | "closed";
  view: PracticeView;
  event?: MoveEvent;
};

export async function movePractice(
  username: string,
  floorId: number,
  action: Parameters<typeof applyAction>[2],
  now: number
): Promise<PracticeMoveResult> {
  const view = await getPractice(username, floorId);
  const outcome = applyAction(view.gen, view.state, action, now);

  if (!outcome.ok) {
    return { kind: outcome.reason === "closed" ? "closed" : "illegal", view };
  }

  if (view.state.status !== "open") {
    return { kind: "closed", view };
  }

  await redis.set(
    practiceKey(username, floorId),
    JSON.stringify({ attempt: view.attempt, state: outcome.state })
  );

  if (outcome.event === "cleared") {
    await setBestIfLower(username, outcome.state.moves);
  }

  const fresh = await getPractice(username, floorId);
  return { kind: "applied", view: fresh, event: outcome.event };
}

/** Starts a fresh tunnel (new deterministic attempt number). */
export async function resetPractice(username: string, floorId: number): Promise<PracticeView> {
  const view = await getPractice(username, floorId);
  const attempt = view.attempt + 1;
  const state: FloorState = { v: 1, hero: { x: 0, y: 0 }, hp: MAX_HP, moves: 0, deaths: 0, status: "open", clearedAt: null };
  await redis.set(practiceKey(username, floorId), JSON.stringify({ attempt, state }));
  return getPractice(username, floorId);
}
