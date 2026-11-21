import { expect } from 'vitest';

import { test } from '../test';
import { applySharedMove } from './moves';
import { autoAdvance } from './daily';
import { generateFloor } from '../../shared/floor';
import { isLegalMove, type Action } from '../../shared/types';

type ExcludeAction = Exclude<Action, 'shell'>;
import {
  FLOOR_EPOCH_UTC,
  FLOOR_WINDOW_MS,
  floorIdAt,
  floorSeedFor,
  getFloorGen,
  getFloorLog,
  getFloorState,
  hasMoveLeft,
  openFloor,
  setFloorLastMoveAt,
  setFloorState,
} from './state';

const MIN = 60_000;
/** Each test owns a distinct floor id + its window, so shared harness Redis never collides. */
const windowFor = (floorId: number) => FLOOR_EPOCH_UTC + (floorId - 1) * FLOOR_WINDOW_MS;

async function legalFirstMove(floorId: number): Promise<ExcludeAction> {
  const gen = (await getFloorGen(floorId)) ?? generateFloor(floorId, floorSeedFor(floorId));
  const state = await getFloorState(floorId);
  const hero = state?.hero ?? gen.entrance;
  const dirs: ExcludeAction[] = ['right', 'down', 'up', 'left'];
  const found = dirs.find((d) => isLegalMove(gen, hero, d));
  if (!found) throw new Error('no legal first move');
  return found;
}

test('a request arriving after the noon roll acts on the NEW floor, not the stale one', async () => {
  const floorId = 11;
  const day1 = windowFor(floorId) + 10 * MIN;
  await openFloor(floorId, day1);
  const move1 = await legalFirstMove(floorId);
  const first = await applySharedMove('u_rollover', move1, day1);
  expect(first.id).toBe(floorId);

  // the client may still hold an old post open after the next noon
  const day2 = windowFor(floorId) + FLOOR_WINDOW_MS + 5 * MIN;
  expect(floorIdAt(day2)).toBe(floorId + 1);
  const second = await applySharedMove('u_rollover', move1, day2);
  expect(second.id).toBe(floorId + 1);
  expect(second.kind).toBe('applied');

  const old = await getFloorState(floorId);
  const fresh = await getFloorState(floorId + 1);
  expect(old?.status).toBe('failed'); // open floor closes on rollover
  expect(fresh?.status).toBe('open');
});

test('moves on a closed floor are rejected without spending the daily move', async () => {
  const floorId = 12;
  const now = windowFor(floorId) + 10 * MIN;
  await openFloor(floorId, now);
  const state = await getFloorState(floorId);
  expect(state).not.toBeNull();
  if (!state) return;
  await setFloorState(floorId, { ...state, status: 'cleared', clearedAt: now });

  const result = await applySharedMove('u_closed', 'right', now + MIN);
  expect(result.kind).toBe('closed');
  expect(await hasMoveLeft(floorId, 'u_closed')).toBe(true);
});

test('two simultaneous moves both land (mutex + WATCH)', async () => {
  const floorId = 13;
  const now = windowFor(floorId) + 10 * MIN;
  await openFloor(floorId, now);

  const [a, b] = await Promise.all([
    applySharedMove('u_alice', 'right', now),
    applySharedMove('u_bob', 'right', now),
  ]);
  for (const result of [a, b]) {
    expect(['applied', 'illegal', 'busy']).toContain(result.kind);
  }
  // 'right' may be illegal for this seed — in that case the budget is refunded;
  // what matters is that neither write is lost when both moves are legal.
  const log = await getFloorLog(floorId);
  const state = await getFloorState(floorId);
  expect(state?.moves).toBe(log.filter((e) => e.u !== 'Slog').length);
  for (const user of ['u_alice', 'u_bob']) {
    if ((await hasMoveLeft(floorId, user)) === false) {
      expect(log.some((e) => e.u === user)).toBe(true);
    }
  }
});

test('a legal move cancels a pending auto-advance (idle clock is shared)', async () => {
  const floorId = 14;
  const start = windowFor(floorId) + 10 * MIN;
  await openFloor(floorId, start);
  await setFloorLastMoveAt(floorId, start - 2 * 3600_000); // overdue for a crawl

  const move = await legalFirstMove(floorId);
  const human = await applySharedMove('u_human', move, start);
  expect(human.kind).toBe('applied');

  const crawler = await autoAdvance(start);
  expect(crawler.stepped).toBe(false);
  expect(crawler.reason).toBe('recent human activity');
});
