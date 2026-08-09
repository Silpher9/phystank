import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GameEventBus } from "../core/events";
import { readFacetPose } from "../debug/debug-overlay";
import { CONTROL_TUNING } from "./controls";
import {
  DRIVING_SUSPENSION_TUNING,
  DrivingSuspensionSystem,
} from "./driving-suspension";
import { HullPoseComposer } from "./hull-pose";
import { createTank } from "./tank";

const FRAME_SECONDS = 1 / 60;

describe("driving suspension", () => {
  it("raises the nose transiently when accelerating and returns to nominal at constant speed", () => {
    const fixture = createFixture("acceleration-suspension");
    const restingSlope = readFacetPose(fixture.tank.facets.FRONT).slopeDegrees;

    emitDrive(fixture.events, CONTROL_TUNING.DRIVE_SPEED, 0);
    const firstOffset = step(fixture, 1);
    expect(firstOffset.pitchRadians).toBeGreaterThan(0);
    expect(firstOffset.pitchRadians * 180 / Math.PI).toBeLessThan(
      DRIVING_SUSPENSION_TUNING.MAX_PITCH_DEGREES,
    );

    step(fixture, 240);
    expect(fixture.tank.root.rotation.x).toBe(0);
    expect(readFacetPose(fixture.tank.facets.FRONT).slopeDegrees).toBeCloseTo(restingSlope, 5);
    fixture.dispose();
  });

  it("dives when braking and settles exactly at rest", () => {
    const fixture = createFixture("braking-suspension");
    emitDrive(fixture.events, CONTROL_TUNING.DRIVE_SPEED, 0);
    step(fixture, 240);

    emitDrive(fixture.events, 0, 0);
    const brakingOffset = step(fixture, 1);
    expect(brakingOffset.pitchRadians).toBeLessThan(0);

    step(fixture, 240);
    expect(fixture.tank.root.rotation.x).toBe(0);
    expect(fixture.tank.root.rotation.z).toBe(0);
    fixture.dispose();
  });

  it("ignores the controller's one-frame acceleration spike", () => {
    const fixture = createFixture("acceleration-spike-suspension");
    fixture.events.emit("DRIVE_STATE", {
      acceleration: 440,
      speed: 0,
      turnRate: 0,
    });

    const offset = step(fixture, 1);
    expect(offset).toEqual({ pitchRadians: 0, rollRadians: 0 });
    expect(fixture.tank.root.rotation.x).toBe(0);
    fixture.dispose();
  });

  it("holds opposite bounded rolls throughout steady left and right turns", () => {
    const left = createFixture("left-turn-suspension");
    emitDrive(left.events, CONTROL_TUNING.DRIVE_SPEED, CONTROL_TUNING.HULL_TURN_SPEED);
    const leftOffset = step(left, 120);
    expect(leftOffset.pitchRadians).toBe(0);
    expect(leftOffset.rollRadians).toBeLessThan(0);
    expect(Math.abs(leftOffset.rollRadians * 180 / Math.PI)).toBeLessThanOrEqual(
      DRIVING_SUSPENSION_TUNING.MAX_ROLL_DEGREES,
    );

    const right = createFixture("right-turn-suspension");
    emitDrive(right.events, CONTROL_TUNING.DRIVE_SPEED, -CONTROL_TUNING.HULL_TURN_SPEED);
    const rightOffset = step(right, 120);
    expect(rightOffset.rollRadians).toBeGreaterThan(0);
    expect(rightOffset.rollRadians).toBeCloseTo(-leftOffset.rollRadians);

    emitDrive(left.events, 0, 0);
    step(left, 240);
    expect(left.tank.root.rotation.x).toBe(0);
    expect(left.tank.root.rotation.z).toBe(0);
    left.dispose();
    right.dispose();
  });

  it("hard-caps extreme drive input and composes with recoil", () => {
    const fixture = createFixture("bounded-suspension");
    fixture.hullPose.setSource("shot-recoil", { pitchRadians: 0.02, rollRadians: 0 });
    emitDrive(fixture.events, 10_000, 10_000);
    const maximumPitch = DRIVING_SUSPENSION_TUNING.MAX_PITCH_DEGREES * Math.PI / 180;
    const maximumRoll = DRIVING_SUSPENSION_TUNING.MAX_ROLL_DEGREES * Math.PI / 180;
    let maximumObservedPitch = 0;
    let maximumObservedRoll = 0;
    let offset = { pitchRadians: 0, rollRadians: 0 };
    for (let frame = 0; frame < 240; frame += 1) {
      offset = fixture.suspension.update(FRAME_SECONDS);
      fixture.hullPose.apply();
      maximumObservedPitch = Math.max(maximumObservedPitch, Math.abs(offset.pitchRadians));
      maximumObservedRoll = Math.max(maximumObservedRoll, Math.abs(offset.rollRadians));
    }

    expect(maximumObservedPitch).toBeLessThanOrEqual(maximumPitch);
    expect(maximumObservedRoll).toBeLessThanOrEqual(maximumRoll);
    expect(fixture.tank.root.rotation.x).toBeCloseTo(offset.pitchRadians + 0.02);
    expect(fixture.tank.root.rotation.z).toBeCloseTo(offset.rollRadians);
    fixture.dispose();
  });
});

function createFixture(name: string) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const events = new GameEventBus();
  const tank = createTank(scene, {
    name,
    profile: "BRAWLER",
    position: Vector3.Zero(),
    color: Color3.White(),
  });
  const hullPose = new HullPoseComposer(tank);
  const suspension = new DrivingSuspensionSystem(events, hullPose);
  return {
    engine,
    scene,
    events,
    tank,
    hullPose,
    suspension,
    dispose: () => {
      suspension.dispose();
      hullPose.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function emitDrive(events: GameEventBus, speed: number, turnRate: number): void {
  events.emit("DRIVE_STATE", { acceleration: 0, speed, turnRate });
}

function step(fixture: ReturnType<typeof createFixture>, frames: number) {
  let offset = { pitchRadians: 0, rollRadians: 0 };
  for (let frame = 0; frame < frames; frame += 1) {
    offset = fixture.suspension.update(FRAME_SECONDS);
    fixture.hullPose.apply();
  }
  return offset;
}
