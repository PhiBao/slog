import { reddit } from '@devvit/web/server';
import { Hono } from 'hono';
import type { OnAppInstallRequest, OnCommentCreateRequest, TriggerResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';

import { getFloorPostId } from '../core/daily';
import { ensureCurrentFloor, getFloorLog, hasMoveLeft, floorIdAt } from '../core/state';

export const triggers = new Hono();

/**
 * On install/upgrade: make sure today's floor and its arena post exist.
 * Idempotent — an upgrade mid-day will not create a second post.
 */
triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  try {
    const { rollDailyFloor } = await import('../core/daily');
    const result = await rollDailyFloor(Date.now());
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Floor #${result.id} arena post ${result.postId ?? 'pending'} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error('on-app-install failed', error);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to roll the floor on install',
      },
      400
    );
  }
});

const WAR_ROOM_REPLY_CAP = 60; // per floor, keeps viral days sane

/** Narrows a comment id to the literal type submitComment expects. */
function isCommentId(id: string): id is `t1_${string}` {
  return id.startsWith("t1_");
}

/**
 * The war-room bot: one status reply per snailherd per floor, only on the
 * arena posts of the last three floors. It gives commenters live board data
 * so strategy can happen in the comments; it never votes, awards, or
 * comments outside the arena.
 */
triggers.post('/on-comment-create', async (c) => {
  const input = await c.req.json<OnCommentCreateRequest>();
  try {
    const comment = input.comment;
    const author = input.author?.name;
    const postId = input.post?.id;

    if (!comment || !author || !postId || !comment.id || !isCommentId(comment.id) || author === 'slogslogslog') {
      return c.json<TriggerResponse>({ status: 'ok' }, 200);
    }

    const now = Date.now();
    const todayId = floorIdAt(now);
    const { state } = await ensureCurrentFloor(now);

    // only arena posts of the last three floors get the bot
    let floorId: number | null = null;
    for (let id = todayId; id >= todayId - 2 && id >= 1; id--) {
      const arenaPostId = await getFloorPostId(id);
      if (arenaPostId === postId) {
        floorId = id;
        break;
      }
    }
    if (floorId === null) {
      return c.json<TriggerResponse>({ status: 'ok' }, 200);
    }

    // one reply per user per floor
    const replyKey = `slog:floor:${floorId}:warreply:${author.toLowerCase()}`;
    const claimed = await redis.set(replyKey, '1', { nx: true, expiration: new Date(now + 26 * 3600_000) });
    if (claimed !== 'OK') {
      return c.json<TriggerResponse>({ status: 'ok' }, 200);
    }

    // global cap per floor
    const capKey = `slog:floor:${floorId}:warcount`;
    const count = await redis.incrBy(capKey, 1);
    if (count > WAR_ROOM_REPLY_CAP) {
      return c.json<TriggerResponse>({ status: 'ok' }, 200);
    }

    const log = await getFloorLog(floorId);
    const movers = new Set(log.filter((e) => e.u !== 'Slog').map((e) => e.u)).size;
    const hearts = '❤️'.repeat(Math.max(state.hp, 0)) + '🖤'.repeat(Math.max(3 - state.hp, 0));
    const moveLeft = await hasMoveLeft(floorId, author);

    const lines = [
      `🐌 **War room status — Floor #${floorId}:** Slog is at ${state.hero.x + 1}→${state.hero.y + 1} with ${hearts}.`,
      `${state.moves} moves so far by ${movers} snailherd${movers === 1 ? '' : 's'}.`,
      state.status === 'open'
        ? moveLeft
          ? 'You still have your move today — spend it in the post. 🐌'
          : 'You’re in today’s log already. Sit back and watch the hive.'
        : `This floor is ${state.status} — see you at the next noon UTC.`,
    ];

    await reddit.submitComment({
      id: comment.id,
      text: lines.join(' '),
      runAs: 'APP',
    });

    return c.json<TriggerResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error('on-comment-create failed', error);
    return c.json<TriggerResponse>({ status: 'ok' }, 200);
  }
});
