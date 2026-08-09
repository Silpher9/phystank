/**
 * Engine-independent armor and ricochet calculations.
 * Directions and normals may have any non-zero length; they are normalized here.
 */

export type Vector3 = Readonly<{ x: number; y: number; z: number }>;

export enum HitOutcome {
  PENETRATION = "PENETRATION",
  RICOCHET = "RICOCHET",
  SHATTER = "SHATTER",
}

export const TUNING = {
  RICOCHET_ANGLE_DEGREES: 70,
  OVERMATCH_CALIBER_MULTIPLIER: 3,
  RICOCHET_SPEED_MULTIPLIER: 0.65,
  RICOCHET_SPREAD_DEGREES: 3,
  PENETRATION_GUARANTEED_MULTIPLIER: 1.1,
  SHATTER_MULTIPLIER: 0.9,
  MAX_RICOCHETS: 2,
} as const;

export type HitInput = Readonly<{
  /** Direction in which the shell is travelling. */
  shellDirection: Vector3;
  /** Outward-facing normal of the struck armor facet. */
  facetNormal: Vector3;
  armorThickness: number;
  shellCaliber: number;
  penetration: number;
  ricochetCount?: number;
  /** Injected for deterministic tests and replayable simulations. */
  random?: () => number;
}>;

export type HitResolution = Readonly<{
  outcome: HitOutcome;
  cosImpact: number;
  impactAngleDegrees: number;
  effectiveArmor: number;
  penetrationChance: number;
  /** A ricochet event can still despawn when its deflection budget is exhausted. */
  shouldSpawnContinuation: boolean;
}>;

export type RicochetContinuationInput = Readonly<{
  shellDirection: Vector3;
  facetNormal: Vector3;
  speed: number;
  penetration: number;
  ricochetCount: number;
  /** Injected for deterministic tests and replayable simulations. */
  random?: () => number;
}>;

export type RicochetContinuation = Readonly<{
  direction: Vector3;
  speed: number;
  penetration: number;
  ricochetCount: number;
  shouldSpawn: boolean;
}>;

/**
 * Resolves an armor impact. `null` means the ray hit the back of a facet and
 * must be ignored by the caller; it is not a game hit outcome.
 */
export function resolveHit(input: HitInput): HitResolution | null {
  assertPositive("armorThickness", input.armorThickness);
  assertPositive("shellCaliber", input.shellCaliber);
  assertNonNegative("penetration", input.penetration);

  const shellDirection = normalize(input.shellDirection, "shellDirection");
  const facetNormal = normalize(input.facetNormal, "facetNormal");
  const cosImpact = clamp(dot(negate(shellDirection), facetNormal), -1, 1);

  if (cosImpact <= 0) {
    return null;
  }

  const impactAngleDegrees = radiansToDegrees(Math.acos(cosImpact));
  const effectiveArmor = input.armorThickness / cosImpact;
  const ricochetCount = input.ricochetCount ?? 0;
  const canRicochet = ricochetCount < TUNING.MAX_RICOCHETS;

  if (
    input.shellCaliber <= input.armorThickness * TUNING.OVERMATCH_CALIBER_MULTIPLIER &&
    impactAngleDegrees > TUNING.RICOCHET_ANGLE_DEGREES
  ) {
    return {
      outcome: HitOutcome.RICOCHET,
      cosImpact,
      impactAngleDegrees,
      effectiveArmor,
      penetrationChance: 0,
      shouldSpawnContinuation: canRicochet,
    };
  }

  const penetrationChance = calculatePenetrationChance(input.penetration, effectiveArmor);
  const outcome = rollPenetration(penetrationChance, input.random ?? Math.random)
    ? HitOutcome.PENETRATION
    : HitOutcome.SHATTER;

  return {
    outcome,
    cosImpact,
    impactAngleDegrees,
    effectiveArmor,
    penetrationChance,
    shouldSpawnContinuation: false,
  };
}

/** Returns a ricochet's reflected and weakened continuation, if it has budget left. */
export function createRicochetContinuation(
  input: RicochetContinuationInput,
): RicochetContinuation {
  assertNonNegative("speed", input.speed);
  assertNonNegative("penetration", input.penetration);

  const ricochetCount = input.ricochetCount + 1;
  const shouldSpawn = ricochetCount <= TUNING.MAX_RICOCHETS;
  const normal = normalize(input.facetNormal, "facetNormal");
  const reflected = reflect(normalize(input.shellDirection, "shellDirection"), normal);
  const direction = rotateAroundAxis(
    reflected,
    normal,
    degreesToRadians(randomSpreadDegrees(input.random ?? Math.random)),
  );

  return {
    direction,
    speed: input.speed * TUNING.RICOCHET_SPEED_MULTIPLIER,
    penetration: input.penetration * TUNING.RICOCHET_SPEED_MULTIPLIER,
    ricochetCount,
    shouldSpawn,
  };
}

export function calculatePenetrationChance(penetration: number, effectiveArmor: number): number {
  assertNonNegative("penetration", penetration);
  assertPositive("effectiveArmor", effectiveArmor);

  const shatterThreshold = effectiveArmor * TUNING.SHATTER_MULTIPLIER;
  const penetrationThreshold = effectiveArmor * TUNING.PENETRATION_GUARANTEED_MULTIPLIER;

  if (penetration <= shatterThreshold) return 0;
  if (penetration >= penetrationThreshold) return 1;

  return (penetration - shatterThreshold) / (penetrationThreshold - shatterThreshold);
}

function rollPenetration(chance: number, random: () => number): boolean {
  if (chance === 0) return false;
  if (chance === 1) return true;
  return random() < chance;
}

function reflect(direction: Vector3, normal: Vector3): Vector3 {
  return normalize(subtract(direction, scale(normal, 2 * dot(direction, normal))), "reflectedDirection");
}

function rotateAroundAxis(vector: Vector3, axis: Vector3, angleRadians: number): Vector3 {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return normalize(
    add(add(scale(vector, cosine), scale(cross(axis, vector), sine)), scale(axis, dot(axis, vector) * (1 - cosine))),
    "spreadDirection",
  );
}

function randomSpreadDegrees(random: () => number): number {
  return (random() * 2 - 1) * TUNING.RICOCHET_SPREAD_DEGREES;
}

function normalize(vector: Vector3, name: string): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error(`${name} must be a finite, non-zero vector`);
  }
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function dot(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function negate(vector: Vector3): Vector3 {
  return { x: -vector.x, y: -vector.y, z: -vector.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function scale(vector: Vector3, scalar: number): Vector3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite, positive number`);
  }
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite, non-negative number`);
  }
}
