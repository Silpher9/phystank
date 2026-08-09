import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { CAMERA_TUNING, createPlayerCamera, followPlayer } from "./camera";

describe("player camera", () => {
  it("follows the player without changing the approved view angle or distance", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);

    followPlayer(camera, new Vector3(31, 4, -27));

    expect(camera.target.asArray()).toEqual([31, CAMERA_TUNING.targetHeight, -27]);
    expect(camera.alpha).toBe(CAMERA_TUNING.alpha);
    expect(camera.beta).toBe(CAMERA_TUNING.beta);
    expect(camera.radius).toBe(CAMERA_TUNING.radius);

    scene.dispose();
    engine.dispose();
  });
});
