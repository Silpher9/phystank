import { describe, expect, it } from "vitest";
import {
  isTankPositionBlocked,
  TANK_COLLISION_HALF_DEPTH,
  TANK_COLLISION_HALF_WIDTH,
} from "./collision";

describe("tank collision", () => {
  it("checks rotated box bounds on the XZ plane", () => {
    const blocked = isTankPositionBlocked(
      { x: 3.4, z: 0 },
      "player-tank",
      [
        {
          kind: "BOX",
          id: "rotated-block",
          halfWidth: 4,
          halfDepth: 0.5,
          getCenter: () => ({ x: 0, z: 0 }),
          getRotationY: () => 0,
        },
      ],
      0,
      0.25,
      0.25,
    );

    expect(blocked).toBe(true);
  });

  it("ignores inactive objects", () => {
    const blocked = isTankPositionBlocked({ x: 0, z: 0 }, "player-tank", [
      {
        kind: "BOX",
        id: "destroyed-crate",
        halfWidth: 1,
        halfDepth: 1,
        getCenter: () => ({ x: 0, z: 0 }),
        getRotationY: () => 0,
        isActive: () => false,
      },
    ]);

    expect(blocked).toBe(false);
  });

  it("does not collide with the moving tank itself", () => {
    const blocked = isTankPositionBlocked({ x: 0, z: 0 }, "player-tank", [
      {
        kind: "BOX",
        id: "player-tank",
        halfWidth: TANK_COLLISION_HALF_WIDTH,
        halfDepth: TANK_COLLISION_HALF_DEPTH,
        getCenter: () => ({ x: 0, z: 0 }),
        getRotationY: () => 0,
      },
    ]);

    expect(blocked).toBe(false);
  });

  it("uses the box orientation instead of a circular worst-case radius", () => {
    const longAlongX = isTankPositionBlocked(
      { x: 3, z: 0 },
      "player-tank",
      [
        {
          kind: "BOX",
          id: "long-block",
          halfWidth: 0.5,
          halfDepth: 4,
          getCenter: () => ({ x: 0, z: 0 }),
          getRotationY: () => Math.PI / 2,
        },
      ],
      0,
      0.25,
      0.25,
    );
    const longAlongZ = isTankPositionBlocked(
      { x: 3, z: 0 },
      "player-tank",
      [
        {
          kind: "BOX",
          id: "long-block",
          halfWidth: 0.5,
          halfDepth: 4,
          getCenter: () => ({ x: 0, z: 0 }),
          getRotationY: () => 0,
        },
      ],
      0,
      0.25,
      0.25,
    );

    expect(longAlongX).toBe(true);
    expect(longAlongZ).toBe(false);
  });

  it("keeps the tank's actual non-square extents in the driving body", () => {
    expect(TANK_COLLISION_HALF_WIDTH).toBe(2.3);
    expect(TANK_COLLISION_HALF_DEPTH).toBe(2.65);
  });
});
