import './index.css';

import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '../server/trpc';
import { trpc } from './trpc';
import { Board } from './game/board';
import type { Action } from '../shared/types';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type FloorView = RouterOutputs['floor'];
type PracticeView = RouterOutputs['practice'];
type ArchiveEntry = RouterOutputs['archive'][number];

const POLL_MS = 30_000;

const directionGlyph: Record<Action, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  shell: '⌂',
};

export const App = () => {
  const [floor, setFloor] = useState<FloorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [practice, setPractice] = useState<PracticeView | null>(null);
  const [archive, setArchive] = useState<ArchiveEntry[] | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const practiceRef = useRef(false);

  const fetchFloor = useCallback(async () => {
    try {
      const data = await trpc.floor.query();
      setFloor(data);
      setError(null);
    } catch (e) {
      console.error("floor query failed", e);
      setError(e instanceof Error ? e.message : 'The cavern hiccuped. Retrying…');
    }
  }, []);

  useEffect(() => {
    void fetchFloor();
    const timer = setInterval(() => {
      if (!practiceRef.current) void fetchFloor();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchFloor]);

  const spendMove = async (action: Action) => {
    if (moving) return;
    setMoving(true);
    setNotice(null);
    try {
      if (practiceRef.current) {
        const result = await trpc.practiceMove.mutate(action);
        if (result) setPractice(result.view);
        if (result && result.kind === 'illegal') setNotice('Solid rock — pick another way.');
        return;
      }
      const result = await trpc.move.mutate(action);
      switch (result.kind) {
        case 'applied':
          setFloor((prev) =>
            prev ? { ...prev, state: result.state, log: result.log, yourMoveLeft: false, streak: result.streak } : prev
          );
          if (result.event === 'salt') setNotice('🧂 Salt! Slog lost a heart. The log remembers.');
          if (result.event === 'cleared') setNotice('🏁 The burrow! Today’s floor is CLEARED by everyone who moved.');
          if (result.event === 'failed') setNotice('💀 Out of hearts — Slog tucks in. Tomorrow we try again.');
          if (result.event === 'shell') setNotice('🛡️ Slog rests in his shell. +1 heart.');
          break;
        case 'already-moved':
          setFloor((prev) => (prev ? { ...prev, state: result.state, log: result.log, yourMoveLeft: false } : prev));
          setNotice('Your move is spent for today — you’re in the log. Watch the hive work.');
          break;
        case 'illegal':
          setFloor((prev) => (prev ? { ...prev, state: result.state, log: result.log, yourMoveLeft: true } : prev));
          setNotice(result.message);
          break;
        case 'closed':
          setFloor((prev) => (prev ? { ...prev, state: result.state, log: result.log } : prev));
          break;
        case 'busy':
          setNotice('Too many snailherds at once — try again in a moment.');
          break;
        default:
          setNotice('Sign in to steer Slog.');
      }
    } catch {
      setError('The cavern hiccuped. Try again.');
    } finally {
      setMoving(false);
    }
  };

  const enterPractice = async () => {
    const view = await trpc.practice.query();
    setPractice(view);
    practiceRef.current = true;
    setNotice('Training Tunnel: unlimited moves, no effect on the shared run.');
  };

  const exitPractice = () => {
    practiceRef.current = false;
    setPractice(null);
    setNotice(null);
    void fetchFloor();
  };

  const resetPracticeTunnel = async () => {
    const view = await trpc.practiceReset.mutate();
    setPractice(view);
    setNotice('Fresh tunnel. Same rules, zero stakes.');
  };

  const openArchive = async () => {
    setShowArchive((prev) => !prev);
    if (!archive) setArchive(await trpc.archive.query());
  };

  if (error && !floor && !practice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#2A1E3F] p-6 text-[#F2ECDF]">
        <div className="text-center">
          <p className="text-lg">{error}</p>
          <button
            className="mt-4 cursor-pointer rounded-full bg-[#FFB84D] px-5 py-2 text-[#241B35]"
            onClick={() => void fetchFloor()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!floor && !practice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#2A1E3F] text-[#F2ECDF]">
        <p className="animate-pulse text-lg">Unrolling the map…</p>
      </div>
    );
  }

  // --- practice mode render ---
  if (practice) {
    return (
      <div className="flex min-h-screen flex-col items-center gap-3 bg-[#2A1E3F] p-3 text-[#F2ECDF]">
        <header className="text-center">
          <p className="text-sm text-[#52D6C8]">
            TRAINING TUNNEL · unlimited moves · best: {practice.best ? `${practice.best} moves` : '—'}
          </p>
        </header>
        <Board gen={practice.gen} hero={practice.state.hero} size={boardSize()} />
        <Hearts hp={practice.state.hp} />
        <Controls onMove={spendMove} disabled={moving || practice.state.status !== 'open'} />
        {notice && <p className="max-w-md text-center text-sm text-[#FFB84D]">{notice}</p>}
        <div className="flex gap-3 text-sm">
          <button className="cursor-pointer rounded-full bg-[#FFB84D] px-4 py-2 text-[#241B35]" onClick={resetPracticeTunnel}>
            New tunnel
          </button>
          <button
            className="cursor-pointer rounded-full border border-[#52D6C8] px-4 py-2 text-[#52D6C8]"
            onClick={exitPractice}
          >
            ← Back to the shared floor
          </button>
        </div>
      </div>
    );
  }

  // --- shared floor render ---
  if (!floor) return null;
  const closed = floor.state.status !== 'open';

  return (
    <div className="flex min-h-screen flex-col items-center gap-3 bg-[#2A1E3F] p-3 text-[#F2ECDF]">
      <header className="flex w-full max-w-xl items-center justify-between gap-2 text-center">
        <span className="text-sm font-semibold">
          FLOOR #{floor.id} · {floor.gen.flavor}
        </span>
        <Hearts hp={floor.state.hp} />
        <span className="text-sm">
          {floor.state.moves} moves
        </span>
      </header>

      <Board gen={floor.gen} hero={floor.state.hero} size={boardSize()} />

      {closed ? (
        <EndCard
          cleared={floor.state.status === 'cleared'}
          moves={floor.state.moves}
          deaths={floor.state.deaths}
          streak={floor.streak}
          onPractice={enterPractice}
        />
      ) : (
        <>
          <p className="text-sm">
            {floor.yourMoveLeft
              ? 'You have 1 move today. Spend it wisely.'
              : 'Your move is spent. You’re in today’s log. 🐌'}
          </p>
          <Controls onMove={spendMove} disabled={moving || !floor.yourMoveLeft} />
        </>
      )}

      {notice && <p className="max-w-md text-center text-sm text-[#FFB84D]">{notice}</p>}
      {error && <p className="text-sm text-[#E4586B]">{error}</p>}

      <LogView log={floor.log.slice(-5).reverse()} you={floor.username} />

      <footer className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="text-[#FFB84D]">🔥 {floor.streak}</span>
        <button
          className="cursor-pointer rounded-full border border-[#52D6C8] px-3 py-1 text-[#52D6C8]"
          onClick={enterPractice}
        >
          Training Tunnels →
        </button>
        <button
          className="cursor-pointer rounded-full border border-[#8C7AA9] px-3 py-1 text-[#8C7AA9]"
          onClick={openArchive}
        >
          Past floors
        </button>
      </footer>

      {showArchive && archive && (
        <ol className="max-w-xl text-xs text-[#F2ECDF]/80">
          {archive.length === 0 && <li className="py-1">No floors archived yet — we’re just starting.</li>}
          {archive.map((entry) => (
            <li key={entry.id} className="py-0.5">
              #{entry.id} · {entry.status} · {entry.moves} moves · {entry.movers} snailherds · {entry.deaths} salt ·{' '}
              {entry.flavor}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

function Hearts({ hp }: { hp: number }) {
  return (
    <span className="text-[#E4586B]" aria-label={`${hp} hearts`}>
      {'♥'.repeat(Math.max(hp, 0))}
      <span className="text-[#F2ECDF]/25">{'♥'.repeat(Math.max(3 - hp, 0))}</span>
    </span>
  );
}

function Controls({
  onMove,
  disabled,
}: {
  onMove: (action: Action) => void;
  disabled: boolean;
}) {
  const btn =
    'flex h-12 w-16 cursor-pointer items-center justify-center rounded-lg bg-[#574078] text-xl text-[#F2ECDF] transition-colors hover:bg-[#8C7AA9] disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center gap-2">
      <button className={btn} disabled={disabled} onClick={() => onMove('left')} aria-label="Move left">
        ←
      </button>
      <div className="flex flex-col gap-2">
        <button className={btn} disabled={disabled} onClick={() => onMove('up')} aria-label="Move up">
          ↑
        </button>
        <button className={btn} disabled={disabled} onClick={() => onMove('down')} aria-label="Move down">
          ↓
        </button>
      </div>
      <button className={btn} disabled={disabled} onClick={() => onMove('right')} aria-label="Move right">
        →
      </button>
      <button
        className="flex h-12 cursor-pointer items-center justify-center rounded-lg border border-[#52D6C8] px-3 text-[#52D6C8] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={() => onMove('shell')}
        aria-label="Rest in shell"
      >
        🛡 Shell
      </button>
    </div>
  );
}

function LogView({ log, you }: { log: FloorView['log']; you: string | null }) {
  return (
    <div className="max-w-xl text-xs">
      <p className="mb-1 text-[#52D6C8]">Recent moves</p>
      {log.length === 0 && <p className="text-[#F2ECDF]/50">No moves yet today. Be the first snailherd.</p>}
      {log.map((entry, i) => (
        <p key={`${entry.t}-${i}`} className={entry.u === you ? 'text-[#52D6C8]' : 'text-[#F2ECDF]/70'}>
          u/{entry.u} {directionGlyph[entry.action]}
        </p>
      ))}
    </div>
  );
}

function EndCard({
  cleared,
  moves,
  deaths,
  streak,
  onPractice,
}: {
  cleared: boolean;
  moves: number;
  deaths: number;
  streak: number;
  onPractice: () => void;
}) {
  return (
    <div className="max-w-xl rounded-lg border-2 border-[#FFB84D] bg-[#3B2A56] p-4 text-center">
      <p className="text-lg font-bold text-[#FFB84D]">
        {cleared ? 'FLOOR CLEARED 🏁' : 'THE FLOOR WINS TODAY 💀'}
      </p>
      <p className="mt-1 text-sm text-[#F2ECDF]/80">
        {moves} moves · {deaths} salt incidents · your streak 🔥 {streak}
      </p>
      <p className="mt-1 text-sm text-[#F2ECDF]/70">See you at noon UTC.</p>
      <div className="mt-3 flex justify-center gap-3 text-sm">
        <button className="cursor-pointer rounded-full bg-[#FFB84D] px-4 py-2 text-[#241B35]" onClick={onPractice}>
          Practice in the Training Tunnels →
        </button>
      </div>
    </div>
  );
}

function boardSize() {
  if (typeof window === 'undefined') return 320;
  return Math.max(280, Math.min(480, window.innerWidth - 48));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
