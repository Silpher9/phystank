import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TankEntity } from "./tank";

export const CONTROL_TUNING = {
  DRIVE_SPEED: 7,
  REVERSE_SPEED: 3.5,
  HULL_TURN_SPEED: 1.9,
  TURRET_TURN_SPEED: 1.15,
  RELOAD_DURATION_SECONDS: 2.2,
  // 15.75 (wall inside) minus the tank's rotated corner radius.
  ARENA_HALF_EXTENT: 12.2,
} as const;

export type DriveInput = Readonly<{ forward: number; turn: number }>;

export class TankController {
  private reloadRemaining = 0;
  private targetPoint: Vector3 | null = null;

  constructor(readonly tank: TankEntity) {}

  setAimPoint(point: Vector3): void {
    this.targetPoint = point.clone();
  }

  update(deltaSeconds: number, input: DriveInput): void {
    const turnAmount = input.turn * CONTROL_TUNING.HULL_TURN_SPEED * deltaSeconds;
    this.tank.root.rotation.y += turnAmount;

    const speed = input.forward >= 0 ? CONTROL_TUNING.DRIVE_SPEED : CONTROL_TUNING.REVERSE_SPEED;
    const distance = input.forward * speed * deltaSeconds;
    const forward = new Vector3(-Math.sin(this.tank.root.rotation.y), 0, -Math.cos(this.tank.root.rotation.y));
    this.tank.root.position.addInPlace(forward.scale(distance));
    this.tank.root.position.x = clamp(this.tank.root.position.x, -CONTROL_TUNING.ARENA_HALF_EXTENT, CONTROL_TUNING.ARENA_HALF_EXTENT);
    this.tank.root.position.z = clamp(this.tank.root.position.z, -CONTROL_TUNING.ARENA_HALF_EXTENT, CONTROL_TUNING.ARENA_HALF_EXTENT);

    if (this.targetPoint) {
      const targetDirection = this.targetPoint.subtract(this.tank.root.position);
      targetDirection.y = 0;
      if (targetDirection.lengthSquared() > 0.001) {
        const desiredWorldYaw = Math.atan2(-targetDirection.x, -targetDirection.z);
        const desiredLocalYaw = normalizeAngle(desiredWorldYaw - this.tank.root.rotation.y);
        this.tank.turret.rotation.y = moveTowardsAngle(
          this.tank.turret.rotation.y,
          desiredLocalYaw,
          CONTROL_TUNING.TURRET_TURN_SPEED * deltaSeconds,
        );
      }
    }

    this.reloadRemaining = Math.max(0, this.reloadRemaining - deltaSeconds);
  }

  beginReload(): boolean {
    if (this.reloadRemaining > 0) return false;
    this.reloadRemaining = CONTROL_TUNING.RELOAD_DURATION_SECONDS;
    return true;
  }

  get reloadProgress(): number {
    return 1 - this.reloadRemaining / CONTROL_TUNING.RELOAD_DURATION_SECONDS;
  }

  get isReloading(): boolean {
    return this.reloadRemaining > 0;
  }

  get aimPoint(): Vector3 | null {
    return this.targetPoint?.clone() ?? null;
  }
}

export function moveTowardsAngle(current: number, target: number, maxDelta: number): number {
  const difference = normalizeAngle(target - current);
  if (Math.abs(difference) <= maxDelta) return target;
  return current + Math.sign(difference) * maxDelta;
}

export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
