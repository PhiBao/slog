import { describe, expect, it } from "vitest";

import { floorTwist, paramsForFloor, TWIST_ORDER } from "./floor";

describe("daily twists", () => {
  it("rotates deterministically through the four twists", () => {
    expect(floorTwist(1)).toBe("calm");
    expect(floorTwist(2)).toBe("saltstorm");
    expect(floorTwist(3)).toBe("dewrich");
    expect(floorTwist(4)).toBe("restless");
    expect(floorTwist(5)).toBe("calm");
    expect(floorTwist(9)).toBe("calm");
  });

  it("scales salt gently with floor id and honors the twist", () => {
    const calm = paramsForFloor(1);
    expect(calm.minSalt).toBe(2);
    expect(calm.maxSalt).toBe(5);

    const storm = paramsForFloor(2);
    expect(storm.minSalt).toBe(3);
    expect(storm.maxSalt).toBe(7);

    const rich = paramsForFloor(3);
    expect(rich.minDew).toBe(2);
    expect(rich.maxDew).toBe(5);

    // difficulty curve: +1 salt every three floors, capped at +2
    expect(paramsForFloor(7).minSalt).toBe(4);
    expect(paramsForFloor(100).minSalt).toBeLessThanOrEqual(4);
    expect(TWIST_ORDER.length).toBe(4);
  });
});
