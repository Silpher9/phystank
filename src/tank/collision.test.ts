import { describe, expect, it } from "vitest";
import { isTankPositionBlocked } from "./collision";

describe("tank collision", () => {
  it("checks rotated object bounds on the XZ plane", () => {
    const blocked = isTankPositionBlocked(
      { x: 3.4, z: 0 },
      "player-tank",
      [
        {
          kind: "BOX",
          id: "rotated-block",
          center: { x: 0, z: 0 },
          halfWidth: 0.5,
          halfDepth: 4,
          rotationY: Math.PI / 2,
        },
      ],
      0.25,
    );

    expect(blocked).toBe(true);
  });

  it("ignores inactive objects", () => {
    const blocked = isTankPositionBlocked({ x: 0, z: 0 }, "player-tank", [
      {
        kind: "BOX",
        id: "destroyed-crate",
        center: { x: 0, z: 0 },
        halfWidth: 1,
        halfDepth: 1,
        rotationY: 0,
        isActive: () => false,
      },
    ]);

    expect(blocked).toBe(false);
  });

  it("does not collide with the moving tank itself", () => {
    const blocked = isTankPositionBlocked({ x: 0, z: 0 }, "player-tank", [
      {
        kind: "TANK",
        id: "player-tank",
        radius: 3.51,
        getCenter: () => ({ x: 0, z: 0 }),
      },
    ]);

    expect(blocked).toBe(false);
  });
});
