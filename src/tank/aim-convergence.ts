import type { Vector3 } from "../core/ballistics";
import type { GameEventBus } from "../core/events";

export const AIM_CONVERGENCE_TUNING = {
  MIN_SPREAD_DEGREES: 0.25,
  MAX_SPREAD_DEGREES: 7,
  TURRET_MOVEMENT_SPREAD_DEGREES: 7,
  CONVERGENCE_RATE_DEGREES_PER_SECOND: 2.25,
  BLOOM_RATE_DEGREES_PER_SECOND: 20,
  MOTION_EPSILON: 0.01,
  TURRET_TURN_EPSILON_RADIANS: 0.0001,
  AIM_POINT_CHANGE_EPSILON: 0.05,
} as const;

export type AimConvergenceInput = Readonly<{
  turretYawRadians: number;
  aimPoint: Vector3 | null;
}>;

/** Continuously tracks the accuracy state consumed by firing, F3, and the cursor. */
export class AimConvergenceSystem {
  private speed = 0;
  private hullTurnRate = 0;
  private previousTurretYaw: number | null = null;
  private previousAimPoint: Vector3 | null = null;
  private _currentSpreadDegrees: number = AIM_CONVERGENCE_TUNING.MAX_SPREAD_DEGREES;
  private readonly unsubscribe: () => void;

  constructor(events: GameEventBus) {
    this.unsubscribe = events.on("DRIVE_STATE", ({ speed, turnRate }) => {
      this.speed = speed;
      this.hullTurnRate = turnRate;
    });
  }

  get currentSpreadDegrees(): number {
    return this._currentSpreadDegrees;
  }

  update(deltaSeconds: number, input: AimConvergenceInput): number {
    if (deltaSeconds <= 0) return this._currentSpreadDegrees;

    const turretTurned = this.previousTurretYaw !== null
      && Math.abs(normalizeAngle(input.turretYawRadians - this.previousTurretYaw))
        > AIM_CONVERGENCE_TUNING.TURRET_TURN_EPSILON_RADIANS;
    const aimPointMoved = input.aimPoint !== null && this.previousAimPoint !== null
      && distance(input.aimPoint, this.previousAimPoint)
        > AIM_CONVERGENCE_TUNING.AIM_POINT_CHANGE_EPSILON;
    const hullMoving = Math.abs(this.speed) > AIM_CONVERGENCE_TUNING.MOTION_EPSILON
      || Math.abs(this.hullTurnRate) > AIM_CONVERGENCE_TUNING.MOTION_EPSILON
      || input.aimPoint === null;
    let target: number = AIM_CONVERGENCE_TUNING.MIN_SPREAD_DEGREES;
    if (hullMoving) {
      target = AIM_CONVERGENCE_TUNING.MAX_SPREAD_DEGREES;
    } else if (turretTurned || aimPointMoved) {
      target = AIM_CONVERGENCE_TUNING.TURRET_MOVEMENT_SPREAD_DEGREES;
    }
    const rate = target > this._currentSpreadDegrees
      ? AIM_CONVERGENCE_TUNING.BLOOM_RATE_DEGREES_PER_SECOND
      : AIM_CONVERGENCE_TUNING.CONVERGENCE_RATE_DEGREES_PER_SECOND;
    this._currentSpreadDegrees = moveTowards(
      this._currentSpreadDegrees,
      target,
      rate * deltaSeconds,
    );

    this.previousTurretYaw = input.turretYawRadians;
    this.previousAimPoint = input.aimPoint ? Object.freeze({ ...input.aimPoint }) : null;
    return this._currentSpreadDegrees;
  }

  dispose(): void {
    this.unsubscribe();
  }
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function distance(left: Vector3, right: Vector3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}
