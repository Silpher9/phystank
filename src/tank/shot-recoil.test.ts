import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GameEventBus, type GameEvents } from "../core/events";
import { ShellSystem } from "../shells";
import { createTank } from "./tank";
import { SHOT_RECOIL_TUNING, ShotRecoilSystem, barrelOffsetAt } from "./shot-recoil";

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
    const system = new ShotRecoilSystem(events, [tank]);
    const restingZ = tank.cannon.position.z;

    events.emit("SHOT_FIRED", {
      shellId: "test-shell",
      tank: tank.root.name,
      muzzlePosition: { x: 0, y: 2, z: -3 },
      direction: { x: 0, y: 0, z: -1 },
    });
    system.update(SHOT_RECOIL_TUNING.ATTACK_SECONDS);
    expect(tank.cannon.position.z - restingZ).toBeCloseTo(SHOT_RECOIL_TUNING.BARREL_TRAVEL);

    system.update(SHOT_RECOIL_TUNING.SETTLE_SECONDS);
    expect(tank.cannon.position.z).toBeCloseTo(restingZ);

    system.dispose();
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
    const system = new ShotRecoilSystem(events, [tank]);
    const restingZ = tank.cannon.position.z;

    events.emit("SHOT_FIRED", {
      shellId: "test-shell",
      tank: tank.root.name,
      muzzlePosition: { x: 0, y: 2, z: -3 },
      direction: { x: 0, y: 0, z: -1 },
    });
    system.update(SHOT_RECOIL_TUNING.ATTACK_SECONDS);
    tank.cannon.position.z += 0.2;
    system.update(SHOT_RECOIL_TUNING.SETTLE_SECONDS);

    expect(tank.cannon.position.z).toBeCloseTo(restingZ + 0.2);
    system.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("uses a bounded damped curve", () => {
    expect(barrelOffsetAt(0)).toBe(0);
    expect(barrelOffsetAt(SHOT_RECOIL_TUNING.ATTACK_SECONDS)).toBeCloseTo(
      SHOT_RECOIL_TUNING.BARREL_TRAVEL,
    );
    expect(barrelOffsetAt(10)).toBe(0);
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
    const system = new ShotRecoilSystem(events, [tank]);
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

    system.update(SHOT_RECOIL_TUNING.ATTACK_SECONDS);
    expect(tank.cannon.position.z).toBeGreaterThan(restingBarrelZ);

    system.dispose();
    scene.dispose();
    engine.dispose();
  });
});
