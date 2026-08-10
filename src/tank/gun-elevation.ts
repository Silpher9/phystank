import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { calculateBallisticVelocity } from "../shells";
import type { TankEntity } from "./tank";

export const GUN_ELEVATION_TUNING = {
  maxDepressionDegrees: 8,
  maxElevationDegrees: 20,
  solverIterations: 4,
} as const;

const MINIMUM_HORIZONTAL_DISTANCE = 0.001;
const REACHABLE_EPSILON_RADIANS = 0.0001;

/**
 * Composes the gun's ballistic pitch with other pose systems. The pivot owns
 * elevation while recoil remains a translation of the cannon along its local
 * axis, so neither system has to restore the other's contribution.
 */
export class GunElevationSystem {
  private appliedPitch = 0;
  private _requestedPitch = 0;
  private _reachable = true;

  constructor(private readonly tank: TankEntity) {}

  update(target: Vector3 | null): void {
    if (!target) return;

    let requestedPitch = this._requestedPitch;
    for (let iteration = 0; iteration < GUN_ELEVATION_TUNING.solverIterations; iteration++) {
      this.tank.muzzle.computeWorldMatrix(true);
      const origin = this.tank.muzzle.getAbsolutePosition();
      const horizontal = target.subtract(origin);
      horizontal.y = 0;

      let worldDirection: Vector3;
      if (horizontal.lengthSquared() <= MINIMUM_HORIZONTAL_DISTANCE ** 2) {
        const direct = target.subtract(origin);
        if (direct.lengthSquared() === 0) return;
        worldDirection = direct.normalize();
      } else {
        const distance = horizontal.length();
        const ballistic = calculateBallisticVelocity(
          origin,
          horizontal.normalize(),
          distance,
          target.y,
        );
        if (!ballistic) return;
        worldDirection = ballistic.normalize();
      }

      this.tank.turret.computeWorldMatrix(true);
      const inverseTurretWorld = this.tank.turret.getWorldMatrix().clone().invert();
      const localDirection = Vector3.TransformNormal(worldDirection, inverseTurretWorld).normalize();
      requestedPitch = Math.atan2(
        localDirection.y,
        Math.hypot(localDirection.x, localDirection.z),
      );
      this.applyTotalPitch(clamp(
        requestedPitch,
        degreesToRadians(-GUN_ELEVATION_TUNING.maxDepressionDegrees),
        degreesToRadians(GUN_ELEVATION_TUNING.maxElevationDegrees),
      ));
    }

    this._requestedPitch = requestedPitch;
    this._reachable = Math.abs(requestedPitch - this.totalPitch) <= REACHABLE_EPSILON_RADIANS;
  }

  get requestedPitchRadians(): number {
    return this._requestedPitch;
  }

  get appliedPitchRadians(): number {
    return this.totalPitch;
  }

  get reachable(): boolean {
    return this._reachable;
  }

  dispose(): void {
    this.tank.gunPivot.rotation.x -= this.appliedPitch;
    this.appliedPitch = 0;
  }

  private get totalPitch(): number {
    return this.tank.gunPivot.rotation.x;
  }

  private applyTotalPitch(totalPitch: number): void {
    const externalPitch = this.tank.gunPivot.rotation.x - this.appliedPitch;
    const nextContribution = totalPitch - externalPitch;
    this.tank.gunPivot.rotation.x += nextContribution - this.appliedPitch;
    this.appliedPitch = nextContribution;
  }
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
