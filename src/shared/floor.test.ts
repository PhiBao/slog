import { describe, expect, it } from "vitest";

import { generateFloor, hasSafePath, DEFAULT_FLOOR_PARAMS } from "./floor";
import { hashString } from "./rng";

describe("generateFloor", () => {
  it("is deterministic: same seed produces a byte-identical floor", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = generateFloor(seed, seed);
      const b = generateFloor(seed, seed);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("always has a salt-free path from entrance to burrow (500 seeds)", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const gen = generateFloor(seed, seed);
      expect(hasSafePath(gen), `seed ${seed} has no safe path`).toBe(true);
    }
  });

  it("keeps salt within calibrated bounds", () => {
    const { minSalt, maxSalt } = DEFAULT_FLOOR_PARAMS;
    for (let seed = 1; seed <= 200; seed++) {
      const gen = generateFloor(seed, seed);
      const salt = gen.tiles.flat().filter((t) => t === "salt").length;
      expect(salt).toBeGreaterThanOrEqual(minSalt);
      expect(salt).toBeLessThanOrEqual(maxSalt + 3); // regeneration fallback may add a few
    }
  });

  it("places exactly one entrance and one burrow, at opposite corners", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const gen = generateFloor(seed, seed);
      const flat = gen.tiles.flat();
      expect(flat.filter((t) => t === "entrance").length).toBe(1);
      expect(flat.filter((t) => t === "burrow").length).toBe(1);
      expect(gen.entrance).toEqual({ x: 0, y: 0 });
      expect(gen.burrow).toEqual({ x: gen.width - 1, y: gen.height - 1 });
    }
  });

  it("uses a stable flavor from the seed (never changes for a floor id)", () => {
    const a = generateFloor(47, 47);
    const b = generateFloor(47, 47);
    expect(a.flavor).toBe(b.flavor);
    expect(a.flavor.length).toBeGreaterThan(3);
  });

  it("practice seeds derived from usernames are deterministic and differ per user", () => {
    const seedA = hashString("annual_radish_6024") ^ 47;
    const seedB = hashString("someone_else") ^ 47;
    const fa = generateFloor(47, seedA);
    const fb = generateFloor(47, seedB);
    expect(JSON.stringify(fa)).toBe(JSON.stringify(generateFloor(47, seedA)));
    expect(fa.seed).not.toBe(fb.seed);
  });
});
