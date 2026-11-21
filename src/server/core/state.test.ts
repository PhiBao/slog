import { expect } from "vitest";

import { test } from "../test";
import {
  ARCHIVE_CAP,
  archiveFloor,
  ensureCurrentFloor,
  floorEndsAt,
  floorIdAt,
  floorSeedFor,
  FLOOR_EPOCH_UTC,
  FLOOR_WINDOW_MS,
  getArchive,
  getFloorGen,
  getFloorState,
  getStreak,
  hasMoveLeft,
  nextStreak,
  openFloor,
  rateLimit,
  setBestIfLower,
  setSnoo,
  getSnoo,
  setStreak,
  setFloorState,
  commitFloorUpdate,
  trySpendMove,
  getFloorLog,
} from "./state";

test("floor id arithmetic anchors to the epoch and closes 24h later", async () => {
  expect(floorIdAt(FLOOR_EPOCH_UTC)).toBe(1);
  expect(floorIdAt(FLOOR_EPOCH_UTC - 3600_000)).toBe(1); // launch grace: before the first reset
  expect(floorIdAt(FLOOR_EPOCH_UTC + FLOOR_WINDOW_MS - 1)).toBe(1);
  expect(floorIdAt(FLOOR_EPOCH_UTC + FLOOR_WINDOW_MS)).toBe(2);
  expect(floorEndsAt(1)).toBe(FLOOR_EPOCH_UTC + FLOOR_WINDOW_MS);
  expect(floorSeedFor(1)).not.toBe(floorSeedFor(2));
});

test("openFloor is idempotent and ensureCurrentFloor creates today's floor", async () => {
  const now = FLOOR_EPOCH_UTC + 5000;
  await openFloor(1, now);

  const first = await getFloorGen(1);
  expect(first).not.toBeNull();
  expect(first?.id).toBe(1);

  // Opening again must not overwrite the generation.
  await openFloor(1, now);
  const second = await getFloorGen(1);
  expect(JSON.stringify(second)).toBe(JSON.stringify(first));

  const state = await getFloorState(1);
  expect(state?.status).toBe("open");
  expect(state?.hp).toBe(3);
  expect(state?.hero).toEqual({ x: 0, y: 0 });

  const ensured = await ensureCurrentFloor(now);
  expect(ensured.id).toBe(1);
});

test("each user gets exactly one shared move per floor (Redis NX budget)", async () => {
  const now = FLOOR_EPOCH_UTC + 5000;
  await openFloor(1, now);

  expect(await hasMoveLeft(1, "u_example")).toBe(true);
  expect(await trySpendMove(1, "u_example", now)).toBe(true);
  expect(await hasMoveLeft(1, "u_example")).toBe(false);
  expect(await trySpendMove(1, "u_example", now)).toBe(false);

  // a different user still has their move
  expect(await trySpendMove(1, "u_other", now)).toBe(true);
});

test("commitFloorUpdate writes state and log atomically", async () => {
  const now = FLOOR_EPOCH_UTC + 5000;
  await openFloor(1, now);

  const state = (await getFloorState(1))!;
  state.moves += 1;
  state.v += 1;
  const log = await getFloorLog(1);
  log.push({ u: "u_example", action: "right", t: now });

  const result = await commitFloorUpdate(1, state, log);
  expect(result).toBe("committed");

  const after = await getFloorState(1);
  expect(after?.moves).toBe(1);
  expect((await getFloorLog(1)).length).toBe(1);
});

test("streaks and practice bests persist", async () => {
  expect(await getStreak("u_example")).toEqual({ n: 0, last: 0, graceAt: 0 });
  await setStreak("u_example", { n: 3, last: 7, graceAt: 0 });
  expect(await getStreak("u_example")).toEqual({ n: 3, last: 7, graceAt: 0 });
});

test("nextStreak applies consecutive, grace, and reset rules", async () => {
  // consecutive floors grow the streak
  expect(nextStreak({ n: 3, last: 6, graceAt: 0 }, 7)).toEqual({ n: 4, last: 7, graceAt: 0 });
  // missing exactly one floor uses the freeze (once per rolling 7 floors)
  expect(nextStreak({ n: 4, last: 7, graceAt: 0 }, 9)).toEqual({ n: 5, last: 9, graceAt: 9 });
  // a second miss inside the window resets to 1
  expect(nextStreak({ n: 5, last: 9, graceAt: 9 }, 11)).toEqual({ n: 1, last: 11, graceAt: 9 });
  // after the freeze window expires, missing exactly one floor grants a new grace
  expect(nextStreak({ n: 5, last: 15, graceAt: 9 }, 17)).toEqual({ n: 6, last: 17, graceAt: 17 });
  // missing many floors resets the streak regardless
  expect(nextStreak({ n: 5, last: 9, graceAt: 9 }, 17)).toEqual({ n: 1, last: 17, graceAt: 9 });
  // same floor participation never double-counts
  expect(nextStreak({ n: 2, last: 7, graceAt: 0 }, 7)).toEqual({ n: 2, last: 7, graceAt: 0 });

  expect(await setBestIfLower("u_example", 42)).toBe(true);
  expect(await setBestIfLower("u_example", 31)).toBe(true);
  expect(await setBestIfLower("u_example", 55)).toBe(false);
  expect(await setBestIfLower("u_example", 31)).toBe(false);
});

test("rateLimit uses a fixed window and blocks after the cap", async () => {
  const key = "slog:test:ratelimit";
  for (let i = 0; i < 3; i++) expect(await rateLimit(key, 3, 60_000)).toBe(true);
  expect(await rateLimit(key, 3, 60_000)).toBe(false);
  expect(await rateLimit(key, 3, 60_000)).toBe(false);
});

test("snoovatar cache rejects non-https URLs", async () => {
  await setSnoo("u_snoo", "javascript:alert(1)");
  expect(await getSnoo("u_snoo")).toBeNull();
  await setSnoo("u_snoo", "https://snoovatar.reddit.com/u_snoo.png");
  expect(await getSnoo("u_snoo")).toBe("https://snoovatar.reddit.com/u_snoo.png");
});

test("archive keeps only the newest summaries", async () => {
  for (let id = 1; id <= ARCHIVE_CAP + 5; id++) {
    await openFloor(id, FLOOR_EPOCH_UTC + id * 1000);
    const state = await getFloorState(id);
    if (state) {
      state.status = "cleared";
      state.moves = id * 10;
      await setFloorState(id, state);
    }
    await archiveFloor(id);
  }
  const archive = await getArchive(ARCHIVE_CAP + 10);
  expect(archive.length).toBeLessThanOrEqual(ARCHIVE_CAP);
  // newest first
  expect(archive[0]?.id).toBe(ARCHIVE_CAP + 5);
});
