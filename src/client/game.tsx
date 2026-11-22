import './index.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';

import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '../server/trpc';
import { trpc } from './trpc';
import { Board } from './game/board';
import type { Action, Pos, TileKind } from '../shared/types';
import { DIRECTIONS, isLegalMove, tileAt } from '../shared/types';
import { TWIST_INFO } from '../shared/floor';

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
  const [saltFlash, setSaltFlash] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const practiceRef = useRef(false);

  const fetchFloor = useCallback(async () => {
    try {
      const data = await trpc.floor.query();
      setFloor(data);
      setError(null);
    } catch (e) {
      console.error('floor query failed', e);
      setError(e instanceof Error ? e.message : 'The cavern hiccuped. Retrying…');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFloor();
    const timer = setInterval(() => {
      if (!practiceRef.current) void fetchFloor();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchFloor]);

  useEffect(() => {
    if (!saltFlash) return;
    const t = setTimeout(() => setSaltFlash(false), 450);
    return () => clearTimeout(t);
  }, [saltFlash]);

  const spendMove = async (action: Action) => {
    if (moving) return;
    setMoving(true);
    setNotice(null);
    try {
      if (practiceRef.current) {
        const result = await trpc.practiceMove.mutate(action);
        if (result) setPractice(result.view);
        if (result && result.kind === 'illegal') setNotice('Solid rock — pick another way.');
        if (result && result.kind === 'limited') setNotice('Slow down a moment — the tunnels are spam-protected.');
        return;
      }
      const result = await trpc.move.mutate(action);
      switch (result.kind) {
        case 'applied':
          setFloor((prev) =>
            prev
              ? { ...prev, state: result.state, log: result.log, yourMoveLeft: false, streak: result.streak }
              : prev
          );
          if (result.event === 'salt') {
            setNotice('🧂 Salt! Slog lost a heart. The log remembers who.');
            setSaltFlash(true);
          }
          if (result.event === 'cleared') setNotice('🏁 The burrow! Today’s floor is CLEARED by everyone who moved.');
          if (result.event === 'failed') setNotice('💀 Out of hearts — Slog tucks into his shell. Tomorrow we try again.');
          if (result.event === 'shell') setNotice('🛡️ Slog rests in his shell. +1 heart.');
          break;
        case 'already-moved':
          setFloor((prev) => (prev ? { ...prev, state: result.state, log: result.log, yourMoveLeft: false } : prev));
          setNotice('Your move is spent — you’re in today’s log. Watch the hive work. 🐌');
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
    } catch (e) {
      console.error('move failed', e);
      setError(e instanceof Error ? e.message : 'The cavern hiccuped. Try again.');
    } finally {
      setMoving(false);
    }
  };

  const enterPractice = async () => {
    const view = await trpc.practice.query();
    setPractice(view);
    practiceRef.current = true;
    setNotice('Training Tunnel — unlimited moves, no effect on the shared run.');
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

  const suggest = async (action: Action) => {
    if (moving) return;
    setMoving(true);
    try {
      const result = await trpc.suggest.mutate(action);
      if (result && result.ok) {
        setNotice('The hive heard you. Your suggestion is in.');
      } else if (result && !result.ok) {
        setNotice('You already pointed the way today.');
      }
      await fetchFloor();
    } catch {
      setNotice('The suggestion slipped away — try again.');
    } finally {
      setMoving(false);
    }
  };

  if (error && !floor && !practice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cavern p-6 text-parchment">
        <div className="panel max-w-sm rounded-lg p-5 text-center">
          <p className="font-display text-base text-amber">THE CAVERN HICCUPED</p>
          <p className="mt-2 text-sm text-parchment/80">{error}</p>
          <button
            className="btn-pixel mt-4 cursor-pointer rounded-lg bg-amber px-5 py-2 font-bold text-ink"
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
      <div className="flex min-h-screen items-center justify-center bg-cavern text-parchment">
        <p className="bob font-display text-sm text-salt">Unrolling the map…</p>
      </div>
    );
  }

  // --- practice mode render ---
  if (practice) {
    return (
      <div className="flex min-h-screen flex-col items-center gap-3 bg-cavern p-3 text-parchment">
        <header className="text-center">
          <p className="font-display text-xs text-slime">
            TRAINING TUNNEL · UNLIMITED MOVES · BEST: {practice.best ? `${practice.best} MOVES` : '—'}
          </p>
        </header>
        <Board gen={practice.gen} hero={practice.state.hero} size={boardSize()} />
        <Hearts hp={practice.state.hp} />
        <Controls onMove={spendMove} disabled={moving || practice.state.status !== 'open'} />
        {notice && <p className="max-w-md text-center text-sm text-amber">{notice}</p>}
        <div className="flex gap-3 text-sm">
          <button className="btn-pixel cursor-pointer rounded-lg bg-amber px-4 py-2 font-bold text-ink" onClick={resetPracticeTunnel}>
            New tunnel
          </button>
          <button
            className="btn-pixel cursor-pointer rounded-lg border-2 border-slime px-4 py-2 font-bold text-slime"
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
  const movers = new Set(floor.log.filter((e) => e.u !== 'Slog').map((e) => e.u)).size;

  return (
    <div className="flex min-h-screen flex-col items-center gap-3 bg-cavern p-3 text-parchment">
      <header className="flex w-full max-w-xl flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-cavern-mid px-3 py-2">
        <span className="font-display text-sm text-amber">
          FLOOR #{floor.id}
          <span className="ml-2 text-xs font-normal text-parchment/60">{floor.gen.flavor}</span>
        </span>
        <span className="rounded-full bg-cavern-light px-2 py-0.5 text-[10px] text-parchment/80" title={TWIST_INFO[floor.gen.twist]?.blurb}>
          {TWIST_INFO[floor.gen.twist]?.name}
        </span>
        <Hearts hp={floor.state.hp} />
        <span className="font-display text-xs text-parchment/70">
          {floor.state.moves} MOVES · {movers} SNAILHERDS
        </span>
      </header>

      <Board
        gen={floor.gen}
        hero={floor.state.hero}
        size={boardSize()}
        trail={trailFrom(floor)}
        saltFlash={saltFlash}
        collected={floor.state.collected}
        facing={facingFrom(floor)}
        preview={floor.yourMoveLeft ? previewFor(floor) : undefined}
      />

      {closed ? (
        <EndCard
          cleared={floor.state.status === 'cleared'}
          moves={floor.state.moves}
          movers={movers}
          deaths={floor.state.deaths}
          streak={floor.streak}
          state={floor.state}
          onPractice={enterPractice}
        />
      ) : (
        <>
          <p
            className={
              floor.yourMoveLeft
                ? 'rounded-full bg-slime/15 px-4 py-1 text-center text-sm font-bold text-slime'
                : 'rounded-full bg-cavern-light px-4 py-1 text-center text-sm text-parchment/80'
            }
          >
            {floor.yourMoveLeft
              ? 'You have 1 move today. Spend it wisely.'
              : 'Your move is spent — you’re in today’s log. 🐌'}
          </p>
          <Controls onMove={spendMove} disabled={moving || !floor.yourMoveLeft} />
          <SuggestionBar floor={floor} onSuggest={suggest} />
        </>
      )}

      {notice && <p className="max-w-md text-center text-sm text-amber">{notice}</p>}
      {error && <p className="text-sm text-rose">{error}</p>}

      <LogView log={floor.log.slice(-6).reverse()} you={floor.username} snoos={floor.snoos} />

      <footer className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="font-display text-amber" title="Your streak of floors with a move">
          🔥 {floor.streak}
        </span>
        <span className="rounded-full bg-cavern-light px-3 py-1 text-xs text-parchment/80">
          This week: {floor.week.cleared} cleared · {floor.week.failed} lost
        </span>
        <span className="rounded-full bg-cavern-light px-3 py-1 text-xs text-parchment/80">
          Next floor in {countdownToNoon(nowTick)}
        </span>
        <button
          className="btn-pixel cursor-pointer rounded-lg border-2 border-slime px-3 py-1 font-bold text-slime"
          onClick={enterPractice}
        >
          Training Tunnels →
        </button>
        <button
          className="btn-pixel cursor-pointer rounded-lg border-2 border-stone px-3 py-1 font-bold text-parchment/80"
          onClick={openArchive}
        >
          Past floors
        </button>
      </footer>

      {showArchive && archive && (
        <ol className="max-w-xl text-xs text-parchment/80">
          {archive.length === 0 && <li className="py-1">No floors archived yet — we’re just starting.</li>}
          {archive.map((entry) => (
            <li key={entry.id} className="py-0.5">
              <span className="font-display text-amber">#{entry.id}</span> · {entry.status} · {entry.moves} moves ·{' '}
              {entry.movers} snailherds · {entry.deaths} salt · {entry.flavor}
            </li>
          ))}
        </ol>
      )}

      <p className="text-[10px] text-parchment/40">New floor every day at 12:00 UTC · argue the next move in the comments ↓</p>
    </div>
  );
};

/** Replays the (uncapped) log from the entrance to derive the slime trail. */
function trailFrom(floor: FloorView): Pos[] {
  if (floor.log.length >= 250) return [];
  let pos: Pos = { ...floor.gen.entrance };
  const visited: Pos[] = [];
  for (const entry of floor.log) {
    if (entry.action === 'shell') continue;
    const d = DIRECTIONS[entry.action];
    const next: Pos = { x: pos.x + d.x, y: pos.y + d.y };
    if (next.x < 0 || next.y < 0 || next.x >= floor.gen.width || next.y >= floor.gen.height) break;
    pos = next;
    visited.push({ ...pos });
  }
  return visited.slice(-40);
}

/** Client-side consequence preview — the server re-validates every move. */
function previewFor(floor: FloorView): { legal: Exclude<Action, 'shell'>[]; outcomes: Partial<Record<Exclude<Action, 'shell'>, TileKind>> } {
  const dirs: Exclude<Action, 'shell'>[] = ['up', 'right', 'down', 'left'];
  const legal = dirs.filter((a) => isLegalMove(floor.gen, floor.state.hero, a));
  const outcomes: Partial<Record<Exclude<Action, 'shell'>, TileKind>> = {};
  for (const a of legal) {
    const d = DIRECTIONS[a];
    outcomes[a] = tileAt(floor.gen, { x: floor.state.hero.x + d.x, y: floor.state.hero.y + d.y });
  }
  return { legal, outcomes };
}

/** Last direction Slog traveled, for the facing flip. */
function facingFrom(floor: FloorView): Exclude<Action, 'shell'> | null {
  for (let i = floor.log.length - 1; i >= 0; i--) {
    const entry = floor.log[i];
    if (!entry) continue;
    if (entry.action !== 'shell') return entry.action;
  }
  return null;
}

/** Time until the next noon-UTC floor. */
function countdownToNoon(now: number): string {
  const next = new Date(now);
  next.setUTCHours(12, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  const ms = next.getTime() - now;
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Hearts({ hp }: { hp: number }) {
  return (
    <span className="text-rose" aria-label={`${hp} hearts`}>
      {'♥'.repeat(Math.max(hp, 0))}
      <span className="text-parchment/25">{'♥'.repeat(Math.max(3 - hp, 0))}</span>
    </span>
  );
}

function Controls({ onMove, disabled }: { onMove: (action: Action) => void; disabled: boolean }) {
  const dir =
    'btn-pixel flex h-14 w-14 cursor-pointer items-center justify-center rounded-lg bg-cavern-light font-display text-2xl text-parchment hover:bg-stone';
  return (
    <div className="flex items-center gap-2">
      <button className={dir} disabled={disabled} onClick={() => onMove('left')} aria-label="Move left">
        ←
      </button>
      <div className="flex flex-col gap-2">
        <button className={dir} disabled={disabled} onClick={() => onMove('up')} aria-label="Move up">
          ↑
        </button>
        <button className={dir} disabled={disabled} onClick={() => onMove('down')} aria-label="Move down">
          ↓
        </button>
      </div>
      <button className={dir} disabled={disabled} onClick={() => onMove('right')} aria-label="Move right">
        →
      </button>
      <button
        className="btn-pixel flex h-14 cursor-pointer items-center justify-center rounded-lg border-2 border-slime px-3 font-bold text-slime"
        disabled={disabled}
        onClick={() => onMove('shell')}
        aria-label="Rest in shell"
      >
        🛡 Shell
      </button>
    </div>
  );
}

function LogView({
  log,
  you,
  snoos,
}: {
  log: FloorView['log'];
  you: string | null;
  snoos: Record<string, string>;
}) {
  return (
    <div className="max-w-xl text-xs">
      <p className="mb-1 font-display text-slime">RECENT MOVES</p>
      {log.length === 0 && <p className="text-parchment/50">No moves yet today. Be the first snailherd.</p>}
      {log.map((entry, i) => (
        <p key={`${entry.t}-${i}`} className={`flex items-center gap-1.5 ${entry.u === you ? 'font-bold text-slime' : 'text-parchment/70'}`}>
          {entry.u === 'Slog' ? (
            <span>🐌</span>
          ) : snoos[entry.u] ? (
            <img src={snoos[entry.u]} alt="" className="h-4 w-4 rounded-full" loading="lazy" />
          ) : (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cavern-light text-[8px] text-amber">
              🐌
            </span>
          )}
          {entry.u === 'Slog' ? ' Slog crawled on his own' : `u/${entry.u}`}{' '}
          {entry.u === 'Slog' ? '' : directionGlyph[entry.action]}
        </p>
      ))}
    </div>
  );
}

function SuggestionBar({ floor, onSuggest }: { floor: FloorView; onSuggest: (action: Action) => void }) {
  const counts = floor.suggestions ?? {};
  const entries = (Object.entries(counts) as [Action, number][])
    .filter(([action, n]) => action !== 'shell' && n > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 2);
  const mine = floor.mySuggestion;

  if (floor.yourMoveLeft && top.length === 0) {
    return (
      <p className="max-w-md text-center text-xs text-parchment/50">
        The board is quiet. Whatever you choose, the hive will argue about it.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {top.length > 0 && (
        <p className="text-xs text-parchment/70">
          The hive suggests{' '}
          {top.map(([action, n]) => (
            <span key={action} className="font-bold text-slime">
              {directionGlyph[action]} ({n}){' '}
            </span>
          ))}
        </p>
      )}
      {!floor.yourMoveLeft && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-parchment/60">{mine ? `You pointed ${directionGlyph[mine]}` : 'Point the next move:'}</span>
          {(['up', 'right', 'down', 'left'] as const).map((a) => (
            <button
              key={a}
              className="btn-pixel cursor-pointer rounded-md bg-cavern-light px-2 py-1 text-sm text-parchment disabled:opacity-40"
              disabled={Boolean(mine)}
              onClick={() => onSuggest(a)}
              aria-label={`Suggest ${a}`}
            >
              {directionGlyph[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EndCard({
  cleared,
  moves,
  movers,
  deaths,
  streak,
  state,
  onPractice,
}: {
  cleared: boolean;
  moves: number;
  movers: number;
  deaths: number;
  streak: number;
  state: FloorView['state'];
  onPractice: () => void;
}) {
  const roles: string[] = [];
  if (state.finisherBy) roles.push(`🏁 u/${state.finisherBy}`);
  if (state.bestStep) roles.push(`🧭 u/${state.bestStep.u}`);
  if (state.medicBy) roles.push(`💊 u/${state.medicBy}`);
  const salty = Object.entries(state.saltBy).sort((a, b) => b[1] - a[1])[0];
  if (salty) roles.push(`🧂 u/${salty[0]}`);
  return (
    <div className="panel max-w-xl rounded-lg p-4 text-center">
      <p className="font-display text-lg text-amber">
        {cleared ? 'FLOOR CLEARED 🏁' : 'THE FLOOR WINS TODAY 💀'}
      </p>
      <p className="mt-1 text-sm text-parchment/80">
        {moves} moves · {movers} snailherds · {deaths} salt incidents · your streak 🔥 {streak}
      </p>
      {roles.length > 0 && <p className="mt-1 text-xs text-parchment/70">{roles.join(' · ')}</p>}
      <p className="mt-1 text-sm text-parchment/60">See you at noon UTC. Mourn or gloat in the comments ↓</p>
      <div className="mt-3 flex justify-center gap-3 text-sm">
        <button className="btn-pixel cursor-pointer rounded-lg bg-amber px-4 py-2 font-bold text-ink" onClick={onPractice}>
          Practice in the Training Tunnels →
        </button>
      </div>
    </div>
  );
}

function boardSize() {
  if (typeof window === 'undefined') return 320;
  // 320px viewport: 288px board + 2×12px padding fits with room to spare.
  return Math.max(240, Math.min(480, window.innerWidth - 32));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
