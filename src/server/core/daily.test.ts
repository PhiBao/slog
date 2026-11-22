import { expect } from 'vitest';

import { test } from '../test';
import { autoAdvance, AUTO_ADVANCE_IDLE_MS, AUTO_ADVANCE_LOG_NAME, getFloorPostId, rollDailyFloor } from './daily';
import {
  FLOOR_EPOCH_UTC,
  FLOOR_WINDOW_MS,
  floorSeedFor,
  getFloorGen,
  getFloorLog,
  getFloorLastMoveAt,
  getFloorState,
  openFloor,
  setFloorLastMoveAt,
  setFloorState,
  closeFloor,
  getArchive,
} from './state';
import { generateFloor } from '../../shared/floor';

const MIN = 60_000;

test('auto-advance waits for idle, then crawls safely toward the burrow', async () => {
  const start = FLOOR_EPOCH_UTC + 10 * MIN;
  await openFloor(1, start);

  // fresh activity → no crawl
  const active = await autoAdvance(start + 5 * MIN);
  expect(active.stepped).toBe(false);

  // idle past the threshold → one safe step, logged as Slog
  const idle = await autoAdvance(start + AUTO_ADVANCE_IDLE_MS + MIN);
  expect(idle.stepped).toBe(true);
  const log = await getFloorLog(1);
  expect(log.some((e) => e.u === AUTO_ADVANCE_LOG_NAME)).toBe(true);
  const after = await getFloorState(1);
  expect(after?.moves).toBe(1);
  expect(await getFloorLastMoveAt(1)).toBe(start + AUTO_ADVANCE_IDLE_MS + MIN);
});

test('auto-advance never finishes the floor for the humans', async () => {
  const start = FLOOR_EPOCH_UTC + 10 * MIN;
  await openFloor(1, start);

  const state = await getFloorState(1);
  expect(state).not.toBeNull();
  if (!state) return;

  // Teleport the hero next to the burrow (test-only state overwrite).
  const realGen = generateFloor(1, floorSeedFor(1));
  const neighbors = [
    { x: realGen.burrow.x - 1, y: realGen.burrow.y },
    { x: realGen.burrow.x + 1, y: realGen.burrow.y },
    { x: realGen.burrow.x, y: realGen.burrow.y - 1 },
    { x: realGen.burrow.x, y: realGen.burrow.y + 1 },
  ];
  const spot = neighbors.find((p) => p.x >= 0 && p.y >= 0 && p.x < realGen.width && p.y < realGen.height);
  expect(spot).toBeDefined();
  if (!spot) return;

  await setFloorState(1, { ...state, hero: { ...spot } });
  await setFloorLastMoveAt(1, start);

  const result = await autoAdvance(start + AUTO_ADVANCE_IDLE_MS + 5 * MIN);
  expect(result.stepped).toBe(false);
  expect(result.reason).toBe('one step from the burrow');
});

test('auto-advance does nothing on a closed floor', async () => {
  const start = FLOOR_EPOCH_UTC + 10 * MIN;
  await openFloor(1, start);
  const state = await getFloorState(1);
  expect(state).not.toBeNull();
  if (!state) return;
  await setFloorState(1, { ...state, status: 'cleared', clearedAt: start });
  await setFloorLastMoveAt(1, start - AUTO_ADVANCE_IDLE_MS - MIN);

  const result = await autoAdvance(start + MIN);
  expect(result.stepped).toBe(false);
  expect(result.reason).toBe('closed');
});

test('rollDailyFloor is idempotent; a failed arena submission never corrupts state', async () => {
  // In the test harness there is no real Reddit API, so submission fails
  // gracefully — the roll itself must stay consistent and idempotent.
  const start = FLOOR_EPOCH_UTC + 10 * MIN;
  const first = await rollDailyFloor(start);
  expect(first.id).toBe(1);

  const second = await rollDailyFloor(start + MIN);
  expect(second.id).toBe(1);

  const gen = await getFloorGen(1);
  expect(gen).not.toBeNull();

  const postId = await getFloorPostId(1);
  if (postId) {
    expect(typeof postId).toBe('string');
  }
});

test('a floor rolls over cleanly at the next noon-UTC window', async () => {
  const day1 = FLOOR_EPOCH_UTC + 10 * MIN;
  await openFloor(1, day1);

  // someone cleared floor 1
  const state = await getFloorState(1);
  expect(state).not.toBeNull();
  if (state) {
    await setFloorState(1, { ...state, status: 'cleared', clearedAt: day1 + MIN });
  }

  // next window: floor 2 opens, floor 1 closes as cleared and archives
  const day2 = FLOOR_EPOCH_UTC + FLOOR_WINDOW_MS + 5 * MIN;
  const rolled = await rollDailyFloor(day2);
  expect(rolled.id).toBe(2);

  const floor1 = await getFloorState(1);
  expect(floor1?.status).toBe('cleared');
  const floor2 = await getFloorState(2);
  expect(floor2?.status).toBe('open');
  expect(floor2?.hero).toEqual({ x: 0, y: 0 });
});

test('closeFloor archives and never crashes when the recap comment cannot post', async () => {
  const now = FLOOR_EPOCH_UTC + 10 * MIN;
  await openFloor(1, now);
  const state = await getFloorState(1);
  expect(state).not.toBeNull();
  if (!state) return;
  await setFloorState(1, { ...state, status: 'open', moves: 7, deaths: 1, finisherBy: 'u_test', saltBy: { u_test: 1 } });

  // no arena post is recorded for this test floor → the recap must skip silently
  await closeFloor(1, 'cleared', now + MIN);
  const after = await getFloorState(1);
  expect(after?.status).toBe('cleared');
  const archive = await getArchive(5);
  expect(archive.some((e) => e.id === 1)).toBe(true);
});
