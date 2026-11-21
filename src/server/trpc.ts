import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { reddit } from '@devvit/web/server';

import { transformer } from '../shared/transformer';
import type { Context } from './context';
import { applySharedMove } from './core/moves';
import { getPractice, movePractice, resetPractice } from './core/practice';
import { ensureCurrentFloor, getArchive, getFloorLog, hasMoveLeft, getStreak, floorEndsAt } from './core/state';

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
  transformer,
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

const actionSchema = z.enum(['up', 'down', 'left', 'right', 'shell']);

export const appRouter = t.router({
  /**
   * Light payload for the inline feed card (splash entrypoint) — no board,
   * no log: just enough to make the feed card alive and clickable.
   */
  splash: publicProcedure.query(async () => {
    const now = Date.now();
    const { id, gen, state } = await ensureCurrentFloor(now);
    return {
      id,
      flavor: gen.flavor,
      status: state.status,
      moves: state.moves,
      hp: state.hp,
      endsAt: floorEndsAt(id),
    };
  }),

  /**
   * Everything the client needs to render the current shared floor.
   * Identity comes from the platform — the client never asserts a username.
   */
  floor: publicProcedure.query(async () => {
    const now = Date.now();
    const username = await reddit.getCurrentUsername();
    const { id, gen, state } = await ensureCurrentFloor(now);

    if (!username) {
      return { id, gen, state, log: await getFloorLog(id), username: null, yourMoveLeft: false, streak: 0 };
    }

    const [log, yourMoveLeft, streak] = await Promise.all([
      getFloorLog(id),
      hasMoveLeft(id, username),
      getStreak(username),
    ]);
    return { id, gen, state, log, username, yourMoveLeft, streak: streak.n };
  }),

  /**
   * Applies the user's one shared move for today's floor.
   */
  move: publicProcedure
    .input(actionSchema)
    .mutation(async ({ input }) => {
      const username = await reddit.getCurrentUsername();
      if (!username) {
        return { kind: 'not-signed-in' as const };
      }
      return applySharedMove(username, input, Date.now());
    }),

  /**
   * Practice Tunnels — unlimited solo floors, never touching the shared run.
   */
  practice: publicProcedure.query(async () => {
    const username = await reddit.getCurrentUsername();
    const now = Date.now();
    if (!username) {
      return null;
    }
    const { id } = await ensureCurrentFloor(now);
    return getPractice(username, id);
  }),

  practiceMove: publicProcedure
    .input(actionSchema)
    .mutation(async ({ input }) => {
      const username = await reddit.getCurrentUsername();
      const now = Date.now();
      if (!username) {
        return null;
      }
      const { id } = await ensureCurrentFloor(now);
      return movePractice(username, id, input, now);
    }),

  practiceReset: publicProcedure.mutation(async () => {
    const username = await reddit.getCurrentUsername();
    const now = Date.now();
    if (!username) {
      return null;
    }
    const { id } = await ensureCurrentFloor(now);
    return resetPractice(username, id);
  }),

  /**
   * Past floors — the community's visible history.
   */
  archive: publicProcedure.query(async () => {
    return getArchive(20);
  }),
});

export type AppRouter = typeof appRouter;
