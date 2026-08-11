import { describe, expect, it } from "vitest";
import { GameEventBus } from "../core/events";
import {
  AIM_CONVERGENCE_TUNING,
  AimConvergenceSystem,
  type AimConvergenceInput,
} from "./aim-convergence";

const STABLE_AIM: AimConvergenceInput = {
  turretYawRadians: 0,
  aimPoint: { x: 10, y: 0, z: 0 },
};

describe("aim convergence", () => {
  it("converges to the exact minimum only while stationary on a stable aim point", () => {
    const events = new GameEventBus();
    const aim = new AimConvergenceSystem(events);
    events.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });

    aim.update(1 / 60, STABLE_AIM);
    expect(aim.currentSpreadDegrees).toBeLessThan(
      AIM_CONVERGENCE_TUNING.MAX_SPREAD_DEGREES,
    );
    for (let frame = 0; frame < 300; frame += 1) aim.update(1 / 60, STABLE_AIM);
    expect(aim.currentSpreadDegrees).toBe(
      AIM_CONVERGENCE_TUNING.MIN_SPREAD_DEGREES,
    );
    aim.dispose();
  });

  it("keeps a visible residual spread while still improving during the wait", () => {
    const events = new GameEventBus();
    const aim = new AimConvergenceSystem(events);
    events.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });

    for (let frame = 0; frame < 60; frame += 1) aim.update(1 / 60, STABLE_AIM);
    const afterOneSecond = aim.currentSpreadDegrees;
    expect(afterOneSecond).toBeGreaterThan(
      AIM_CONVERGENCE_TUNING.MIN_SPREAD_DEGREES,
    );
    expect(afterOneSecond).toBeLessThan(
      AIM_CONVERGENCE_TUNING.MAX_SPREAD_DEGREES,
    );

    for (let frame = 0; frame < 60; frame += 1) aim.update(1 / 60, STABLE_AIM);
    expect(aim.currentSpreadDegrees).toBeLessThan(afterOneSecond);
    aim.dispose();
  });

  it("keeps the resting spread from collapsing to a point", () => {
    // De ring mag nooit tot een punt krimpen; dat was de klacht die #52 opriep.
    // Restonzekerheid is bewust losgelaten (Ingmar, 11 aug): spelers manoeuvreren
    // toch al, dus de spanning zit in stoppen-of-doorrijden, niet in stilstaand missen.
    const restingRing =
      12 *
      Math.tan((AIM_CONVERGENCE_TUNING.MIN_SPREAD_DEGREES * Math.PI) / 180);
    expect(restingRing).toBeGreaterThan(0.2);
  });

  it("supports a session-only minimum spread override", () => {
    const events = new GameEventBus();
    const aim = new AimConvergenceSystem(events);
    events.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });

    aim.setMinimumSpreadDegrees(2.28);
    for (let frame = 0; frame < 300; frame += 1) aim.update(1 / 60, STABLE_AIM);

    expect(aim.minimumSpreadDegrees).toBe(2.28);
    expect(aim.currentSpreadDegrees).toBe(2.28);
    expect(AIM_CONVERGENCE_TUNING.MIN_SPREAD_DEGREES).toBe(1.5);
    aim.dispose();
  });

  it("blooms while driving and remains inaccurate immediately after stopping", () => {
    const events = new GameEventBus();
    const aim = new AimConvergenceSystem(events);
    events.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });
    for (let frame = 0; frame < 300; frame += 1) aim.update(1 / 60, STABLE_AIM);

    events.emit("DRIVE_STATE", { acceleration: 7, turnRate: 0, speed: 7 });
    for (let frame = 0; frame < 60; frame += 1) aim.update(1 / 60, STABLE_AIM);
    expect(aim.currentSpreadDegrees).toBe(
      AIM_CONVERGENCE_TUNING.MAX_SPREAD_DEGREES,
    );

    events.emit("DRIVE_STATE", { acceleration: -7, turnRate: 0, speed: 0 });
    aim.update(1 / 60, STABLE_AIM);
    expect(aim.currentSpreadDegrees).toBeGreaterThan(
      AIM_CONVERGENCE_TUNING.MAX_SPREAD_DEGREES - 0.05,
    );
    aim.dispose();
  });

  it("blooms when the hull, turret, or aim point moves", () => {
    const events = new GameEventBus();
    const aim = new AimConvergenceSystem(events);
    events.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });
    for (let frame = 0; frame < 300; frame += 1) aim.update(1 / 60, STABLE_AIM);

    events.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0.5, speed: 0 });
    const afterHullTurn = aim.update(0.1, STABLE_AIM);
    events.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });
    const afterTurretTurn = aim.update(0.01, {
      ...STABLE_AIM,
      turretYawRadians: 0.1,
    });
    const afterAimMove = aim.update(0.01, {
      turretYawRadians: 0.1,
      aimPoint: { x: 11, y: 0, z: 0 },
    });

    expect(afterHullTurn).toBeGreaterThan(
      AIM_CONVERGENCE_TUNING.MIN_SPREAD_DEGREES,
    );
    expect(afterTurretTurn).toBeGreaterThan(afterHullTurn);
    expect(afterAimMove).toBeGreaterThan(afterTurretTurn);
    aim.dispose();
  });

  it("changes by elapsed time rather than frame count", () => {
    const eventsA = new GameEventBus();
    const eventsB = new GameEventBus();
    const aimA = new AimConvergenceSystem(eventsA);
    const aimB = new AimConvergenceSystem(eventsB);
    eventsA.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });
    eventsB.emit("DRIVE_STATE", { acceleration: 0, turnRate: 0, speed: 0 });

    for (let frame = 0; frame < 60; frame += 1) aimA.update(1 / 60, STABLE_AIM);
    for (let frame = 0; frame < 10; frame += 1) aimB.update(0.1, STABLE_AIM);
    expect(aimA.currentSpreadDegrees).toBeCloseTo(aimB.currentSpreadDegrees);
    aimA.dispose();
    aimB.dispose();
  });
});
