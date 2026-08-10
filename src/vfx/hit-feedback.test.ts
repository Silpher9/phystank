import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "../core/ballistics";
import { GameEventBus } from "../core/events";
import { HitCategory, ObjectHitOutcome } from "../core/impacts";
import { SHELL_TUNING } from "../shells";
import { createPlayerCamera } from "../camera";
import {
  HIT_EFFECT_PROFILES,
  IMPACT_VFX_TUNING,
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

  it("stages core, debris, and lingering dust on distinct impact timescales", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);
    const events = new GameEventBus();
    const feedback = new HitFeedbackSystem(scene, camera, events, null, {
      random: () => 0.5,
    });

    events.emit("HIT", {
      shellId: "layered-impact",
      tank: "target",
      outcome: HitOutcome.SHATTER,
      facetId: "FRONT",
      point: { x: 0, y: 1.2, z: -12 },
      normal: { x: 0, y: 0, z: 1 },
      incoming: { x: 0, y: 0, z: -1 },
      impactAngleDegrees: 0,
      nominalThickness: 100,
      effectiveThickness: 100,
      penetration: 75,
    });

    expect(meshesNamed(scene, "impact-core")).toHaveLength(1);
    expect(meshesNamed(scene, "impact-core")[0].isEnabled()).toBe(true);
    expect(meshesNamed(scene, "impact-fragment")).toHaveLength(8);
    expect(meshesNamed(scene, "impact-fragment").every((mesh) => !mesh.isEnabled())).toBe(true);
    expect(meshesNamed(scene, "impact-dust")).toHaveLength(5);
    expect(meshesNamed(scene, "impact-dust").every((mesh) => !mesh.isEnabled())).toBe(true);

    feedback.update(0.035);
    expect(meshesNamed(scene, "impact-core")).toHaveLength(1);
    expect(meshesNamed(scene, "impact-fragment").every((mesh) => mesh.isEnabled())).toBe(true);
    expect(meshesNamed(scene, "impact-dust").every((mesh) => !mesh.isEnabled())).toBe(true);

    feedback.update(0.055);
    expect(meshesNamed(scene, "impact-core")).toHaveLength(0);
    expect(meshesNamed(scene, "impact-dust").every((mesh) => mesh.isEnabled())).toBe(true);
    feedback.update(0.9);
    expect(meshesNamed(scene, "impact-dust")).toHaveLength(5);
    feedback.update(0.4);
    expect(meshesNamed(scene, "impact-dust")).toHaveLength(0);

    feedback.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("throws an earthy layered burst for a ground miss", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);
    const events = new GameEventBus();
    const feedback = new HitFeedbackSystem(scene, camera, events, null, {
      random: () => 0.5,
    });

    events.emit("OBJECT_HIT", {
      targetId: "arena-ground",
      category: HitCategory.HARD,
      outcome: ObjectHitOutcome.STOPPED,
      point: { x: 2, y: 0, z: -4 },
      normal: { x: 0, y: 1, z: 0 },
      incoming: { x: 0, y: -0.2, z: -0.98 },
      impactAngleDegrees: 78,
    });

    expect(feedback.lastCue).toBe("ground");
    expect(meshesNamed(scene, "impact-fragment")).toHaveLength(
      IMPACT_VFX_TUNING.groundDebrisCount,
    );
    expect(meshesNamed(scene, "impact-dust")).toHaveLength(
      IMPACT_VFX_TUNING.groundDustCount,
    );

    feedback.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("fits the feedback layers to realistic shell travel time", () => {
    const travelAt12 = 12 / SHELL_TUNING.speed;
    const travelAt20 = 20 / SHELL_TUNING.speed;
    const travelAt40 = 40 / SHELL_TUNING.speed;

    expect(travelAt12).toBeCloseTo(0.020, 3);
    expect(travelAt20).toBeCloseTo(0.034, 3);
    expect(travelAt40).toBeCloseTo(0.068, 3);
    expect(IMPACT_VFX_TUNING.shotShakeSeconds).toBeLessThan(travelAt20);
    expect(IMPACT_VFX_TUNING.debrisDelaySeconds.maximum).toBeLessThan(
      IMPACT_VFX_TUNING.dustDelaySeconds.minimum,
    );
    expect(IMPACT_VFX_TUNING.dustLifetimeSeconds.minimum).toBeGreaterThanOrEqual(0.9);
    expect(IMPACT_VFX_TUNING.dustAlpha).toBeLessThanOrEqual(0.3);
    expect(IMPACT_VFX_TUNING.smokeLifetimeSeconds.minimum).toBeGreaterThanOrEqual(1.5);
  });

  it("anchors flash and trail at a downward-tilted muzzle", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);
    const events = new GameEventBus();
    const feedback = new HitFeedbackSystem(scene, camera, events, null, {
      random: () => 0.5,
    });
    const muzzle = new Vector3(3, 2.37, -1);
    const depression = 8 * Math.PI / 180;
    const direction = new Vector3(0, -Math.sin(depression), -Math.cos(depression));

    events.emit("SHOT_FIRED", {
      shellId: "depressed-shot",
      tank: "player",
      muzzlePosition: muzzle,
      direction,
      spreadDegrees: 0,
      deviationDegrees: 0,
    });
    events.emit("SHELL_MOVED", {
      shellId: "depressed-shot",
      position: muzzle.add(direction.scale(12)),
    });

    const flashCore = scene.getMeshByName("muzzle-flash-core");
    const flashGlow = scene.getMeshByName("muzzle-flash-glow");
    const flashIntermediate = scene.getMeshByName("muzzle-flash-intermediate");
    const flashBurst = scene.getMeshByName("muzzle-flash-burst");
    expect(flashCore).not.toBeNull();
    expect(flashGlow).not.toBeNull();
    expect(flashIntermediate).not.toBeNull();
    expect(flashBurst).not.toBeNull();
    const coreOffset = flashCore!.position.subtract(muzzle);
    const intermediateOffset = flashIntermediate!.position.subtract(muzzle);
    const burstOffset = flashBurst!.position.subtract(muzzle);
    expect(Vector3.Dot(coreOffset.normalizeToNew(), direction)).toBeCloseTo(1);
    expect(coreOffset.length()).toBeCloseTo(SHOT_FLASH_TUNING.axialLength * 0.35);
    expect(Vector3.Dot(intermediateOffset.normalizeToNew(), direction)).toBeCloseTo(1);
    expect(intermediateOffset.length()).toBeCloseTo(SHOT_FLASH_TUNING.intermediateOffset);
    expect(Vector3.Dot(burstOffset.normalizeToNew(), direction)).toBeCloseTo(1);
    expect(burstOffset.length()).toBeCloseTo(SHOT_FLASH_TUNING.secondaryOffset);

    for (const flash of [flashGlow!, flashCore!, flashIntermediate!, flashBurst!]) {
      flash.setEnabled(true);
      flash.computeWorldMatrix(true);
      expect(flash.getBoundingInfo().boundingBox.minimumWorld.y).toBeGreaterThan(0);
    }

    const tracer = scene.getMeshByName("tracer-depressed-shot");
    expect(tracer).not.toBeNull();
    tracer!.computeWorldMatrix(true);
    const bounds = tracer!.getBoundingInfo().boundingBox;
    expect(bounds.maximumWorld.y).toBeGreaterThan(muzzle.y - 0.1);
    expect(bounds.minimumWorld.y).toBeLessThan(muzzle.y - 1.5);

    feedback.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("layers a larger forward flash without increasing its emissive peak", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);
    const events = new GameEventBus();
    const feedback = new HitFeedbackSystem(scene, camera, events, null, {
      random: () => 0.5,
    });

    events.emit("SHOT_FIRED", {
      shellId: "layered-flash",
      tank: "player",
      muzzlePosition: { x: 0, y: 2.37, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
      spreadDegrees: 0,
      deviationDegrees: 0,
    });

    const core = scene.getMeshByName("muzzle-flash-core")!;
    const intermediate = scene.getMeshByName("muzzle-flash-intermediate")!;
    const secondary = scene.getMeshByName("muzzle-flash-burst")!;
    expect(core.isEnabled()).toBe(true);
    expect(intermediate.isEnabled()).toBe(false);
    expect(secondary.isEnabled()).toBe(false);
    expect(meshesNamed(scene, "muzzle-spark")).toHaveLength(
      SHOT_FLASH_TUNING.sparkCount,
    );
    expect(scene.getLightByName("muzzle-flash-light")).not.toBeNull();

    feedback.update(SHOT_FLASH_TUNING.intermediateDelay + 0.001);
    expect(intermediate.isEnabled()).toBe(true);
    expect(secondary.isEnabled()).toBe(false);
    feedback.update(
      SHOT_FLASH_TUNING.secondaryDelay
        - SHOT_FLASH_TUNING.intermediateDelay,
    );
    expect(secondary.isEnabled()).toBe(true);

    expect(SHOT_FLASH_TUNING.intermediateOffset).toBeGreaterThanOrEqual(1.1);
    expect(SHOT_FLASH_TUNING.intermediateOffset).toBeLessThanOrEqual(1.4);
    expect(SHOT_FLASH_TUNING.secondaryOffset).toBeGreaterThan(
      SHOT_FLASH_TUNING.intermediateOffset,
    );
    expect(SHOT_FLASH_TUNING.secondaryOffset).toBeGreaterThanOrEqual(1.4);
    expect(SHOT_FLASH_TUNING.secondaryOffset).toBeLessThanOrEqual(3.5);
    expect(SHOT_FLASH_TUNING.emissivePeak).toBeLessThanOrEqual(1.35);
    feedback.update(SHOT_FLASH_TUNING.lightLifetime);
    expect(scene.getLightByName("muzzle-flash-light")).toBeNull();

    feedback.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("keeps muzzle dust low, broad, lit, and lingering", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = createPlayerCamera(scene);
    const events = new GameEventBus();
    let randomIndex = 0;
    const feedback = new HitFeedbackSystem(scene, camera, events, null, {
      random: () => randomIndex++ % 2,
    });

    events.emit("SHOT_FIRED", {
      shellId: "dust-cone",
      tank: "player",
      muzzlePosition: { x: 0, y: 2.37, z: 0 },
      direction: { x: 0, y: -0.1, z: -0.995 },
      spreadDegrees: 0,
      deviationDegrees: 0,
    });

    const skirt = meshesNamed(scene, "muzzle-dust-skirt");
    const fineDust = meshesNamed(scene, "muzzle-dust-fine");
    const dust = [...skirt, ...fineDust];
    expect(skirt).toHaveLength(SHOT_FLASH_TUNING.dustSkirtCount);
    expect(fineDust).toHaveLength(
      SHOT_FLASH_TUNING.dustCount - SHOT_FLASH_TUNING.dustSkirtCount,
    );
    expect(dust.every((mesh) => mesh.position.y <= 0.24)).toBe(true);
    expect(dust.every(
      (mesh) => !(mesh.material as StandardMaterial).disableLighting,
    )).toBe(true);
    expect(fineDust.every(
      (mesh) => mesh.material?.alpha === SHOT_FLASH_TUNING.dustAlpha,
    )).toBe(true);
    expect(SHOT_FLASH_TUNING.dustForwardReach).toBeGreaterThanOrEqual(4);
    expect(SHOT_FLASH_TUNING.dustLateralReach * 2).toBeGreaterThanOrEqual(6);
    const skirtWidth = Math.max(...skirt.map((mesh) => mesh.position.x))
      - Math.min(...skirt.map((mesh) => mesh.position.x));
    expect(skirtWidth).toBeGreaterThanOrEqual(6);
    expect(
      SHOT_FLASH_TUNING.dustSkirtLifetimeSeconds.maximum,
    ).toBeLessThanOrEqual(0.4);
    expect(
      SHOT_FLASH_TUNING.dustLifetimeSeconds.minimum,
    ).toBeGreaterThanOrEqual(1.5);
    feedback.update(0.41);
    expect(meshesNamed(scene, "muzzle-dust-skirt")).toHaveLength(0);
    expect(meshesNamed(scene, "muzzle-dust-fine")).toHaveLength(
      SHOT_FLASH_TUNING.dustCount - SHOT_FLASH_TUNING.dustSkirtCount,
    );
    feedback.update(1);
    expect(meshesNamed(scene, "muzzle-dust-fine")).toHaveLength(
      SHOT_FLASH_TUNING.dustCount - SHOT_FLASH_TUNING.dustSkirtCount,
    );

    feedback.dispose();
    scene.dispose();
    engine.dispose();
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
    expect(scene.getMeshByName("muzzle-flash-glow")).not.toBeNull();
    expect(scene.getMeshByName("muzzle-flash-intermediate")).not.toBeNull();
    expect(scene.getMeshByName("muzzle-flash-burst")).not.toBeNull();
    expect(SHOT_FLASH_TUNING.lifetime).toBeLessThanOrEqual(0.03);
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

function meshesNamed(scene: Scene, name: string) {
  return scene.meshes.filter((mesh) => mesh.name === name);
}
