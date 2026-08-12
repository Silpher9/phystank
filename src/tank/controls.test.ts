import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { CONTROL_TUNING, moveTowardsAngle, TankController } from "./controls";
import { createTank } from "./tank";
import { GameEventBus, type GameEvents } from "../core/events";
import { ARENA_SIZE, WALL_THICKNESS } from "../arena";

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
    const controller = new TankController(tank, new GameEventBus());
    controller.setAimPoint(new Vector3(10, 0, 0));
    controller.update(1, { forward: 1, turn: 0 });

    expect(tank.root.position.x).toBeCloseTo(0);
    expect(tank.root.position.z).toBeCloseTo(-CONTROL_TUNING.DRIVE_SPEED);
    expect(Math.abs(tank.turret.rotation.y)).toBeCloseTo(CONTROL_TUNING.TURRET_TURN_SPEED);

    scene.dispose();
    engine.dispose();
  });

  it("stops before a concrete obstacle instead of driving through it", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "obstacle-collision-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const obstacle = {
      kind: "BOX" as const,
      id: "concrete-block",
      center: { x: 0, z: -5 },
      halfWidth: 1,
      halfDepth: 1,
      rotationY: 0,
    };
    const controller = new TankController(tank, new GameEventBus(), [obstacle]);

    controller.update(1, { forward: 1, turn: 0 });

    expect(tank.root.position.x).toBe(0);
    expect(tank.root.position.z).toBe(0);

    scene.dispose();
    engine.dispose();
  });

  it("stops before another tank instead of overlapping its hull", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "tank-collision-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const otherTank = {
      kind: "TANK" as const,
      id: "other-tank",
      radius: 3.51,
      getCenter: () => ({ x: 0, z: -8 }),
    };
    const controller = new TankController(tank, new GameEventBus(), [otherTank]);

    controller.update(1, { forward: 1, turn: 0 });

    expect(tank.root.position.x).toBe(0);
    expect(tank.root.position.z).toBe(0);

    scene.dispose();
    engine.dispose();
  });

  it("keeps the hull's rotated footprint inside the arena walls", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "bounds-test-tank",
      profile: "BRAWLER",
      position: new Vector3(100, 0, 100),
      color: Color3.White(),
    });
    const controller = new TankController(tank, new GameEventBus());
    controller.update(0, { forward: 0, turn: 0 });
    expect(tank.root.position.x).toBe(CONTROL_TUNING.ARENA_HALF_EXTENT);
    expect(tank.root.position.z).toBe(CONTROL_TUNING.ARENA_HALF_EXTENT);

    const hullFacets = Object.values(tank.facets).filter((facet) => facet.id !== "TURRET_FRONT");
    let measuredRotatedRadius = 0;
    tank.root.position.set(0, 0, 0);
    for (let degrees = 0; degrees < 360; degrees += 0.5) {
      tank.root.rotation.y = degrees * Math.PI / 180;
      tank.root.computeWorldMatrix(true);
      for (const facet of hullFacets) {
        facet.mesh.computeWorldMatrix(true);
        const bounds = facet.mesh.getBoundingInfo().boundingBox;
        measuredRotatedRadius = Math.max(
          measuredRotatedRadius,
          Math.abs(bounds.minimumWorld.x),
          Math.abs(bounds.maximumWorld.x),
        );
      }
    }

    const wallInnerEdge = ARENA_SIZE / 2 - WALL_THICKNESS / 2;
    const furthestHullPoint = CONTROL_TUNING.ARENA_HALF_EXTENT + measuredRotatedRadius;
    expect(ARENA_SIZE).toBe(96);
    expect(furthestHullPoint).toBeLessThanOrEqual(wallInnerEdge);
    expect(furthestHullPoint).toBeGreaterThan(wallInnerEdge - 0.25);

    scene.dispose();
    engine.dispose();
  });

  it("publishes physical drive state for suspension listeners", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "drive-event-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const events = new GameEventBus();
    const driveStates: GameEvents["DRIVE_STATE"][] = [];
    events.on("DRIVE_STATE", (event) => driveStates.push(event));
    const controller = new TankController(tank, events);

    controller.update(0.5, { forward: 1, turn: -0.5 });
    controller.update(0.5, { forward: 1, turn: 0 });

    expect(driveStates).toEqual([
      {
        acceleration: CONTROL_TUNING.DRIVE_SPEED / 0.5,
        turnRate: -0.5 * CONTROL_TUNING.HULL_TURN_SPEED,
        speed: CONTROL_TUNING.DRIVE_SPEED,
      },
      {
        acceleration: 0,
        turnRate: 0,
        speed: CONTROL_TUNING.DRIVE_SPEED,
      },
    ]);

    scene.dispose();
    engine.dispose();
  });
});
