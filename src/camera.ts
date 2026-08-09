import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

/** Feel knobs: keep the approved 3/4 view in one easy-to-tune place. */
export const CAMERA_TUNING = {
  alpha: -Math.PI / 4,
  beta: Math.PI / 3.2,
  radius: 56,
  targetHeight: 0,
} as const;

export function createPlayerCamera(scene: Scene): ArcRotateCamera {
  const initialTarget = new Vector3(0, CAMERA_TUNING.targetHeight, 0);
  const camera = new ArcRotateCamera(
    "player-camera",
    CAMERA_TUNING.alpha,
    CAMERA_TUNING.beta,
    CAMERA_TUNING.radius,
    initialTarget,
    scene,
  );

  // Deliberately no attachControl: the approved angle stays fixed while the
  // target follows the player across the larger arena.
  camera.lowerRadiusLimit = CAMERA_TUNING.radius;
  camera.upperRadiusLimit = CAMERA_TUNING.radius;
  camera.lowerBetaLimit = CAMERA_TUNING.beta;
  camera.upperBetaLimit = CAMERA_TUNING.beta;
  camera.lowerAlphaLimit = CAMERA_TUNING.alpha;
  camera.upperAlphaLimit = CAMERA_TUNING.alpha;
  scene.activeCamera = camera;
  return camera;
}

export function followPlayer(camera: ArcRotateCamera, playerPosition: Vector3): void {
  camera.setTarget(new Vector3(
    playerPosition.x,
    CAMERA_TUNING.targetHeight,
    playerPosition.z,
  ));
}
