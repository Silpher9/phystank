import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { GameEventBus, type GameEvents } from "./core/events";
import {
  ShellSystem,
  applyAimSpread,
  calculateBallisticVelocity,
  offsetRicochetOrigin,
} from "./shells";
import { createTank } from "./tank/tank";

describe("ballistic aiming", () => {
  it("uses the low trajectory to pass through armor height at demo distance", () => {
    const origin = new Vector3(0, 2.37, 0);
    const distance = 12.1;
    const velocity = calculateBallisticVelocity(origin, Vector3.Forward(), distance, 1.2);
    expect(velocity).not.toBeNull();
    const flightTime = distance / Math.hypot(velocity!.x, velocity!.z);
    const height = origin.y + velocity!.y * flightTime - 0.5 * 9.81 * flightTime ** 2;
    expect(height).toBeCloseTo(1.2, 4);
  });

  it("applies a deterministic deviation within the current spread cone", () => {
    const randomValues = [1, 0.25];
    const spread = applyAimSpread(Vector3.Forward(), 7, () => randomValues.shift() ?? 0);
    const deviation = Math.acos(Vector3.Dot(Vector3.Forward(), spread.direction)) * 180 / Math.PI;

    expect(spread.deviationDegrees).toBeCloseTo(7);
    expect(deviation).toBeCloseTo(7);
    expect(spread.direction.length()).toBeCloseTo(1);
  });

  it("fires along the deviated direction and publishes the actual error", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const randomValues = [1, 0.25];
    const shells = new ShellSystem(scene, events, () => randomValues.shift() ?? 0);
    const tank = createTank(scene, {
      name: "spread-fire-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    const target = new Vector3(0, 0, -12);
    const origin = tank.muzzle.getAbsolutePosition();
    const horizontal = target.subtract(origin);
    horizontal.y = 0;
    const distance = horizontal.length();
    const ballistic = calculateBallisticVelocity(
      origin,
      horizontal.normalize(),
      distance,
      1.2,
    )!.normalize();
    const shots: GameEvents["SHOT_FIRED"][] = [];
    events.on("SHOT_FIRED", (event) => shots.push(event));

    shells.fire(tank, target, 7);

    expect(shots).toHaveLength(1);
    expect(shots[0].spreadDegrees).toBe(7);
    expect(shots[0].deviationDegrees).toBeCloseTo(7);
    const fired = new Vector3(
      shots[0].direction.x,
      shots[0].direction.y,
      shots[0].direction.z,
    );
    const actualDeviation = Math.acos(Vector3.Dot(ballistic, fired)) * 180 / Math.PI;
    expect(actualDeviation).toBeCloseTo(7);
    scene.dispose();
    engine.dispose();
  });
});

describe("ricochet continuation", () => {
  it("offsets a grazing continuation beyond the hit plate", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plate = MeshBuilder.CreateBox("plate", { width: 10, height: 0.2, depth: 10 }, scene);
    const firstHit = scene.pickWithRay(new Ray(new Vector3(-1, 0.12, 0), new Vector3(1, -0.02, 0).normalize(), 2), (mesh) => mesh === plate);
    if (!firstHit?.pickedPoint) throw new Error("Expected armor hit");
    const continuation = new Ray(offsetRicochetOrigin(firstHit.pickedPoint, Vector3.Up()), new Vector3(1, 0.02, 0).normalize(), 2);
    expect(scene.pickWithRay(continuation, (mesh) => mesh === plate)?.hit).toBe(false);
    scene.dispose(); engine.dispose();
  });
});
