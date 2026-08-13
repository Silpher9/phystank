import { Engine } from "@babylonjs/core/Engines/engine";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { TankController } from "./tank/controls";
import { createTank, type TankEntity } from "./tank/tank";
import { getBarrelDirection, ShellSystem } from "./shells";
import { GameEventBus } from "./core/events";
import { ARENA_OBJECT_SPECS, createArena } from "./arena-scene";
import { createPlayerCamera, followPlayer } from "./camera";
import { HitFeedbackSystem } from "./vfx/hit-feedback";
import { createRenderingStack } from "./vfx/rendering";
import { DebugOverlaySystem } from "./debug/debug-overlay";
import { ShotRecoilSystem } from "./tank/shot-recoil";
import { HullPoseComposer } from "./tank/hull-pose";
import { DrivingSuspensionSystem } from "./tank/driving-suspension";
import { HitSuspensionSystem } from "./tank/hit-suspension";
import {
  AIM_CONVERGENCE_TUNING,
  AimConvergenceSystem,
} from "./tank/aim-convergence";
import { AimCursorSystem } from "./aim-cursor";
import { isPickableHitTarget } from "./hit-targets";
import { GunElevationSystem } from "./tank/gun-elevation";
import { createSceneLighting } from "./scene-lighting";
import {
  TANK_COLLISION_HALF_DEPTH,
  TANK_COLLISION_HALF_WIDTH,
  type TankCollisionBody,
} from "./tank/collision";
import "./styles.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("Game canvas is missing");
}

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: true,
});

const { scene, playerTank, tanks, camera, collisionBodies } = createScene(engine);
document.querySelector(".loading")?.remove();
createRenderingStack(scene, camera);

const gameEvents = new GameEventBus();
const aimConvergence = new AimConvergenceSystem(gameEvents);
const debugOverlay = new DebugOverlaySystem(
  scene,
  gameEvents,
  tanks,
  {
    panel: document.querySelector<HTMLElement>("#debug-overlay"),
    facets: document.querySelector<HTMLElement>("#debug-facets"),
    aim: document.querySelector<HTMLElement>("#debug-aim"),
    hit: document.querySelector<HTMLElement>("#debug-hit"),
    tuning: document.querySelector<HTMLElement>("#debug-tuning"),
  },
  [
    {
      id: "minimum-spread",
      label: "MIN SPREAD",
      unit: "°",
      min: AIM_CONVERGENCE_TUNING.MIN_SPREAD_LOWER_BOUND_DEGREES,
      max: AIM_CONVERGENCE_TUNING.MAX_SPREAD_DEGREES,
      step: AIM_CONVERGENCE_TUNING.MIN_SPREAD_STEP_DEGREES,
      getValue: () => aimConvergence.minimumSpreadDegrees,
      setValue: (value) => aimConvergence.setMinimumSpreadDegrees(value),
    },
  ],
);
const hitFeedback = new HitFeedbackSystem(
  scene,
  camera,
  gameEvents,
  document.querySelector<HTMLElement>("#hit-status"),
);
const shellSystem = new ShellSystem(scene, gameEvents);
const aimCursor = new AimCursorSystem(scene);
const gunElevation = new GunElevationSystem(playerTank);
const playerHullPose = new HullPoseComposer(playerTank);
const hullPoseTargets = tanks.map((tank) => ({
  tank,
  hullPose: tank === playerTank ? playerHullPose : new HullPoseComposer(tank),
}));
const shotRecoil = new ShotRecoilSystem(gameEvents, [
  { tank: playerTank, hullPose: playerHullPose },
]);
const drivingSuspension = new DrivingSuspensionSystem(
  gameEvents,
  playerHullPose,
);
const hitSuspension = new HitSuspensionSystem(gameEvents, hullPoseTargets);
const playerController = createPlayerController(
  scene,
  canvas,
  playerTank,
  gameEvents,
  collisionBodies,
  () => {
    const target = playerController.aimPoint;
    if (target) {
      gunElevation.update(target);
      shellSystem.fire(playerTank, aimConvergence.currentSpreadDegrees);
    }
  },
);
engine.runRenderLoop(() => {
  const deltaSeconds = engine.getDeltaTime() / 1000;
  playerController.update(deltaSeconds, readDriveInput());
  aimConvergence.update(deltaSeconds, {
    turretYawRadians: playerTank.turret.rotation.y,
    aimPoint: playerController.aimPoint,
  });
  drivingSuspension.update(deltaSeconds);
  shotRecoil.update(deltaSeconds);
  hitSuspension.update(deltaSeconds);
  hullPoseTargets.forEach(({ hullPose }) => hullPose.apply());
  gunElevation.update(playerController.aimPoint);
  const barrelDirection = getBarrelDirection(playerTank);
  const aimReady =
    gunElevation.reachable &&
    aimConvergence.currentSpreadDegrees <=
      aimConvergence.minimumSpreadDegrees + 0.001;
  aimCursor.update(
    playerTank.muzzle.getAbsolutePosition(),
    playerController.aimPoint,
    barrelDirection,
    aimConvergence.currentSpreadDegrees,
    gunElevation.reachable,
    aimReady,
    deltaSeconds,
    playerTank.root,
  );
  followPlayer(camera, playerTank.root.position);
  shellSystem.update(deltaSeconds);
  hitFeedback.update(deltaSeconds);
  debugOverlay.setAimSpreadDegrees(aimConvergence.currentSpreadDegrees);
  debugOverlay.update();
  updateReloadHud(playerController);
  scene.render();
});
window.addEventListener("resize", () => engine.resize());

