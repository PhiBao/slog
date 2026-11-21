import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';

import { rollDailyFloor } from '../core/daily';

export const triggers = new Hono();

/**
 * On install/upgrade: make sure today's floor and its arena post exist.
 * Idempotent — an upgrade mid-day will not create a second post.
 */
triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  try {
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
