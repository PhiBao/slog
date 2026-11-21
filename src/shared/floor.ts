/**
 * Floor generation — deterministic, seeded, and always solvable.
 *
 * Design guarantees (tested in floor.test.ts):
 *   1. Same seed ⇒ byte-identical floor.
 *   2. There is always at least one SALT-FREE path from entrance to burrow:
 *      salt prefers off-corridor cells; when the board is corridor-heavy the
 *      final safe-path validation regenerates with a new seed as the guard.
 *   3. Salt count is calibrated (2–5) so the day has teeth but never doom.
 */

import { createRng } from "./rng";
import type { FloorGen, Pos, TileKind } from "./types";

export type FloorParams = {
  width: number;
  height: number;
  minSalt: number;
  maxSalt: number;
  minDew: number;
  maxDew: number;
  maxMoss: number;
};

export const DEFAULT_FLOOR_PARAMS: FloorParams = {
  width: 12,
  height: 8,
  minSalt: 2,
  maxSalt: 5,
  minDew: 1,
  maxDew: 3,
  maxMoss: 6,
};

const FLAVORS: readonly string[] = [
  "the soggy gallery",
  "granny's lost pantry",
  "the glimmer hollow",
  "a suspiciously clean tunnel",
  "the mushroom ballroom",
  "the echo chute",
  "someone's old root cellar",
  "the whispering shelves",
  "a very tight squeeze",
  "the dewdrop vault",
  "an awkward corner of the cave",
  "the mossy amphitheater",
  "where the lantern fell",
  "the salt merchant's shortcut",
  "a nice bit of hallway, honestly",
  "the undershelf",
  "the pocket cathedral",
  "where roots forget to stop",
  "the snail's regret",
  "the long way down",
];

const key = (p: Pos) => `${p.x},${p.y}`;

/** Safe indexed reads/writes (strict mode: array access may be undefined). */
function tileGet(tiles: TileKind[][], x: number, y: number): TileKind | undefined {
  const row = tiles[y];
  return row?.[x];
}

function tileSet(tiles: TileKind[][], x: number, y: number, kind: TileKind): void {
  const row = tiles[y];
  if (!row) return;
  row[x] = kind;
}

/**
 * Carve a wandering corridor from entrance to burrow with a bias toward the
 * target. Every carved tile is recorded, so the main corridor set is known.
 */
function carveCorridor(
  rng: ReturnType<typeof createRng>,
  width: number,
  height: number,
  entrance: Pos,
  burrow: Pos,
): { carved: Pos[]; corridor: Set<string> } {
  const carved: Pos[] = [];
  const corridor = new Set<string>();
  let cur: Pos = { ...entrance };
  carved.push({ ...cur });
  corridor.add(key(cur));

  let guard = 0;
  const guardMax = width * height * 8;
  while ((cur.x !== burrow.x || cur.y !== burrow.y) && guard++ < guardMax) {
    // Bias: move toward the burrow 70% of the time, otherwise wiggle.
    const goStraight = rng.next() < 0.7;
    let dx = Math.sign(burrow.x - cur.x);
    let dy = Math.sign(burrow.y - cur.y);
    if (goStraight && dx !== 0 && rng.next() < 0.6) dy = 0;
    if (goStraight && dy !== 0 && rng.next() < 0.6) dx = 0;
    if (!goStraight || (dx === 0 && dy === 0)) {
      if (rng.next() < 0.5) {
        dx = rng.next() < 0.5 ? 1 : -1;
        dy = 0;
      } else {
        dy = rng.next() < 0.5 ? 1 : -1;
        dx = 0;
      }
    } else if (dx !== 0 && dy !== 0) {
      if (rng.next() < 0.5) {
        dy = 0;
      } else {
        dx = 0;
      }
    }
    const nx = cur.x + dx;
    const ny = cur.y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    cur = { x: nx, y: ny };
    carved.push({ ...cur });
    corridor.add(key(cur));
  }
  return { carved, corridor };
}

function carveBranches(
  rng: ReturnType<typeof createRng>,
  tiles: TileKind[][],
  carved: Pos[],
  width: number,
  height: number,
  branchCount: number,
): void {
  if (carved.length === 0) return;
  for (let b = 0; b < branchCount; b++) {
    const start = carved[rng.int(carved.length)];
    if (!start) continue;
    let cur: Pos = { ...start };
    const len = 2 + rng.int(5);
    for (let step = 0; step < len; step++) {
      const axis = rng.next() < 0.5 ? "x" : "y";
      const dir = rng.next() < 0.5 ? 1 : -1;
      const nx = cur.x + (axis === "x" ? dir : 0);
      const ny = cur.y + (axis === "y" ? dir : 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) break;
      cur = { x: nx, y: ny };
      if (tileGet(tiles, nx, ny) === "wall") tileSet(tiles, nx, ny, "floor");
    }
  }
}

