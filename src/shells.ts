import { Ray } from "@babylonjs/core/Culling/ray";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createRicochetContinuation, HitOutcome, resolveHit } from "./core/ballistics";
import { getFacetForMesh, getFacetNormalFromPick, type TankEntity } from "./tank/tank";

export const RICOCHET_EPSILON = 0.02;
const TUNING = { speed: 45, gravity: 9.81, lifetime: 4, arenaLimit: 17, caliber: 75, penetration: 150, targetHeight: 1.2 };

export function offsetRicochetOrigin(hitPoint: Vector3, normal: Vector3): Vector3 {
  return hitPoint.add(normal.scale(RICOCHET_EPSILON));
}

export class ShellSystem {
  private readonly shells: Shell[] = [];
  constructor(private readonly scene: Scene) {}

  fire(owner: TankEntity, target: Vector3): void {
    const origin = owner.cannon.getAbsolutePosition();
    const horizontal = target.subtract(origin); horizontal.y = 0;
    if (horizontal.lengthSquared() < 0.01) return;
    const distance = horizontal.length();
    const direction = horizontal.normalize();
    const velocity = calculateBallisticVelocity(origin, direction, distance, TUNING.targetHeight);
    if (!velocity) return;
    this.shells.push(new Shell(this.scene, owner, origin, velocity, TUNING.penetration, 0));
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
  constructor(private readonly scene: Scene, private readonly owner: TankEntity, private position: Vector3, private velocity: Vector3, private penetration: number, private ricochets: number) {
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
      const facet = getFacetForMesh(mesh);
      return Boolean(facet) && (!this.firstSegment || !mesh.isDescendantOf(this.owner.root));
    });

    if (pick?.hit && pick.pickedPoint) {
      const facet = getFacetForMesh(pick.pickedMesh);
      const normal = getFacetNormalFromPick(pick);
      if (facet && normal) {
        const result = resolveHit({ shellDirection: this.velocity, facetNormal: normal, armorThickness: facet.thickness, shellCaliber: TUNING.caliber, penetration: this.penetration, ricochetCount: this.ricochets });
        if (result?.outcome === HitOutcome.RICOCHET && result.shouldSpawnContinuation) {
          const continuation = createRicochetContinuation({ shellDirection: this.velocity, facetNormal: normal, speed: this.velocity.length(), penetration: this.penetration, ricochetCount: this.ricochets });
          if (continuation.shouldSpawn) {
            this.position = offsetRicochetOrigin(pick.pickedPoint, new Vector3(normal.x, normal.y, normal.z));
            this.velocity = new Vector3(
              continuation.direction.x,
              continuation.direction.y,
              continuation.direction.z,
            ).scale(continuation.speed);
            this.penetration = continuation.penetration;
            this.ricochets = continuation.ricochetCount;
            this.mesh.position.copyFrom(this.position);
            this.firstSegment = false;
            return true;
          }
        }
      }
      return this.dispose(); // penetration and shatter both stop here.
    }
    this.position = next;
    this.firstSegment = false;
    this.mesh.position.copyFrom(next);
    return this.age < TUNING.lifetime && Math.abs(next.x) < TUNING.arenaLimit && Math.abs(next.z) < TUNING.arenaLimit && next.y > -2;
  }

  private dispose(): false { this.mesh.dispose(); return false; }
}
