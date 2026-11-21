import { afterEach, describe, expect, it, vi } from 'vitest';

let requestExpandedModeMock: ReturnType<typeof vi.fn>;
let splashQueryMock: ReturnType<typeof vi.fn>;

vi.mock('@devvit/web/client', () => {
  requestExpandedModeMock = vi.fn();
  return {
    requestExpandedMode: requestExpandedModeMock,
  };
});

vi.mock('./trpc', () => {
  splashQueryMock = vi.fn().mockResolvedValue({
    id: 47,
    flavor: 'the soggy gallery',
    status: 'open',
    moves: 12,
    hp: 3,
    endsAt: Date.UTC(2026, 10, 22, 12, 0, 0),
  });
  return {
    trpc: { splash: { query: () => splashQueryMock() } },
  };
});

afterEach(() => {
  requestExpandedModeMock?.mockReset();
  splashQueryMock?.mockReset();
});

describe('Splash', () => {
  it('renders the identity, floor info, and opens the game on tap', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    // `src/splash.tsx` renders immediately on import (createRoot(...).render(...))
    await import('./splash');

    // Let React commit the initial render and the splash query resolve.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent).toContain('SLOG');
    expect(document.body.textContent).toContain('one brave snail');

    const floorInfo = await vi.waitFor(() => {
      const el = Array.from(document.querySelectorAll('p')).find((p) => /Floor #47/.test(p.textContent ?? ''));
      expect(el).toBeTruthy();
      return el;
    });
    expect(floorInfo.textContent).toContain('the soggy gallery');

    const startButton = Array.from(document.querySelectorAll('button')).find((b) =>
      /spend today/i.test(b.textContent ?? '')
    );
    expect(startButton).toBeTruthy();
    startButton!.click();

    expect(requestExpandedModeMock).toHaveBeenCalledTimes(1);
    const arg = requestExpandedModeMock.mock.calls[0]?.[1];
    expect(arg).toBe('game');
  });
});
