import { Ray } from "@babylonjs/core/Culling/ray";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Vector3 as EventVector3 } from "./core/ballistics";
import type { GameEventBus } from "./core/events";
import { resolveImpact } from "./core/impacts";
import { ARENA_SIZE, WALL_THICKNESS } from "./arena";
import { getHitNormalFromPick, getHitTarget } from "./hit-targets";
import type { TankEntity } from "./tank/tank";

export const RICOCHET_EPSILON = 0.02;
const TUNING = {
  speed: 45,
  gravity: 9.81,
  lifetime: 4,
  arenaLimit: ARENA_SIZE / 2 + WALL_THICKNESS,
  caliber: 75,
  penetration: 150,
  targetHeight: 1.2,
};

export function offsetRicochetOrigin(hitPoint: Vector3, normal: Vector3): Vector3 {
  return hitPoint.add(normal.scale(RICOCHET_EPSILON));
}

export class ShellSystem {
  private readonly shells: Shell[] = [];
  private nextShellId = 1;
  constructor(
    private readonly scene: Scene,
    private readonly events: GameEventBus,
  ) {}

  fire(owner: TankEntity, target: Vector3): void {
    const origin = owner.muzzle.getAbsolutePosition();
    const horizontal = target.subtract(origin); horizontal.y = 0;
    if (horizontal.lengthSquared() < 0.01) return;
    const distance = horizontal.length();
    const direction = horizontal.normalize();
    const velocity = calculateBallisticVelocity(origin, direction, distance, TUNING.targetHeight);
    if (!velocity) return;
    const shellId = `shell-${this.nextShellId++}`;
    this.events.emit("SHOT_FIRED", {
      shellId,
      tank: owner.root.name,
      muzzlePosition: toEventVector(origin),
      direction: toEventVector(velocity.normalizeToNew()),
    });
    this.shells.push(new Shell(shellId, this.scene, this.events, owner, origin, velocity, TUNING.penetration, 0));
  }

  update(deltaSeconds: number): void {
    for (const shell of [...this.shells]) {
      if (!shell.update(deltaSeconds)) this.shells.splice(this.shells.indexOf(shell), 1);
    }
  }
}

/** Low-root trajectory that passes through the selected armor height. */
export function calculateBallisticVelocity(origin: Vector3, horizontalDirection: Vector3, distance: number, targetHeight: number): Vector3 | null {
  const speedSquared = TUNING.speed ** 2;
  const heightDifference = targetHeight - origin.y;
  const discriminant = speedSquared ** 2 - TUNING.gravity * (TUNING.gravity * distance ** 2 + 2 * heightDifference * speedSquared);
  if (discriminant < 0 || distance <= 0) return null;
  const angle = Math.atan((speedSquared - Math.sqrt(discriminant)) / (TUNING.gravity * distance));
  return horizontalDirection.scale(Math.cos(angle) * TUNING.speed).add(new Vector3(0, Math.sin(angle) * TUNING.speed, 0));
}

class Shell {
  private readonly mesh;
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
  ) {
    this.mesh = MeshBuilder.CreateSphere("shell", { diameter: 0.14 }, scene);
    this.mesh.position.copyFrom(position);
    this.mesh.isPickable = false;
    const material = new StandardMaterial("shell-material", scene);
    material.emissiveColor = Color3.FromHexString("#ffdc75");
    this.mesh.material = material;
  }

  update(dt: number): boolean {
    this.age += dt;
    this.velocity.y -= TUNING.gravity * dt;
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
          shellCaliber: TUNING.caliber,
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
          outcome: result.armorHit.outcome,
          facetId: result.armorHit.facetId,
          point: toEventVector(pick.pickedPoint),
          normal: toEventVector(normal),
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
            point: toEventVector(pick.pickedPoint),
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
    this.mesh.position.copyFrom(position);
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
    this.mesh.dispose();
    return false;
  }

  private continueWithinBounds(): boolean {
    const withinBounds = this.age < TUNING.lifetime && Math.abs(this.position.x) < TUNING.arenaLimit && Math.abs(this.position.z) < TUNING.arenaLimit && this.position.y > -2;
    return withinBounds || this.dispose();
  }
}

function toEventVector(vector: EventVector3): EventVector3 {
  return Object.freeze({ x: vector.x, y: vector.y, z: vector.z });
}
