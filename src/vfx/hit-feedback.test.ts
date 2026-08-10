import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "../core/ballistics";
import { GameEventBus } from "../core/events";
import { createPlayerCamera } from "../camera";
import {
  HIT_EFFECT_PROFILES,
  SHOT_FLASH_TUNING,
  TRACER_TUNING,
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

  it("holds the complete muzzle-to-impact trail after a one-frame shot", () => {
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
      position: { x: 0, y: 1.2, z: -12 },
    });
    expect(feedback.activeTracerCount).toBe(1);
    const tracer = scene.getMeshByName("tracer-test-shell");
    expect(tracer).not.toBeNull();
    tracer!.computeWorldMatrix(true);
    const bounds = tracer!.getBoundingInfo().boundingBox;
    expect(bounds.maximumWorld.z).toBeGreaterThan(-0.1);
    expect(bounds.minimumWorld.z).toBeLessThan(-11.9);
    expect(scene.getMeshByName("muzzle-flash-core")).not.toBeNull();
    expect(scene.getMeshByName("muzzle-flash-burst")).not.toBeNull();
    expect(SHOT_FLASH_TUNING.lifetime).toBeLessThanOrEqual(0.05);
    expect(SHOT_FLASH_TUNING.emissivePeak).toBeGreaterThanOrEqual(1.2);

    events.emit("SHELL_DESPAWNED", {
      shellId: "test-shell",
      position: { x: 0, y: 1.2, z: -12 },
    });
    feedback.update(TRACER_TUNING.impactHoldSeconds);
    expect(feedback.activeTracerCount).toBe(1);
    expect(tracer!.visibility).toBe(1);
    feedback.update(TRACER_TUNING.impactFadeSeconds + 0.01);
    expect(feedback.activeTracerCount).toBe(0);

    feedback.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("holds both legs of a ricochet as one kinked trail", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);
    const events = new GameEventBus();
    const feedback = new HitFeedbackSystem(scene, camera, events, null, { random: () => 0.5 });

    events.emit("SHOT_FIRED", {
      shellId: "ricochet-trail",
      tank: "player",
      muzzlePosition: { x: 0, y: 2, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
      spreadDegrees: 0,
      deviationDegrees: 0,
    });
    events.emit("SHELL_MOVED", {
      shellId: "ricochet-trail",
      position: { x: 0, y: 2, z: -8 },
    });
    events.emit("RICOCHET", {
      shellId: "ricochet-trail",
      tank: null,
      point: { x: 0, y: 2, z: -8 },
      normal: { x: 1, y: 0, z: 0 },
      incoming: { x: 0, y: 0, z: -1 },
      outgoing: { x: 1, y: 0, z: 0 },
      retainedSpeed: 382,
    });
    events.emit("SHELL_MOVED", {
      shellId: "ricochet-trail",
      position: { x: 6, y: 2, z: -8 },
    });
    events.emit("SHELL_DESPAWNED", {
      shellId: "ricochet-trail",
      position: { x: 6, y: 2, z: -8 },
    });

    const tracer = scene.getMeshByName("tracer-ricochet-trail");
    expect(tracer).not.toBeNull();
    tracer!.computeWorldMatrix(true);
    const bounds = tracer!.getBoundingInfo().boundingBox;
    expect(bounds.maximumWorld.z).toBeGreaterThan(-0.1);
    expect(bounds.minimumWorld.z).toBeLessThan(-7.9);
    expect(bounds.maximumWorld.x).toBeGreaterThan(5.9);
    expect(bounds.minimumWorld.x).toBeLessThan(0.1);

    const normalTrailLifetime = TRACER_TUNING.impactHoldSeconds
      + TRACER_TUNING.impactFadeSeconds;
    feedback.update(normalTrailLifetime + 0.01);
    expect(feedback.activeTracerCount).toBe(1);
    feedback.update(TRACER_TUNING.ricochetHoldSeconds
      + TRACER_TUNING.ricochetFadeSeconds);
    expect(feedback.activeTracerCount).toBe(0);

    feedback.dispose();
    scene.dispose();
    engine.dispose();
  });
});
