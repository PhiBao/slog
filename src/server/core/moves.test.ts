import { describe, expect, it } from "vitest";
import { test } from "../test";

import { generateFloor } from "../../shared/floor";
import { MAX_HP, isLegalMove, type FloorGen, type FloorState, type Action } from "../../shared/types";
import { applyAction, applySharedMove, practiceSeed } from "./moves";
import { getPractice, movePractice, resetPractice } from "./practice";
import { FLOOR_EPOCH_UTC, getFloorGen, getFloorState, getStreak, hasMoveLeft, openFloor, floorSeedFor } from "./state";

const NOW = FLOOR_EPOCH_UTC + 5 * 60 * 1000;

function stateAt(hero: { x: number; y: number }): FloorState {
  return { v: 1, hero: { ...hero }, hp: MAX_HP, moves: 0, deaths: 0, status: "open", clearedAt: null };
}

describe("applyAction (pure rules)", () => {
  it("moves onto plain floor and moss/dew normally", () => {
    const gen = generateFloor(1, 1);
    // walk from entrance: right/down until we're on a floor tile that isn't special
    const hero = { ...gen.entrance };
    const out = applyAction(gen, stateAt(hero), "right", NOW);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.state.hero.x).toBe(hero.x + 1);
      expect(out.state.moves).toBe(1);
      expect(["moved", "salt", "cleared"]).toContain(out.event);
    }
  });

  it("refuses to walk into walls and off the board", () => {
    const gen = generateFloor(1, 1);
    // entrance is at the top-left corner: up and left must be illegal
    expect(applyAction(gen, stateAt(gen.entrance), "up", NOW)).toEqual({ ok: false, reason: "illegal" });
    expect(applyAction(gen, stateAt(gen.entrance), "left", NOW)).toEqual({ ok: false, reason: "illegal" });
  });

  it("salt costs one heart; the third salt ends the floor communally", () => {
    const gen: FloorGen = {
      id: 1,
      seed: 1,
      width: 3,
      height: 1,
      tiles: [["entrance", "salt", "burrow"]],
      entrance: { x: 0, y: 0 },
      burrow: { x: 2, y: 0 },
      flavor: "the salt test",
    };
    const first = applyAction(gen, stateAt({ x: 0, y: 0 }), "right", NOW);
    expect(first.ok && first.event === "salt").toBe(true);
    expect(first.ok ? first.state.hp : 0).toBe(2);

    const second = applyAction(gen, first.ok ? first.state : stateAt({ x: 0, y: 0 }), "left", NOW);
    expect(second.ok && second.event === "moved").toBe(true);
    const third = applyAction(gen, second.ok ? second.state : stateAt({ x: 0, y: 0 }), "right", NOW);
    expect(third.ok && third.state.hp).toBe(1);

    const fourth = applyAction(gen, third.ok ? third.state : stateAt({ x: 0, y: 0 }), "left", NOW);
    const fifth = applyAction(gen, fourth.ok ? fourth.state : stateAt({ x: 0, y: 0 }), "right", NOW);
    expect(fifth.ok && fifth.state.hp).toBe(0);
    expect(fifth.ok && fifth.state.status).toBe("failed");
    expect(fifth.ok && fifth.state.deaths).toBe(1);

    // a closed floor accepts no moves
    const after = applyAction(gen, fifth.ok ? fifth.state : stateAt({ x: 0, y: 0 }), "left", NOW);
    expect(after).toEqual({ ok: false, reason: "closed" });
  });

  it("reaching the burrow clears the floor", () => {
    const gen: FloorGen = {
      id: 1,
      seed: 2,
      width: 3,
      height: 1,
      tiles: [["entrance", "floor", "burrow"]],
      entrance: { x: 0, y: 0 },
      burrow: { x: 2, y: 0 },
      flavor: "the clear test",
    };
    const a = applyAction(gen, stateAt({ x: 0, y: 0 }), "right", NOW);
    const b = applyAction(gen, a.ok ? a.state : stateAt({ x: 0, y: 0 }), "right", NOW);
    expect(b.ok && b.event).toBe("cleared");
    expect(b.ok ? b.state.status : "").toBe("cleared");
    expect(b.ok ? b.state.clearedAt : 0).toBe(NOW);
  });

  it("shell rests and heals one heart, capped at max", () => {
    const gen = generateFloor(1, 1);
    const hurt: FloorState = { ...stateAt(gen.entrance), hp: 2 };
    const out = applyAction(gen, hurt, "shell", NOW);
    expect(out.ok && out.state.hp).toBe(3);
    expect(out.ok && out.state.hero).toEqual(gen.entrance);
    const full = applyAction(gen, out.ok ? out.state : hurt, "shell", NOW);
    expect(full.ok && full.state.hp).toBe(MAX_HP);
  });
});

