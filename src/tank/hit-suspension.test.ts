import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "../core/ballistics";
import { GameEventBus } from "../core/events";
import { HullPoseComposer } from "./hull-pose";
import {
  HIT_SUSPENSION_ATTACK_SECONDS,
  HIT_SUSPENSION_PROFILES,
  HitSuspensionSystem,
} from "./hit-suspension";
import { createTank } from "./tank";

describe("hit suspension", () => {
  it("tilts only the receiving tank along an oblique shell direction", () => {
    const fixture = createFixture();
    fixture.target.root.rotation.y = 0.7;
    const localIncoming = new Vector3(0.8, 0, 0.6);
    const worldIncoming = Vector3.TransformNormal(
      localIncoming,
      fixture.target.root.computeWorldMatrix(true),
    );

    emitHit(fixture.events, fixture.target.root.name, worldIncoming, HitOutcome.PENETRATION);
    fixture.system.update(HIT_SUSPENSION_ATTACK_SECONDS);
    const playerPose = fixture.playerPose.apply();
    const targetPose = fixture.targetPose.apply();
    const amplitude = HIT_SUSPENSION_PROFILES[HitOutcome.PENETRATION].amplitudeDegrees
      * Math.PI / 180;

    expect(playerPose).toEqual({ pitchRadians: 0, rollRadians: 0 });
    expect(targetPose.pitchRadians).toBeCloseTo(localIncoming.z * amplitude);
    expect(targetPose.rollRadians).toBeCloseTo(-localIncoming.x * amplitude);
    fixture.dispose();
  });

  it("uses distinct penetration, shatter, and ricochet strengths", () => {
    expect(HIT_SUSPENSION_PROFILES[HitOutcome.PENETRATION].amplitudeDegrees).toBeGreaterThan(
      HIT_SUSPENSION_PROFILES[HitOutcome.SHATTER].amplitudeDegrees,
    );
    expect(HIT_SUSPENSION_PROFILES[HitOutcome.SHATTER].amplitudeDegrees).toBeGreaterThan(
      HIT_SUSPENSION_PROFILES[HitOutcome.RICOCHET].amplitudeDegrees,
    );

    const fixture = createFixture();
    fixture.events.emit("RICOCHET", {
      shellId: "ricochet-shell",
      tank: fixture.target.root.name,
      point: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
      incoming: { x: 0, y: 0, z: 1 },
      outgoing: { x: 1, y: 0, z: 0 },
      retainedSpeed: 25,
    });
    fixture.system.update(HIT_SUSPENSION_ATTACK_SECONDS);
    const pose = fixture.targetPose.apply();
    expect(pose.pitchRadians * 180 / Math.PI).toBeCloseTo(
      HIT_SUSPENSION_PROFILES[HitOutcome.RICOCHET].amplitudeDegrees,
    );
    fixture.dispose();
  });

  it("settles exactly while preserving another pose source", () => {
    const fixture = createFixture();
    fixture.targetPose.setSource("driving-suspension", {
      pitchRadians: 0.03,
      rollRadians: -0.02,
    });
    emitHit(
      fixture.events,
      fixture.target.root.name,
      new Vector3(0, 0, 1),
      HitOutcome.SHATTER,
    );
    fixture.system.update(HIT_SUSPENSION_ATTACK_SECONDS);
    const active = fixture.targetPose.apply();
    expect(active.pitchRadians).toBeGreaterThan(0.03);

    fixture.system.update(HIT_SUSPENSION_PROFILES[HitOutcome.SHATTER].settleSeconds);
    expect(fixture.targetPose.apply()).toEqual({
      pitchRadians: 0.03,
      rollRadians: -0.02,
    });
    expect(fixture.target.root.rotation.x).toBeCloseTo(0.03);
    expect(fixture.target.root.rotation.z).toBeCloseTo(-0.02);
    fixture.dispose();
  });

  it("ignores ricochets from non-tank targets", () => {
    const fixture = createFixture();
    fixture.events.emit("RICOCHET", {
      shellId: "wall-ricochet",
      tank: null,
      point: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
      incoming: { x: 0, y: 0, z: 1 },
      outgoing: { x: 1, y: 0, z: 0 },
      retainedSpeed: 25,
    });
    fixture.system.update(HIT_SUSPENSION_ATTACK_SECONDS);
    expect(fixture.targetPose.apply()).toEqual({ pitchRadians: 0, rollRadians: 0 });
    fixture.dispose();
  });
});

function createFixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const events = new GameEventBus();
  const player = createTank(scene, {
    name: "hit-suspension-player",
    profile: "BRAWLER",
    position: new Vector3(-5, 0, 0),
    color: Color3.White(),
  });
  const target = createTank(scene, {
    name: "hit-suspension-target",
    profile: "ALLROUNDER",
    position: new Vector3(5, 0, 0),
    color: Color3.Gray(),
  });
  const playerPose = new HullPoseComposer(player);
  const targetPose = new HullPoseComposer(target);
  const system = new HitSuspensionSystem(events, [
    { tank: player, hullPose: playerPose },
    { tank: target, hullPose: targetPose },
  ]);
  return {
    engine,
    scene,
    events,
    player,
    target,
    playerPose,
    targetPose,
    system,
    dispose: () => {
      system.dispose();
      playerPose.dispose();
      targetPose.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function emitHit(
  events: GameEventBus,
  tank: string,
  incoming: Readonly<{ x: number; y: number; z: number }>,
  outcome: HitOutcome,
): void {
  events.emit("HIT", {
    shellId: "hit-shell",
    tank,
    outcome,
    facetId: "FRONT",
    point: { x: 0, y: 1, z: 0 },
    normal: { x: 0, y: 0, z: -1 },
    incoming,
    impactAngleDegrees: 0,
    nominalThickness: 100,
    effectiveThickness: 100,
    penetration: 150,
  });
}
