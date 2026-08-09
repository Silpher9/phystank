import { describe, expect, it } from "vitest";
import {
  createRicochetContinuation,
  HitOutcome,
  resolveHit,
  TUNING,
  type Vector3,
} from "./ballistics";

const FRONT_NORMAL: Vector3 = { x: 0, y: 0, z: 1 };

function directionAtImpactAngle(degrees: number): Vector3 {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.sin(radians), y: 0, z: -Math.cos(radians) };
}

describe("resolveHit", () => {
  it("penetrates armor on a direct hit", () => {
    const result = resolveHit({
      shellDirection: { x: 0, y: 0, z: -1 },
      facetNormal: FRONT_NORMAL,
      armorThickness: 50,
      shellCaliber: 75,
      penetration: 100,
    });

    expect(result).toMatchObject({
      outcome: HitOutcome.PENETRATION,
      impactAngleDegrees: 0,
      effectiveArmor: 50,
      penetrationChance: 1,
      shouldSpawnContinuation: false,
    });
  });

  it("ricochets a grazing hit before evaluating penetration", () => {
    const result = resolveHit({
      shellDirection: directionAtImpactAngle(80),
      facetNormal: FRONT_NORMAL,
      armorThickness: 50,
      shellCaliber: 75,
      penetration: 10_000,
    });

    expect(result).toMatchObject({
      outcome: HitOutcome.RICOCHET,
      penetrationChance: 0,
      shouldSpawnContinuation: true,
    });
    expect(result?.impactAngleDegrees).toBeCloseTo(80);
  });

  it("shatters when the plate is too thick", () => {
    const result = resolveHit({
      shellDirection: { x: 0, y: 0, z: -1 },
      facetNormal: FRONT_NORMAL,
      armorThickness: 100,
      shellCaliber: 75,
      penetration: 90,
    });

    expect(result).toMatchObject({
      outcome: HitOutcome.SHATTER,
      penetrationChance: 0,
      shouldSpawnContinuation: false,
    });
  });

  it("lets an overmatching shell use penetration logic instead of ricocheting", () => {
    const result = resolveHit({
      shellDirection: directionAtImpactAngle(80),
      facetNormal: FRONT_NORMAL,
      armorThickness: 20,
      shellCaliber: 61,
      penetration: 500,
    });

    expect(result).toMatchObject({
      outcome: HitOutcome.PENETRATION,
      shouldSpawnContinuation: false,
    });
  });

  it("rejects a hit on the back of a facet", () => {
    const result = resolveHit({
      shellDirection: { x: 0, y: 0, z: 1 },
      facetNormal: FRONT_NORMAL,
      armorThickness: 50,
      shellCaliber: 75,
      penetration: 100,
    });

    expect(result).toBeNull();
  });

  it("uses a linear chance in the tension band", () => {
    const result = resolveHit({
      shellDirection: { x: 0, y: 0, z: -1 },
      facetNormal: FRONT_NORMAL,
      armorThickness: 100,
      shellCaliber: 75,
      penetration: 100,
      random: () => 0.49,
    });

    expect(result?.outcome).toBe(HitOutcome.PENETRATION);
    expect(result?.penetrationChance).toBeCloseTo(0.5);
  });
});

describe("createRicochetContinuation", () => {
  it("reduces speed and penetration by the same retained-velocity factor", () => {
    const continuation = createRicochetContinuation({
      shellDirection: directionAtImpactAngle(80),
      facetNormal: FRONT_NORMAL,
      speed: 100,
      penetration: 120,
      ricochetCount: 0,
      random: () => 0.5,
    });

    expect(continuation).toMatchObject({
      speed: 100 * TUNING.RICOCHET_SPEED_MULTIPLIER,
      penetration: 120 * TUNING.RICOCHET_SPEED_MULTIPLIER,
      ricochetCount: 1,
      shouldSpawn: true,
    });
    expect(continuation.direction.x).toBeCloseTo(Math.sin((80 * Math.PI) / 180));
    expect(continuation.direction.z).toBeCloseTo(Math.cos((80 * Math.PI) / 180));
  });

  it("does not spawn a third deflection", () => {
    const continuation = createRicochetContinuation({
      shellDirection: directionAtImpactAngle(80),
      facetNormal: FRONT_NORMAL,
      speed: 100,
      penetration: 120,
      ricochetCount: TUNING.MAX_RICOCHETS,
      random: () => 0.5,
    });

    expect(continuation.shouldSpawn).toBe(false);
  });
});