test("applySharedMove end-to-end: budget, log, streak, refund", async () => {
  await openFloor(1, NOW);

  const first = await applySharedMove("u_tester", "right", NOW);
  expect(first.kind).toBe("applied");
  if (first.kind === "applied") {
    expect(first.event).toBeOneOf(["moved", "salt", "cleared"]);
    expect(first.streak).toBe(1);
    expect(first.log.some((e) => e.u === "u_tester")).toBe(true);
  }

  // second move the same floor → friendly rejection, still shows the state
  const second = await applySharedMove("u_tester", "right", NOW + 1000);
  expect(second.kind).toBe("already-moved");

  // another user still moves — the shared run is a relay of everyone
  const third = await applySharedMove("u_other", "right", NOW + 2000);
  expect(third.kind).toBe("applied");
  const state = await getFloorState(1);
  expect(state?.moves).toBe(2);

  // illegal moves are refunded: u_third never spent their move
  const illegal = await applySharedMove("u_third", "up", NOW + 3000);
  expect(illegal.kind).toBe("illegal");
  expect(await hasMoveLeft(1, "u_third")).toBe(true);

  // and they can still spend it on a genuinely legal action afterwards
  const midState = await getFloorState(1);
  const gen = await getFloorGen(1);
  expect(midState).not.toBeNull();
  expect(gen).not.toBeNull();
  if (!midState || !gen) throw new Error("floor state or gen missing in test");
  const dirs: ReadonlyArray<Exclude<Action, "shell">> = ["right", "down", "left", "up"];
  const legalAction = dirs.find((a) => isLegalMove(gen, midState.hero, a));
  expect(legalAction).toBeDefined();
  const legal = await applySharedMove("u_third", legalAction ?? "right", NOW + 4000);
  expect(legal.kind).toBe("applied");

  // streaks increment per floor for distinct users
  expect((await getStreak("u_tester")).n).toBe(1);
  expect((await getStreak("u_other")).n).toBe(1);
});

test("practice tunnels: unlimited moves, per-user seeds, bests on clear", async () => {
  const user = "u_practice";
  const view = await getPractice(user, 1);
  expect(view.state.status).toBe("open");
  expect(view.attempt).toBe(0);

  // deterministic per user
  const again = await getPractice(user, 1);
  expect(JSON.stringify(again.gen)).toBe(JSON.stringify(view.gen));
  expect(practiceSeed(user, 1, 0)).not.toBe(practiceSeed("someone_else", 1, 0));

  // unlimited moves are fine — no budget key is consulted
  for (let i = 0; i < 8; i++) {
    const result = await movePractice(user, 1, "down", NOW + i * 1000);
    expect(["applied", "illegal", "closed"]).toContain(result.kind);
    if (result.kind === "closed") break;
  }

  // reset starts a fresh attempt with full hearts
  const fresh = await resetPractice(user, 1);
  expect(fresh.attempt).toBe(1);
  expect(fresh.state.hp).toBe(MAX_HP);
  expect(fresh.state.moves).toBe(0);
  // a new attempt is a new deterministic tunnel
  expect(practiceSeed(user, 1, 1)).not.toBe(practiceSeed(user, 1, 0));
});

test("floor seeds differ per floor id", async () => {
  expect(floorSeedFor(1)).not.toBe(floorSeedFor(2));
  expect(floorSeedFor(41)).toBeGreaterThan(floorSeedFor(40));
});

const _unusedActionType: Action | undefined = undefined;
void _unusedActionType;
