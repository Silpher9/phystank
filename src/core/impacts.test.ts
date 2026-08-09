import { describe, expect, it } from "vitest";
import { TUNING } from "./ballistics";
import {
  HitCategory,
  ObjectHitOutcome,
  resolveImpact,
  type HardHitTarget,
  type ImpactInput,
  type SoftHitTarget,
} from "./impacts";

const BASE_INPUT: ImpactInput = {
  shellDirection: { x: 0, y: 0, z: -1 },
  facetNormal: { x: 0, y: 0, z: 1 },
  speed: 45,
  penetration: 150,
  shellCaliber: 75,
  ricochetCount: 0,
  random: () => 0.5,
};

describe("data-driven impact categories", () => {
  const hardTarget: HardHitTarget = {
    category: HitCategory.HARD,
    targetId: "concrete-wall",
    equivalentArmor: 400,
  };

  it("stops a normal hit on a hard target", () => {
    const result = resolveImpact(hardTarget, BASE_INPUT);
    expect(result).toMatchObject({
      action: "STOP",
      objectHit: {
        category: HitCategory.HARD,
        targetId: "concrete-wall",
        outcome: ObjectHitOutcome.STOPPED,
      },
    });
  });

  it("ricochets a grazing hit on a hard target", () => {
    const angle = (TUNING.RICOCHET_ANGLE_DEGREES + 5) * Math.PI / 180;
    const result = resolveImpact(hardTarget, {
      ...BASE_INPUT,
      shellDirection: { x: Math.sin(angle), y: 0, z: -Math.cos(angle) },
    });
    expect(result.action).toBe("RICOCHET");
    expect(result.objectHit?.outcome).toBe(ObjectHitOutcome.RICOCHET);
    expect(result.continuation?.shouldSpawn).toBe(true);
  });

  it("destroys a soft target and retains configured shell energy", () => {
    const softTarget: SoftHitTarget = {
      category: HitCategory.SOFT,
      targetId: "wooden-crate",
      retainedSpeed: 0.8,
      retainedPenetration: 0.7,
    };
    const result = resolveImpact(softTarget, BASE_INPUT);
    expect(result).toMatchObject({
      action: "PASS_THROUGH",
      objectHit: {
        category: HitCategory.SOFT,
        outcome: ObjectHitOutcome.DESTROYED,
      },
      retainedSpeed: 36,
      retainedPenetration: 105,
      destroyTarget: true,
    });
  });
});