/** Breadth-first check: is the burrow reachable from the entrance without crossing salt? */
export function hasSafePath(gen: FloorGen): boolean {
  const seen = new Set<string>([key(gen.entrance)]);
  const queue: Pos[] = [{ ...gen.entrance }];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    if (cur.x === gen.burrow.x && cur.y === gen.burrow.y) return true;
    const neighbors: Pos[] = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.y < 0 || n.x >= gen.width || n.y >= gen.height) continue;
      if (seen.has(key(n))) continue;
      const tile = tileGet(gen.tiles, n.x, n.y);
      if (tile === undefined || tile === "wall" || tile === "salt") continue;
      seen.add(key(n));
      queue.push({ ...n });
    }
  }
  return false;
}

export function generateFloor(id: number, seed: number, params: FloorParams = DEFAULT_FLOOR_PARAMS): FloorGen {
  const rng = createRng(seed);
  const { width, height } = params;

  const entrance: Pos = { x: 0, y: 0 };
  const burrow: Pos = { x: width - 1, y: height - 1 };

  // 1) carve the guaranteed corridor entrance → burrow
  const { carved, corridor } = carveCorridor(rng, width, height, entrance, burrow);

  // 2) build the tile grid from carved cells
  const tiles: TileKind[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "wall" as TileKind),
  );
  for (const p of carved) tileSet(tiles, p.x, p.y, "floor");
  tileSet(tiles, entrance.x, entrance.y, "entrance");
  tileSet(tiles, burrow.x, burrow.y, "burrow");

  // 3) side branches for exploration space
  carveBranches(rng, tiles, carved, width, height, 3 + rng.int(4));

  // 4) hazards & treats.
  // Salt is the only constrained placement: prefer OFF-corridor cells so a
  // safe route always exists; corridor-heavy boards fall back to corridor
  // cells away from both ends, and the final safe-path validation (with
  // regeneration) remains the correctness guard.
  const notNearEnds = (p: Pos) => {
    const nearEntrance = Math.abs(p.x - entrance.x) + Math.abs(p.y - entrance.y) <= 1;
    const nearBurrow = Math.abs(p.x - burrow.x) + Math.abs(p.y - burrow.y) <= 1;
    return !nearEntrance && !nearBurrow;
  };

  const shuffled = (items: Pos[]): Pos[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const a = copy[i];
      const b = copy[j];
      if (!a || !b) break;
      copy[i] = b;
      copy[j] = a;
    }
    return copy;
  };

  const saltTarget = params.minSalt + rng.int(params.maxSalt - params.minSalt + 1);
  const offCorridor: Pos[] = [];
  const onCorridor: Pos[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = { x, y };
      const tile = tileGet(tiles, x, y);
      if (tile !== "floor") continue;
      if (corridor.has(key(p))) {
        if (notNearEnds(p)) onCorridor.push(p);
      } else {
        offCorridor.push(p);
      }
    }
  }

  const saltCells = [...shuffled(offCorridor), ...shuffled(onCorridor)].slice(0, saltTarget);
  for (const p of saltCells) tileSet(tiles, p.x, p.y, "salt");

  // Dew and moss are harmless — any floor cell is fine.
  const floorCells: Pos[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tileGet(tiles, x, y) === "floor") floorCells.push({ x, y });
    }
  }
  const cells = shuffled(floorCells);
  const dewTarget = params.minDew + rng.int(params.maxDew - params.minDew + 1);
  let cellIdx = 0;
  let dewPlaced = 0;
  while (dewPlaced < dewTarget && cellIdx < cells.length) {
    const p = cells[cellIdx++];
    if (!p || tileGet(tiles, p.x, p.y) !== "floor") continue;
    tileSet(tiles, p.x, p.y, "dew");
    dewPlaced++;
  }
  const mossTarget = rng.int(params.maxMoss + 1);
  let mossPlaced = 0;
  while (mossPlaced < mossTarget && cellIdx < cells.length) {
    const p = cells[cellIdx++];
    if (!p || tileGet(tiles, p.x, p.y) !== "floor") continue;
    tileSet(tiles, p.x, p.y, "moss");
    mossPlaced++;
  }

  const flavor = FLAVORS[seed % FLAVORS.length] ?? "the long way down";

  const gen: FloorGen = { id, seed, width, height, tiles, entrance, burrow, flavor };

  // Regenerate with an offset seed if validation ever fails (defensive; tests
  // assert this holds across hundreds of seeds).
  if (!hasSafePath(gen)) {
    return generateFloor(id, seed + 1, params);
  }
  return gen;
}
