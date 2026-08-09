import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { calculateBallisticVelocity, offsetRicochetOrigin } from "./shells";

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
