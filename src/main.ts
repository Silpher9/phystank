import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { TankController } from "./tank/controls";
import { createTank, type TankEntity } from "./tank/tank";
import { ShellSystem } from "./shells";
import { GameEventBus } from "./core/events";
import { createArena } from "./arena-scene";
import { createPlayerCamera, followPlayer } from "./camera";
import { HitFeedbackSystem } from "./vfx/hit-feedback";
import { createRenderingStack } from "./vfx/rendering";
import { DebugOverlaySystem } from "./debug/debug-overlay";
import { ShotRecoilSystem } from "./tank/shot-recoil";
import { HullPoseComposer } from "./tank/hull-pose";
import "./styles.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("Game canvas is missing");
}

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: true,
});

const { scene, playerTank, tanks, camera } = createScene(engine);
document.querySelector(".loading")?.remove();
createRenderingStack(scene, camera);

const gameEvents = new GameEventBus();
const debugOverlay = new DebugOverlaySystem(scene, gameEvents, tanks, {
  panel: document.querySelector<HTMLElement>("#debug-overlay"),
  facets: document.querySelector<HTMLElement>("#debug-facets"),
  hit: document.querySelector<HTMLElement>("#debug-hit"),
});
const hitFeedback = new HitFeedbackSystem(
  scene,
  camera,
  gameEvents,
  document.querySelector<HTMLElement>("#hit-status"),
);
const shellSystem = new ShellSystem(scene, gameEvents);
const playerHullPose = new HullPoseComposer(playerTank);
const shotRecoil = new ShotRecoilSystem(gameEvents, [
  { tank: playerTank, hullPose: playerHullPose },
]);
const playerController = createPlayerController(scene, canvas, playerTank, gameEvents, () => {
  const target = playerController.aimPoint;
  if (target) shellSystem.fire(playerTank, target);
});
engine.runRenderLoop(() => {
  const deltaSeconds = engine.getDeltaTime() / 1000;
  playerController.update(deltaSeconds, readDriveInput());
  shotRecoil.update(deltaSeconds);
  playerHullPose.apply();
  followPlayer(camera, playerTank.root.position);
  shellSystem.update(deltaSeconds);
  hitFeedback.update(deltaSeconds);
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
} {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString("#171b1aff");

  const camera = createPlayerCamera(scene);

  const sun = new DirectionalLight("angle-light", new Vector3(-0.55, -1, 0.35), scene);
  sun.position = new Vector3(12, 20, -10);
  sun.intensity = 2.4;
  sun.diffuse = Color3.FromHexString("#ffe9bd");

  const fill = new HemisphericLight("fill-light", new Vector3(0, 1, 0), scene);
  fill.intensity = 0.28;
  fill.diffuse = Color3.FromHexString("#afc7e6");
  fill.groundColor = Color3.FromHexString("#1b211d");

  createArena(scene);
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
  followPlayer(camera, playerTank.root.position);
  return { scene, playerTank, tanks: [playerTank, targetTank], camera };
}

function createPlayerController(
  scene: Scene,
  canvas: HTMLCanvasElement,
  playerTank: TankEntity,
  events: GameEventBus,
  onFire: () => void,
): TankController {
  const controller = new TankController(playerTank, events);
  const groundPlane = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());

  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const ray = scene.createPickingRay(event.clientX - bounds.left, event.clientY - bounds.top, null, scene.activeCamera);
    const distance = ray.intersectsPlane(groundPlane);
    if (distance !== null) controller.setAimPoint(ray.origin.add(ray.direction.scale(distance)));
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
  hud.textContent = controller.isReloading ? `RELOADING ${progress}%` : "CANNON READY — Space = fire";
}
