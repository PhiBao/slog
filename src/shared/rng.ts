/**
 * Seeded, deterministic RNG (mulberry32).
 * The same seed must always produce the same floor — this is what makes
 * "Floor #47" identical for every player and replayable from just a number.
 */

export type Rng = () => number;

/** Returns a number in [0, n). */
export type RngInt = (n: number) => number;

export function createRng(seed: number): { next: Rng; int: RngInt; pick: <T>(items: readonly T[]) => T } {
  let state = seed >>> 0;
  const next: Rng = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int: RngInt = (n) => Math.floor(next() * n);
  const pick = <T,>(items: readonly T[]): T => {
    const picked: T | undefined = items[int(items.length)];
    if (picked === undefined) {
      throw new Error("pick() called with an empty list");
    }
    return picked;
  };
  return { next, int, pick };
}

/** Stable 32-bit string hash (FNV-1a) for deriving seeds from usernames. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
