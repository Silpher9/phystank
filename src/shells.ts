import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 as EventVector3 } from "./core/ballistics";
import type { GameEventBus } from "./core/events";
import { resolveImpact } from "./core/impacts";
import { ARENA_SIZE, WALL_THICKNESS } from "./arena";
import { getHitNormalFromPick, getHitTarget } from "./hit-targets";
import type { TankEntity } from "./tank/tank";

export const RICOCHET_EPSILON = 0.02;
export const SHELL_TUNING = {
  speed: 587,
  gravity: 9.81,
  lifetime: 4,
  arenaLimit: ARENA_SIZE / 2 + WALL_THICKNESS,
  caliber: 75,
  penetration: 150,
} as const;

export function offsetRicochetOrigin(hitPoint: Vector3, normal: Vector3): Vector3 {
  return hitPoint.add(normal.scale(RICOCHET_EPSILON));
}

export class ShellSystem {
  private readonly shells: Shell[] = [];
  private nextShellId = 1;
  constructor(
    private readonly scene: Scene,
    private readonly events: GameEventBus,
    private readonly random: () => number = Math.random,
  ) {}

  fire(owner: TankEntity, spreadDegrees = 0): void {
    owner.muzzle.computeWorldMatrix(true);
    const origin = owner.muzzle.getAbsolutePosition();
    const barrelDirection = getBarrelDirection(owner);
    const spread = applyAimSpread(barrelDirection, spreadDegrees, this.random);
    const velocity = spread.direction.scale(SHELL_TUNING.speed);
    const shellId = `shell-${this.nextShellId++}`;
    this.events.emit("SHOT_FIRED", {
      shellId,
      tank: owner.root.name,
      muzzlePosition: toEventVector(origin),
      direction: toEventVector(velocity.normalizeToNew()),
      spreadDegrees: Math.max(0, spreadDegrees),
      deviationDegrees: spread.deviationDegrees,
    });
    this.shells.push(new Shell(shellId, this.scene, this.events, owner, origin, velocity, SHELL_TUNING.penetration, 0));
  }

  update(deltaSeconds: number): void {
    for (const shell of [...this.shells]) {
      if (!shell.update(deltaSeconds)) this.shells.splice(this.shells.indexOf(shell), 1);
    }
  }
}

export function getBarrelDirection(owner: TankEntity): Vector3 {
  owner.muzzle.computeWorldMatrix(true);
  return Vector3.TransformNormal(
    new Vector3(0, 0, -1),
    owner.muzzle.getWorldMatrix(),
  ).normalize();
}

export function applyAimSpread(
  direction: Vector3,
  spreadDegrees: number,
  random: () => number,
): Readonly<{ direction: Vector3; deviationDegrees: number }> {
  const normalized = direction.normalizeToNew();
  const maximumRadians = Math.max(0, spreadDegrees) * Math.PI / 180;
  if (maximumRadians === 0) return { direction: normalized, deviationDegrees: 0 };

  const deviationRadians = Math.sqrt(clamp(random(), 0, 1)) * maximumRadians;
  const azimuth = clamp(random(), 0, 1) * Math.PI * 2;
  const reference = Math.abs(normalized.y) < 0.99 ? Vector3.Up() : Vector3.Right();
  const right = Vector3.Cross(normalized, reference).normalize();
  const up = Vector3.Cross(right, normalized).normalize();
  const radial = right.scale(Math.cos(azimuth)).add(up.scale(Math.sin(azimuth)));
  const spreadDirection = normalized.scale(Math.cos(deviationRadians))
    .add(radial.scale(Math.sin(deviationRadians)))
    .normalize();
  return {
    direction: spreadDirection,
    deviationDegrees: deviationRadians * 180 / Math.PI,
  };
}

/** Low-root trajectory that passes through the selected armor height. */
export function calculateBallisticVelocity(origin: Vector3, horizontalDirection: Vector3, distance: number, targetHeight: number): Vector3 | null {
  const speedSquared = SHELL_TUNING.speed ** 2;
  const heightDifference = targetHeight - origin.y;
  const discriminant = speedSquared ** 2 - SHELL_TUNING.gravity * (SHELL_TUNING.gravity * distance ** 2 + 2 * heightDifference * speedSquared);
  if (discriminant < 0 || distance <= 0) return null;
  const angle = Math.atan((speedSquared - Math.sqrt(discriminant)) / (SHELL_TUNING.gravity * distance));
  return horizontalDirection.scale(Math.cos(angle) * SHELL_TUNING.speed).add(new Vector3(0, Math.sin(angle) * SHELL_TUNING.speed, 0));
}

class Shell {
  private age = 0;
  private firstSegment = true;
  constructor(
    private readonly id: string,
    private readonly scene: Scene,
    private readonly events: GameEventBus,
    private readonly owner: TankEntity,
    private position: Vector3,
    private velocity: Vector3,
    private penetration: number,
    private ricochets: number,
  ) {}

