import type { ArmorFacetId } from "../tank/armor";
import {
  createRicochetContinuation,
  HitOutcome,
  resolveHit,
  type HitResolution,
  type RicochetContinuation,
  type Vector3,
} from "./ballistics";

export enum HitCategory {
  ARMOR = "ARMOR",
  HARD = "HARD",
  SOFT = "SOFT",
}

export enum ObjectHitOutcome {
  STOPPED = "STOPPED",
  RICOCHET = "RICOCHET",
  DESTROYED = "DESTROYED",
}

export type ArmorHitTarget = Readonly<{
  category: HitCategory.ARMOR;
  targetId: string;
  facetId: ArmorFacetId;
  thickness: number;
}>;

export type HardHitTarget = Readonly<{
  category: HitCategory.HARD;
  targetId: string;
  equivalentArmor: number;
}>;

export type SoftHitTarget = Readonly<{
  category: HitCategory.SOFT;
  targetId: string;
  retainedSpeed: number;
  retainedPenetration: number;
}>;

export type HitTargetData = ArmorHitTarget | HardHitTarget | SoftHitTarget;

export type ImpactInput = Readonly<{
  shellDirection: Vector3;
  facetNormal: Vector3;
  speed: number;
  penetration: number;
  shellCaliber: number;
  ricochetCount: number;
  random?: () => number;
}>;

export type ImpactResolution = Readonly<{
  action: "IGNORE" | "STOP" | "RICOCHET" | "PASS_THROUGH";
  armorHit?: Readonly<{
    outcome: HitOutcome;
    facetId: ArmorFacetId;
    impactAngleDegrees: number;
    nominalThickness: number;
    effectiveThickness: number;
    penetration: number;
  }>;
  objectHit?: Readonly<{
    category: HitCategory.HARD | HitCategory.SOFT;
    targetId: string;
    outcome: ObjectHitOutcome;
    impactAngleDegrees: number | null;
  }>;
  continuation?: RicochetContinuation;
  retainedSpeed?: number;
  retainedPenetration?: number;
  destroyTarget?: boolean;
}>;

type TargetFor<C extends HitCategory> = Extract<HitTargetData, { category: C }>;
type ImpactResolver<C extends HitCategory> = (
  target: TargetFor<C>,
  input: ImpactInput,
) => ImpactResolution;

const IMPACT_RESOLVERS: { [C in HitCategory]: ImpactResolver<C> } = {
  [HitCategory.ARMOR]: (target, input) => {
    const result = resolveArmor(target.thickness, input);
    if (!result) return { action: "IGNORE" };

    const armorHit = {
      outcome: result.outcome,
      facetId: target.facetId,
      impactAngleDegrees: result.impactAngleDegrees,
      nominalThickness: target.thickness,
      effectiveThickness: result.effectiveArmor,
      penetration: input.penetration,
    };
    if (result.outcome !== HitOutcome.RICOCHET) {
      return { action: "STOP", armorHit };
    }

    return {
      action: "RICOCHET",
      armorHit,
      continuation: createContinuation(input),
    };
  },

  [HitCategory.HARD]: (target, input) => {
    const result = resolveArmor(target.equivalentArmor, input);
    if (!result) return { action: "IGNORE" };

    const ricochets = result.outcome === HitOutcome.RICOCHET;
    return {
      action: ricochets ? "RICOCHET" : "STOP",
      objectHit: {
        category: HitCategory.HARD,
        targetId: target.targetId,
        outcome: ricochets ? ObjectHitOutcome.RICOCHET : ObjectHitOutcome.STOPPED,
        impactAngleDegrees: result.impactAngleDegrees,
      },
      continuation: ricochets ? createContinuation(input) : undefined,
    };
  },

  [HitCategory.SOFT]: (target, input) => ({
    action: "PASS_THROUGH",
    objectHit: {
      category: HitCategory.SOFT,
      targetId: target.targetId,
      outcome: ObjectHitOutcome.DESTROYED,
      impactAngleDegrees: null,
    },
    retainedSpeed: input.speed * target.retainedSpeed,
    retainedPenetration: input.penetration * target.retainedPenetration,
    destroyTarget: true,
  }),
};

export function resolveImpact(target: HitTargetData, input: ImpactInput): ImpactResolution {
  // The registry key and target discriminant are created together. This cast
  // only bridges TypeScript's inability to correlate an indexed resolver with
  // the discriminated target union.
  const resolver = IMPACT_RESOLVERS[target.category] as ImpactResolver<HitCategory>;
  return resolver(target, input);
}

function resolveArmor(thickness: number, input: ImpactInput): HitResolution | null {
  return resolveHit({
    shellDirection: input.shellDirection,
    facetNormal: input.facetNormal,
    armorThickness: thickness,
    shellCaliber: input.shellCaliber,
    penetration: input.penetration,
    ricochetCount: input.ricochetCount,
    random: input.random,
  });
}

function createContinuation(input: ImpactInput): RicochetContinuation {
  return createRicochetContinuation({
    shellDirection: input.shellDirection,
    facetNormal: input.facetNormal,
    speed: input.speed,
    penetration: input.penetration,
    ricochetCount: input.ricochetCount,
    random: input.random,
  });
}
