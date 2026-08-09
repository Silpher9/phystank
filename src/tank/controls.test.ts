import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { CONTROL_TUNING, moveTowardsAngle, TankController } from "./controls";
import { createTank } from "./tank";

describe("turret turn limiting", () => {
  it("moves only by the permitted amount instead of snapping to the target", () => {
    expect(moveTowardsAngle(0, Math.PI, 0.2)).toBeCloseTo(0.2);
  });

  it("takes the short path across the angle wrap", () => {
    const result = moveTowardsAngle(Math.PI - 0.05, -Math.PI + 0.05, 0.2);
    expect(result).toBeCloseTo(-Math.PI + 0.05);
  });

  it("drives along the hull direction while the turret catches up independently", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "controller-test-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const controller = new TankController(tank);
    controller.setAimPoint(new Vector3(10, 0, 0));
    controller.update(1, { forward: 1, turn: 0 });

    expect(tank.root.position.x).toBeCloseTo(0);
    expect(tank.root.position.z).toBeCloseTo(-CONTROL_TUNING.DRIVE_SPEED);
    expect(Math.abs(tank.turret.rotation.y)).toBeCloseTo(CONTROL_TUNING.TURRET_TURN_SPEED);

    scene.dispose();
    engine.dispose();
  });

  it("keeps the hull's rotated footprint inside the arena walls", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "bounds-test-tank",
      profile: "BRAWLER",
      position: new Vector3(20, 0, 20),
      color: Color3.White(),
    });
    const controller = new TankController(tank);
    controller.update(0, { forward: 0, turn: 0 });

    expect(tank.root.position.x).toBe(CONTROL_TUNING.ARENA_HALF_EXTENT);
    expect(tank.root.position.z).toBe(CONTROL_TUNING.ARENA_HALF_EXTENT);

    scene.dispose();
    engine.dispose();
  });
});