  update(dt: number): boolean {
    this.age += dt;
    this.velocity.y -= SHELL_TUNING.gravity * dt;
    const next = this.position.add(this.velocity.scale(dt));
    const segment = next.subtract(this.position);
    const length = segment.length();
    const ray = new Ray(this.position, segment.normalize(), length);
    const pick = this.scene.pickWithRay(ray, (mesh) => {
      const target = getHitTarget(mesh);
      return Boolean(target) && (!this.firstSegment || !mesh.isDescendantOf(this.owner.root));
    });

    if (pick?.hit && pick.pickedPoint) {
      const target = getHitTarget(pick.pickedMesh);
      const normal = getHitNormalFromPick(pick);
      if (target && normal) {
        const incoming = this.velocity.normalizeToNew();
        const result = resolveImpact(target, {
          shellDirection: this.velocity,
          facetNormal: normal,
          speed: this.velocity.length(),
          penetration: this.penetration,
          shellCaliber: SHELL_TUNING.caliber,
          ricochetCount: this.ricochets,
        });
        if (result.action === "IGNORE") {
          // An inside-out facet contact is not a hit. Finish this frame's full
          // segment instead of inching through armor one epsilon at a time.
          this.moveTo(next);
          this.firstSegment = false;
          return this.continueWithinBounds();
        }

        this.moveTo(pick.pickedPoint);

        if (result.armorHit) this.events.emit("HIT", {
          shellId: this.id,
          tank: result.armorHit.tank,
          outcome: result.armorHit.outcome,
          facetId: result.armorHit.facetId,
          point: toEventVector(pick.pickedPoint),
          normal: toEventVector(normal),
          incoming: toEventVector(incoming),
          impactAngleDegrees: result.armorHit.impactAngleDegrees,
          nominalThickness: result.armorHit.nominalThickness,
          effectiveThickness: result.armorHit.effectiveThickness,
          penetration: result.armorHit.penetration,
        });

        if (result.objectHit) this.events.emit("OBJECT_HIT", {
          targetId: result.objectHit.targetId,
          category: result.objectHit.category,
          outcome: result.objectHit.outcome,
          point: toEventVector(pick.pickedPoint),
          normal: toEventVector(normal),
          incoming: toEventVector(incoming),
          impactAngleDegrees: result.objectHit.impactAngleDegrees,
        });

        if (result.action === "PASS_THROUGH") {
          if (result.destroyTarget) pick.pickedMesh?.dispose();
          this.velocity = incoming.scale(result.retainedSpeed ?? this.velocity.length());
          this.penetration = result.retainedPenetration ?? this.penetration;
          this.moveTo(pick.pickedPoint.add(incoming.scale(RICOCHET_EPSILON)));
          this.firstSegment = false;
          return true;
        }

        if (result.action === "RICOCHET" && result.continuation) {
          const continuation = result.continuation;
          this.events.emit("RICOCHET", {
            shellId: this.id,
            tank: result.armorHit?.tank ?? null,
            point: toEventVector(pick.pickedPoint),
            normal: toEventVector(normal),
            incoming: toEventVector(incoming),
            outgoing: toEventVector(continuation.direction),
            retainedSpeed: continuation.speed,
          });
          if (continuation.shouldSpawn) {
            this.velocity = new Vector3(
              continuation.direction.x,
              continuation.direction.y,
              continuation.direction.z,
            ).scale(continuation.speed);
            this.penetration = continuation.penetration;
            this.ricochets = continuation.ricochetCount;
            this.moveTo(offsetRicochetOrigin(pick.pickedPoint, new Vector3(normal.x, normal.y, normal.z)));
            this.firstSegment = false;
            return true;
          }
        }
      }
      return this.dispose();
    }
    this.moveTo(next);
    this.firstSegment = false;
    return this.continueWithinBounds();
  }

  private moveTo(position: Vector3): void {
    this.position = position;
    this.events.emit("SHELL_MOVED", {
      shellId: this.id,
      position: toEventVector(position),
    });
  }

  private dispose(): false {
    this.events.emit("SHELL_DESPAWNED", {
      shellId: this.id,
      position: toEventVector(this.position),
    });
    return false;
  }

  private continueWithinBounds(): boolean {
    const withinBounds = this.age < SHELL_TUNING.lifetime && Math.abs(this.position.x) < SHELL_TUNING.arenaLimit && Math.abs(this.position.z) < SHELL_TUNING.arenaLimit && this.position.y > -2;
    return withinBounds || this.dispose();
  }
}

function toEventVector(vector: EventVector3): EventVector3 {
  return Object.freeze({ x: vector.x, y: vector.y, z: vector.z });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
