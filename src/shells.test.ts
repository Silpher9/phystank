import { Ray } from "@babylonjs/core/Culling/ray";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { offsetRicochetOrigin } from "./shells";

describe("ricochet continuation", () => {
  it("offsets a grazing continuation beyond the hit plate so its next segment cannot re-hit it", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const plate = MeshBuilder.CreateBox("plate", { width: 10, height: 0.2, depth: 10 }, scene);
    const incoming = new Ray(new Vector3(-1, 0.12, 0), new Vector3(1, -0.02, 0).normalize(), 2);
    const firstHit = scene.pickWithRay(incoming, (mesh) => mesh === plate);
    expect(firstHit?.hit).toBe(true);
    if (!firstHit?.pickedPoint) throw new Error("Expected first segment to hit the armor plate");

    const continuationStart = offsetRicochetOrigin(firstHit.pickedPoint!, Vector3.Up());
    const continuation = new Ray(continuationStart, new Vector3(1, 0.02, 0).normalize(), 2);
    expect(scene.pickWithRay(continuation, (mesh) => mesh === plate)?.hit).toBe(false);

    scene.dispose();
    engine.dispose();
  });
});
