import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GameEventBus, type GameEvents } from "../core/events";
import { getBarrelDirection, ShellSystem } from "../shells";
import { GUN_ELEVATION_TUNING, GunElevationSystem } from "./gun-elevation";
import { createTank } from "./tank";

describe("gun elevation", () => {
  it("visibly follows the selected surface height", () => {
    const { engine, scene, tank, elevation } = createFixture("surface-height");

    elevation.update(new Vector3(0, 0.9, -20));
    const lowerPitch = tank.gunPivot.rotation.x;
    elevation.update(new Vector3(0, 3.1, -20));
    const upperPitch = tank.gunPivot.rotation.x;

    expect(lowerPitch).toBeLessThan(0);
    expect(upperPitch).toBeGreaterThan(lowerPitch);
    expect(elevation.reachable).toBe(true);
    elevation.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("clamps depression and elevation at the mechanical limits", () => {
    const { engine, scene, tank, elevation } = createFixture("mechanical-limits");

    elevation.update(new Vector3(0, 0, -4));
    expect(toDegrees(tank.gunPivot.rotation.x)).toBeCloseTo(
      -GUN_ELEVATION_TUNING.maxDepressionDegrees,
    );
    expect(elevation.reachable).toBe(false);

    elevation.update(new Vector3(0, 20, -4));
    expect(toDegrees(tank.gunPivot.rotation.x)).toBeCloseTo(
      GUN_ELEVATION_TUNING.maxElevationDegrees,
    );
    expect(elevation.reachable).toBe(false);
    elevation.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("preserves external pivot rotation and lets recoil stay on the tilted axis", () => {
    const { engine, scene, tank, elevation } = createFixture("composed-pose");
    const externalPitch = 2 * Math.PI / 180;
    tank.gunPivot.rotation.x = externalPitch;
    elevation.update(new Vector3(0, 1.2, -16));
    const aimedDirection = getBarrelDirection(tank);
    const muzzleBeforeRecoil = tank.muzzle.getAbsolutePosition().clone();

    tank.cannon.position.z += 0.25;
    tank.cannon.computeWorldMatrix(true);
    tank.muzzle.computeWorldMatrix(true);
    const muzzleAfterRecoil = tank.muzzle.getAbsolutePosition();
    const recoilDirection = muzzleAfterRecoil.subtract(muzzleBeforeRecoil).normalize();
    expect(Math.abs(Vector3.Dot(aimedDirection, recoilDirection))).toBeCloseTo(1);

    elevation.dispose();
    expect(tank.gunPivot.rotation.x).toBeCloseTo(externalPitch);
    scene.dispose();
    engine.dispose();
  });

  it("fires from the tilted muzzle in the direction allowed by the clamp", () => {
    const { engine, scene, tank, elevation } = createFixture("clamped-fire");
    const events = new GameEventBus();
    const shells = new ShellSystem(scene, events);
    const shots: GameEvents["SHOT_FIRED"][] = [];
    events.on("SHOT_FIRED", (event) => shots.push(event));
    const unreachableTarget = new Vector3(0, 0, -4);

    elevation.update(unreachableTarget);
    const muzzle = tank.muzzle.getAbsolutePosition();
    const barrelDirection = getBarrelDirection(tank);
    const cursorDirection = unreachableTarget.subtract(muzzle).normalize();
    shells.fire(tank);

    expect(shots).toHaveLength(1);
    expect(shots[0].muzzlePosition.x).toBeCloseTo(muzzle.x);
    expect(shots[0].muzzlePosition.y).toBeCloseTo(muzzle.y);
    expect(shots[0].muzzlePosition.z).toBeCloseTo(muzzle.z);
    const firedDirection = new Vector3(
      shots[0].direction.x,
      shots[0].direction.y,
      shots[0].direction.z,
    );
    expect(Vector3.Dot(firedDirection, barrelDirection)).toBeCloseTo(1);
    expect(Vector3.Dot(firedDirection, cursorDirection)).toBeLessThan(0.999);
    scene.dispose();
    engine.dispose();
  });
});

function createFixture(name: string) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const tank = createTank(scene, {
    name,
    profile: "BRAWLER",
    position: Vector3.Zero(),
    color: Color3.White(),
  });
  const elevation = new GunElevationSystem(tank);
  return { engine, scene, tank, elevation };
}

function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}
