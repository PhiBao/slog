/**
 * The daily engine — floor rolls, arena posts, and Slog's idle crawl.
 *
 * Called by the cron scheduler (noon UTC daily + every 10 minutes) and by a
 * mod menu action. Everything is idempotent: a retried cron tick can never
 * double-post or double-roll.
 */

import { reddit, redis } from "@devvit/web/server";

import type { Action, MoveLogEntry, Pos } from "../../shared/types";
import { isLegalMove, tileAt } from "../../shared/types";
import { applyAction } from "./moves";
import {
  commitFloorUpdate,
  ensureCurrentFloor,
  getFloorLastMoveAt,
  getFloorLog,
  getFloorState,
  setFloorLastMoveAt,
} from "./state";

const postIdKey = (id: number) => `slog:floor:${id}:postId`;

async function redisGet(key: string): Promise<string | null> {
  const value = await redis.get(key);
  return value ?? null;
}
async function redisSet(key: string, value: string): Promise<void> {
  await redis.set(key, value);
}

export const FLOOR_POST_TITLE = (id: number, flavor: string) => `Slog — Floor #${id} · ${flavor}`;

/**
 * Rolls to today's floor (closing yesterday's) and ensures the arena post
 * exists. Idempotent per floor id.
 */
export async function rollDailyFloor(now: number): Promise<{ id: number; postId: string | null; created: boolean }> {
  const { id, gen } = await ensureCurrentFloor(now);

  const existing = await redisGet(postIdKey(id));
  if (existing) {
    return { id, postId: existing, created: false };
  }

  let postId: string | null = null;
  try {
    const post = await reddit.submitCustomPost({ title: FLOOR_POST_TITLE(id, gen.flavor) });
    postId = post.id;
    await redisSet(postIdKey(id), postId);
  } catch (error) {
    // State stays consistent without the post; the next tick retries.
    console.error("failed to submit daily floor post", error);
  }
  return { id, postId, created: postId !== null };
}

export const AUTO_ADVANCE_IDLE_MS = 30 * 60 * 1000;
export const AUTO_ADVANCE_LOG_NAME = "Slog";

/**
 * Slog crawls one safe step on his own when nobody has moved for a while —
 * thematic, keeps every floor alive, and guarantees resolution. Never steps
 * onto salt, never onto the burrow (humans finish the day), and never when
 * any human move is adjacent to the goal.
 */
export async function autoAdvance(now: number): Promise<{ stepped: boolean; reason: string }> {
  const { id, gen } = await ensureCurrentFloor(now);
  const state = await getFloorState(id);
  if (!state) return { stepped: false, reason: "no state" };
  if (state.status !== "open") return { stepped: false, reason: "closed" };

  const lastMoveAt = (await getFloorLastMoveAt(id)) ?? 0;
  if (now - lastMoveAt < AUTO_ADVANCE_IDLE_MS) return { stepped: false, reason: "recent human activity" };

  // Humans must land the finishing step — pause when the goal is one legal
  // human move away.
  const dirs: ReadonlyArray<Exclude<Action, "shell">> = ["up", "right", "down", "left"];
  const legal = dirs.filter((a) => isLegalMove(gen, state.hero, a));
  const oneStepFromGoal = legal.some((a) => {
    if (a === "up") return state.hero.y - 1 === gen.burrow.y && state.hero.x === gen.burrow.x;
    if (a === "down") return state.hero.y + 1 === gen.burrow.y && state.hero.x === gen.burrow.x;
    if (a === "left") return state.hero.x - 1 === gen.burrow.x && state.hero.y === gen.burrow.y;
    return state.hero.x + 1 === gen.burrow.x && state.hero.y === gen.burrow.y;
  });
  if (oneStepFromGoal) return { stepped: false, reason: "one step from the burrow" };

  // Pick the safe step that makes the most progress toward the burrow.
  const dist = (p: Pos) => Math.abs(p.x - gen.burrow.x) + Math.abs(p.y - gen.burrow.y);
  let best: Exclude<Action, "shell"> | null = null;
  let bestDist = dist(state.hero);
  for (const a of dirs) {
    if (!isLegalMove(gen, state.hero, a)) continue;
    const d = a === "up" ? { x: 0, y: -1 } : a === "down" ? { x: 0, y: 1 } : a === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
    const next = { x: state.hero.x + d.x, y: state.hero.y + d.y };
    const tile = tileAt(gen, next);
    if (tile === "salt" || tile === "burrow") continue;
    const nd = dist(next);
    if (nd < bestDist || (nd === bestDist && best === null)) {
      best = a;
      bestDist = nd;
    }
  }
  if (!best) return { stepped: false, reason: "no safe step" };

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getFloorState(id);
    if (!current || current.status !== "open") return { stepped: false, reason: "closed" };
    const outcome = applyAction(gen, current, best, now);
    if (!outcome.ok) return { stepped: false, reason: "illegal under current state" };
    const log = await getFloorLog(id);
    const entry: MoveLogEntry = { u: AUTO_ADVANCE_LOG_NAME, action: best, t: now };
    log.push(entry);
    if (log.length > 250) log.splice(0, log.length - 250);
    const commit = await commitFloorUpdate(id, outcome.state, log);
    if (commit === "committed") {
      await setFloorLastMoveAt(id, now);
      return { stepped: true, reason: `crawled ${best}` };
    }
    if (commit === "error") return { stepped: false, reason: "commit error" };
  }
  return { stepped: false, reason: "conflict" };
}

/** Stores the arena post id for a floor (used by install/first-run paths). */
export async function recordFloorPost(id: number, postId: string): Promise<void> {
  await redisSet(postIdKey(id), postId);
}

export async function getFloorPostId(id: number): Promise<string | null> {
  return redisGet(postIdKey(id));
}
