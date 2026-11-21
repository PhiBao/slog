import './index.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/nunito/400.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { trpc } from './trpc';

type SplashData = { id: number; flavor: string; status: string; moves: number; hp: number; endsAt: number };

/**
 * Splash — the inline card in the feed. This is Slog's storefront:
 * identity, live floor status, one clear call to action.
 */
export const Splash = () => {
  const [info, setInfo] = useState<SplashData | null>(null);

  useEffect(() => {
    trpc.splash
      .query()
      .then(setInfo)
      .catch((e: unknown) => {
        console.error('splash query failed', e);
        setInfo(null);
      });
  }, []);

  return (
    <div className="relative flex min-h-[300px] w-full flex-col items-center justify-center gap-2 overflow-hidden bg-cavern px-4 py-6 text-parchment">
      {/* lantern vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 50% 32%, rgba(255,184,77,0.14) 0%, rgba(255,184,77,0) 60%)',
        }}
      />
      <p className="font-display text-[10px] tracking-[0.3em] text-slime">THE DAILY SHARED DUNGEON</p>
      <h1 className="bob font-display text-4xl text-amber drop-shadow-[3px_3px_0_rgba(0,0,0,0.4)]">SLOG</h1>
      <p className="max-w-sm text-center text-sm text-parchment/85">
        All of Reddit steers <span className="font-bold">one brave snail</span> through the Undervault —{' '}
        <span className="font-bold text-slime">one move each</span>.
      </p>
      {info && (
        <p className="mt-1 rounded-full bg-cavern-light px-3 py-1 font-display text-[11px] text-parchment/80">
          FLOOR #{info.id} · {info.flavor.toUpperCase()} · {info.moves} MOVES ·{' '}
          {info.status === 'open' ? 'IN PROGRESS' : info.status.toUpperCase()}
        </p>
      )}
      <button
        className="btn-pixel mt-3 cursor-pointer rounded-lg bg-amber px-6 py-2.5 font-display text-sm text-ink hover:bg-amber-deep"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        🐌 SPEND TODAY’S MOVE
      </button>
      <p className="mt-1 text-[10px] text-parchment/50">New floor every day at 12:00 UTC</p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