function createScene(engine: Engine): {
  scene: Scene;
  playerTank: TankEntity;
  tanks: readonly TankEntity[];
  camera: ReturnType<typeof createPlayerCamera>;
  collisionBodies: readonly TankCollisionBody[];
} {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString("#171b1aff");

  const camera = createPlayerCamera(scene);

  const arenaMeshes = createArena(scene);
  const playerTank = createTank(scene, {
    name: "player-tank",
    profile: "BRAWLER",
    position: new Vector3(-5.5, 0, 2.5),
    rotationY: Math.PI / 8,
    color: Color3.FromHexString("#777f47"),
  });
  const targetTank = createTank(scene, {
    name: "allrounder-demo",
    profile: "ALLROUNDER",
    position: new Vector3(5.5, 0, -2.5),
    rotationY: -Math.PI * 0.78,
    color: Color3.FromHexString("#536d75"),
  });
  const arenaMeshesByName = new Map(arenaMeshes.map((mesh) => [mesh.name, mesh]));
  const collisionBodies: TankCollisionBody[] = ARENA_OBJECT_SPECS.map((spec) => {
    const mesh = arenaMeshesByName.get(spec.id);
    if (!mesh) throw new Error(`Arena collision mesh is missing: ${spec.id}`);
    return {
      kind: "BOX",
      id: spec.id,
      halfWidth: spec.size.width / 2,
      halfDepth: spec.size.depth / 2,
      getCenter: () => ({ x: spec.position.x, z: spec.position.z }),
      getRotationY: () => spec.rotationY ?? 0,
      isActive: () => !mesh.isDisposed() && mesh.isEnabled(),
    };
  });
  for (const tank of [playerTank, targetTank]) {
    collisionBodies.push({
      kind: "BOX",
      id: tank.root.name,
      halfWidth: TANK_COLLISION_HALF_WIDTH,
      halfDepth: TANK_COLLISION_HALF_DEPTH,
      getCenter: () => tank.root.position,
      getRotationY: () => tank.root.rotation.y,
    });
  }
  const ground = arenaMeshes.find((mesh) => mesh.name === "arena-ground");
  if (!ground) throw new Error("Arena ground is missing");
  createSceneLighting(
    scene,
    ground,
    scene.meshes.filter((mesh) => mesh !== ground),
  );
  followPlayer(camera, playerTank.root.position);
  return {
    scene,
    playerTank,
    tanks: [playerTank, targetTank],
    camera,
    collisionBodies,
  };
}

function createPlayerController(
  scene: Scene,
  canvas: HTMLCanvasElement,
  playerTank: TankEntity,
  events: GameEventBus,
  collisionBodies: readonly TankCollisionBody[],
  onFire: () => void,
): TankController {
  const controller = new TankController(playerTank, events, collisionBodies);
  const groundPlane = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());

  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const ray = scene.createPickingRay(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      null,
      scene.activeCamera,
    );
    const pick = scene.pickWithRay(
      ray,
      (mesh) => isPickableHitTarget(mesh, playerTank.root),
    );
    if (pick?.hit && pick.pickedPoint) {
      controller.setAimPoint(pick.pickedPoint);
      return;
    }
    const distance = ray.intersectsPlane(groundPlane);
    if (distance !== null)
      controller.setAimPoint(ray.origin.add(ray.direction.scale(distance)));
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (controller.beginReload()) onFire();
    }
  });
  return controller;
}

window.addEventListener("keydown", (event) => {
  if (event.code !== "F3") return;
  event.preventDefault();
  debugOverlay.toggle();
});

function readDriveInput(): { forward: number; turn: number } {
  const forward = Number(isKeyDown("KeyW")) - Number(isKeyDown("KeyS"));
  const turn = Number(isKeyDown("KeyA")) - Number(isKeyDown("KeyD"));
  return { forward, turn };
}

const heldKeys = new Set<string>();
window.addEventListener("keydown", (event) => heldKeys.add(event.code));
window.addEventListener("keyup", (event) => heldKeys.delete(event.code));

function isKeyDown(code: string): boolean {
  return heldKeys.has(code);
}

function updateReloadHud(controller: TankController): void {
  const hud = document.querySelector<HTMLElement>("#reload-status");
  if (!hud) return;
  const progress = Math.round(controller.reloadProgress * 100);
  hud.textContent = controller.isReloading
    ? `RELOADING ${progress}%`
    : "CANNON READY — Space = fire";
}
