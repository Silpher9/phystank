import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "../core/ballistics";
import { GameEventBus } from "../core/events";
import { createPlayerCamera } from "../camera";
import {
  HIT_EFFECT_PROFILES,
  SHOT_FLASH_TUNING,
  HitFeedbackSystem,
} from "./hit-feedback";

describe("gritty hit feedback", () => {
  it("keeps the three armor outcomes distinct by form and motion", () => {
    expect(HIT_EFFECT_PROFILES[HitOutcome.PENETRATION]).toMatchObject({
      mark: true,
      debris: "INWARD",
    });
    expect(HIT_EFFECT_PROFILES[HitOutcome.RICOCHET]).toMatchObject({
      mark: false,
      debris: "NONE",
    });
    expect(HIT_EFFECT_PROFILES[HitOutcome.SHATTER]).toMatchObject({
      mark: false,
      debris: "DROP",
    });
  });

  it("tracks shell lifecycle for a fading ballistic tracer", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);
    const events = new GameEventBus();
    const feedback = new HitFeedbackSystem(scene, camera, events, null, { random: () => 0.5 });

    events.emit("SHOT_FIRED", {
      shellId: "test-shell",
      tank: "player",
      muzzlePosition: { x: 0, y: 2, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
      spreadDegrees: 0,
      deviationDegrees: 0,
    });
    events.emit("SHELL_MOVED", {
      shellId: "test-shell",
      position: { x: 0, y: 1.9, z: -2 },
    });
    expect(feedback.activeTracerCount).toBe(1);
    expect(scene.getMeshByName("muzzle-flash-core")).not.toBeNull();
    expect(scene.getMeshByName("muzzle-flash-burst")).not.toBeNull();
    expect(SHOT_FLASH_TUNING.lifetime).toBeLessThanOrEqual(0.05);
    expect(SHOT_FLASH_TUNING.emissivePeak).toBeGreaterThanOrEqual(1.2);

    events.emit("SHELL_DESPAWNED", {
      shellId: "test-shell",
      position: { x: 0, y: 1.8, z: -3 },
    });
    feedback.update(0.2);
    expect(feedback.activeTracerCount).toBe(0);

    feedback.dispose();
    scene.dispose();
    engine.dispose();
  });
});
