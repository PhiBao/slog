/**
 * Shared game types — used by both the client renderer and the server rules.
 * Keep this file free of any platform imports so it stays pure.
 */

export type TileKind =
  | "wall" // solid cavern rock — blocks movement
  | "floor" // plain walkable stone
  | "moss" // walkable, cozy decoration
  | "salt" // walkable but costs 1 heart — comedy hazard
  | "dew" // walkable, tiny bonus drop
  | "entrance" // where Slog starts the floor
  | "burrow"; // the exit — reaching it clears the floor

export type Pos = { x: number; y: number };

/** Everything needed to render a floor and enforce its rules, from just this. */
export type FloorGen = {
  id: number;
  seed: number;
  width: number;
  height: number;
  /** tiles[y][x] */
  tiles: TileKind[][];
  entrance: Pos;
  burrow: Pos;
  flavor: string;
};

export type Action = "up" | "down" | "left" | "right" | "shell";

export const DIRECTIONS: Readonly<Record<Exclude<Action, "shell">, Pos>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export type FloorStatus = "open" | "cleared" | "failed";

/** Live shared state of one floor. Stored in Redis, versioned for optimistic concurrency. */
export type FloorState = {
  v: number;
  hero: Pos;
  hp: number;
  moves: number;
  deaths: number;
  status: FloorStatus;
  clearedAt: number | null;
};

export type MoveLogEntry = {
  u: string; // username, or "Slog" for idle auto-advance steps
  action: Action;
  t: number; // unix ms
};

export type FloorSummary = {
  id: number;
  status: FloorStatus;
  moves: number;
  movers: number;
  deaths: number;
  flavor: string;
};

/** What the client gets for the current shared floor. */
export type FloorView = {
  gen: FloorGen;
  state: FloorState;
  log: MoveLogEntry[];
  yourMoveLeft: boolean;
  yourStreak: number;
};

export const MAX_HP = 3;

/** A move is legal when it stays in bounds and does not enter a wall. */
export function isLegalMove(gen: FloorGen, from: Pos, action: Exclude<Action, "shell">): boolean {
  const d = DIRECTIONS[action];
  const nx = from.x + d.x;
  const ny = from.y + d.y;
  if (nx < 0 || ny < 0 || nx >= gen.width || ny >= gen.height) return false;
  const row = gen.tiles[ny];
  if (!row) return false;
  return row[nx] !== "wall";
}

export function tileAt(gen: FloorGen, p: Pos): TileKind {
  const row = gen.tiles[p.y];
  const tile = row?.[p.x];
  if (tile === undefined) {
    throw new Error(`tile out of bounds: ${p.x},${p.y}`);
  }
  return tile;
}
