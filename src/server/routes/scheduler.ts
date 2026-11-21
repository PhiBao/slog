import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';

import { autoAdvance, rollDailyFloor } from '../core/daily';

export const scheduler = new Hono();

// Cron: "0 12 * * *" — roll to today's floor and post the arena.
scheduler.post('/daily-floor', async (c) => {
  try {
    const result = await rollDailyFloor(Date.now());
    console.log(`daily-floor: floor ${result.id} post ${result.postId ?? 'none'} created=${result.created}`);
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error('daily-floor task failed', error);
    return c.json<TaskResponse>({ status: 'error' }, 500);
  }
});

// Cron: every 10 minutes — Slog's idle crawl.
scheduler.post('/auto-advance', async (c) => {
  try {
    const result = await autoAdvance(Date.now());
    if (result.stepped) {
      console.log(`auto-advance: ${result.reason}`);
    }
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error('auto-advance task failed', error);
    return c.json<TaskResponse>({ status: 'error' }, 500);
  }
});

/** Mod menu action: force today's roll (idempotent). */
scheduler.post('/roll-floor', async (c) => {
  try {
    const result = await rollDailyFloor(Date.now());
    const response: UiResponse = {
      showToast: `Floor #${result.id} — ${result.created ? 'arena posted' : 'arena already up'}.`,
    };
    return c.json<UiResponse>(response, 200);
  } catch (error) {
    console.error('roll-floor failed', error);
    return c.json<UiResponse>({ showToast: 'Failed to roll the floor.' }, 400);
  }
});
