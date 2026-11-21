import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { trpc } from './trpc';

/**
 * Splash — the inline card people see in their feed.
 * Kept intentionally fast: one light query, no board, no fonts beyond the
 * system stack until the expanded view opens.
 */
export const Splash = () => {
  const [info, setInfo] = useState<{ id: number; flavor: string; status: string; moves: number; hp: number } | null>(
    null
  );

  useEffect(() => {
    trpc.splash
      .query()
      .then(setInfo)
      .catch((e: unknown) => {
        console.error("splash query failed", e);
        setInfo(null);
      });
  }, []);

  return (
    <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-2 bg-[#2A1E3F] px-4 py-6 text-[#F2ECDF]">
      <p className="text-xs tracking-widest text-[#52D6C8]">THE DAILY SHARED DUNGEON</p>
      <h1 className="text-3xl font-black tracking-tight text-[#FFB84D]">SLOG</h1>
      <p className="max-w-sm text-center text-sm text-[#F2ECDF]/80">
        All of Reddit steers one brave snail through the Undervault — one move each.
      </p>
      {info && (
        <p className="mt-1 text-xs text-[#8C7AA9]">
          Floor #{info.id} · {info.flavor} · {info.moves} moves · {info.status === 'open' ? 'in progress' : info.status}
        </p>
      )}
      <button
        className="mt-3 cursor-pointer rounded-full bg-[#FFB84D] px-6 py-2.5 font-bold text-[#241B35] transition-transform hover:scale-105"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        🐌 Spend today’s move
      </button>
      <p className="mt-1 text-[10px] text-[#8C7AA9]">New floor at 12:00 UTC</p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
