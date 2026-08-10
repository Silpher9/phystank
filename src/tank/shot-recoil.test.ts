import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GameEventBus, type GameEvents } from "../core/events";
import { readFacetPose } from "../debug/debug-overlay";
import { ShellSystem } from "../shells";
import { HullPoseComposer } from "./hull-pose";
import { createTank } from "./tank";
import {
  SHOT_RECOIL_TUNING,
  ShotRecoilSystem,
  barrelOffsetAt,
  hullKickPitchAt,
} from "./shot-recoil";

describe("shot recoil", () => {
  it("snaps the barrel back and settles exactly at rest", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const tank = createTank(scene, {
      name: "recoil-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const hullPose = new HullPoseComposer(tank);
    const system = new ShotRecoilSystem(events, [{ tank, hullPose }]);
    const restingZ = tank.cannon.position.z;
    const restingFrontSlope = readFacetPose(tank.facets.FRONT).slopeDegrees;

    events.emit("SHOT_FIRED", {
      shellId: "test-shell",
      tank: tank.root.name,
      muzzlePosition: { x: 0, y: 2, z: -3 },
      direction: { x: 0, y: 0, z: -1 },
      spreadDegrees: 0,
      deviationDegrees: 0,
    });
    system.update(SHOT_RECOIL_TUNING.HULL_ATTACK_SECONDS);
    hullPose.apply();
    expect(readFacetPose(tank.facets.FRONT).slopeDegrees - restingFrontSlope).toBeCloseTo(
      SHOT_RECOIL_TUNING.HULL_KICK_DEGREES,
    );

    system.update(SHOT_RECOIL_TUNING.ATTACK_SECONDS - SHOT_RECOIL_TUNING.HULL_ATTACK_SECONDS);
    hullPose.apply();
    expect(tank.cannon.position.z - restingZ).toBeCloseTo(SHOT_RECOIL_TUNING.BARREL_TRAVEL);

    system.update(SHOT_RECOIL_TUNING.SETTLE_SECONDS);
    hullPose.apply();
    expect(tank.cannon.position.z).toBeCloseTo(restingZ);
    expect(readFacetPose(tank.facets.FRONT).slopeDegrees).toBeCloseTo(restingFrontSlope);

    system.dispose();
    hullPose.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("removes only its own offset when another system moves the barrel", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const tank = createTank(scene, {
      name: "composed-recoil-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const hullPose = new HullPoseComposer(tank);
    const system = new ShotRecoilSystem(events, [{ tank, hullPose }]);
    const restingZ = tank.cannon.position.z;

    events.emit("SHOT_FIRED", {
      shellId: "test-shell",
      tank: tank.root.name,
      muzzlePosition: { x: 0, y: 2, z: -3 },
      direction: { x: 0, y: 0, z: -1 },
      spreadDegrees: 0,
      deviationDegrees: 0,
    });
    system.update(SHOT_RECOIL_TUNING.ATTACK_SECONDS);
    tank.cannon.position.z += 0.2;
    system.update(SHOT_RECOIL_TUNING.SETTLE_SECONDS);
    hullPose.apply();

    expect(tank.cannon.position.z).toBeCloseTo(restingZ + 0.2);
    system.dispose();
    hullPose.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("uses a bounded damped curve", () => {
    expect(barrelOffsetAt(0)).toBe(0);
    expect(barrelOffsetAt(SHOT_RECOIL_TUNING.ATTACK_SECONDS)).toBeCloseTo(
      SHOT_RECOIL_TUNING.BARREL_TRAVEL,
    );
    expect(barrelOffsetAt(10)).toBe(0);
    expect(hullKickPitchAt(SHOT_RECOIL_TUNING.HULL_ATTACK_SECONDS) * 180 / Math.PI).toBeCloseTo(
      SHOT_RECOIL_TUNING.HULL_KICK_DEGREES,
    );
    expect(hullKickPitchAt(10)).toBe(0);
  });

  it("fires from the resting muzzle before recoil starts", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const tank = createTank(scene, {
      name: "fire-order-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const hullPose = new HullPoseComposer(tank);
    const system = new ShotRecoilSystem(events, [{ tank, hullPose }]);
    const shells = new ShellSystem(scene, events);
    const shots: GameEvents["SHOT_FIRED"][] = [];
    events.on("SHOT_FIRED", (event) => shots.push(event));
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    const restingBarrelZ = tank.cannon.position.z;
    const restingMuzzle = tank.muzzle.getAbsolutePosition();

    shells.fire(tank, new Vector3(0, 0, -12));

    expect(tank.cannon.position.z).toBe(restingBarrelZ);
    expect(shots).toHaveLength(1);
    expect(shots[0].muzzlePosition.x).toBeCloseTo(restingMuzzle.x);
    expect(shots[0].muzzlePosition.y).toBeCloseTo(restingMuzzle.y);
    expect(shots[0].muzzlePosition.z).toBeCloseTo(restingMuzzle.z);
    expect(tank.root.rotation.x).toBe(0);

    system.update(SHOT_RECOIL_TUNING.HULL_ATTACK_SECONDS);
    hullPose.apply();
    expect(tank.cannon.position.z).toBeGreaterThan(restingBarrelZ);
    expect(tank.root.rotation.x).toBeGreaterThan(0);

    system.dispose();
    hullPose.dispose();
    scene.dispose();
    engine.dispose();
  });
});
