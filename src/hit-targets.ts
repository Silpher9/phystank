import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { HitTargetData } from "./core/impacts";

const TARGET_BY_MESH = new WeakMap<AbstractMesh, HitTargetData>();

export function registerHitTarget(mesh: AbstractMesh, target: HitTargetData): void {
  TARGET_BY_MESH.set(mesh, Object.freeze({ ...target }));
  mesh.isPickable = true;
}

export function getHitTarget(mesh: AbstractMesh | null | undefined): HitTargetData | undefined {
  return mesh ? TARGET_BY_MESH.get(mesh) : undefined;
}

/** Returns the registered target's outward-facing world-space normal. */
export function getHitNormalFromPick(pick: PickingInfo): Vector3 | null {
  if (!getHitTarget(pick.pickedMesh) || !pick.hit) return null;

  // Babylon flips a picked normal toward the ray. Restore the target's outward
  // geometric orientation so inside-out armor contacts can still be rejected.
  const normal = pick.getNormal(true, false);
  const hitPoint = pick.pickedPoint;
  const mesh = pick.pickedMesh;
  if (!normal || !hitPoint || !mesh) return null;

  const outward = hitPoint.subtract(mesh.getBoundingInfo().boundingBox.centerWorld);
  if (Vector3.Dot(normal, outward) < 0) normal.negateInPlace();
  return normal.normalize();
}
