import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import "./styles.css";

/** Feel knobs: keep the fixed 3/4 view in one easy-to-tune place. */
export const CAMERA_TUNING = {
  alpha: -Math.PI / 4,
  beta: Math.PI / 3.2,
  radius: 56,
  target: new Vector3(0, 0, 0),
} as const;

const ARENA_SIZE = 32;
const WALL_THICKNESS = 0.5;
const WALL_HEIGHT = 1;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("Game canvas ontbreekt");
}

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: true,
});

const scene = createScene(engine, canvas);
document.querySelector(".loading")?.remove();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

function createScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString("#171b1aff");

  const camera = new ArcRotateCamera(
    "fixed-camera",
    CAMERA_TUNING.alpha,
    CAMERA_TUNING.beta,
    CAMERA_TUNING.radius,
    CAMERA_TUNING.target,
    scene,
  );
  // Deliberately no attachControl: phase 0's camera is fixed for aim readability.
  camera.lowerRadiusLimit = CAMERA_TUNING.radius;
  camera.upperRadiusLimit = CAMERA_TUNING.radius;
  camera.lowerBetaLimit = CAMERA_TUNING.beta;
  camera.upperBetaLimit = CAMERA_TUNING.beta;
  camera.lowerAlphaLimit = CAMERA_TUNING.alpha;
  camera.upperAlphaLimit = CAMERA_TUNING.alpha;
  camera.setTarget(CAMERA_TUNING.target);
  scene.activeCamera = camera;

  const sun = new DirectionalLight("angle-light", new Vector3(-0.55, -1, 0.35), scene);
  sun.position = new Vector3(12, 20, -10);
  sun.intensity = 2.4;
  sun.diffuse = Color3.FromHexString("#ffe9bd");

  const fill = new HemisphericLight("fill-light", new Vector3(0, 1, 0), scene);
  fill.intensity = 0.28;
  fill.diffuse = Color3.FromHexString("#afc7e6");
  fill.groundColor = Color3.FromHexString("#1b211d");

  createArena(scene);
  return scene;
}

function createArena(scene: Scene): void {
  const ground = MeshBuilder.CreateGround("arena-ground", { width: ARENA_SIZE, height: ARENA_SIZE }, scene);
  const groundMaterial = new StandardMaterial("ground-material", scene);
  groundMaterial.diffuseColor = Color3.FromHexString("#465146");
  groundMaterial.specularColor = Color3.Black();
  ground.material = groundMaterial;

  const wallMaterial = new StandardMaterial("wall-material", scene);
  wallMaterial.diffuseColor = Color3.FromHexString("#758170");
  wallMaterial.specularColor = Color3.Black();

  const halfArena = ARENA_SIZE / 2;
  const walls = [
    { name: "north-boundary", width: ARENA_SIZE + WALL_THICKNESS * 2, depth: WALL_THICKNESS, x: 0, z: -halfArena },
    { name: "south-boundary", width: ARENA_SIZE + WALL_THICKNESS * 2, depth: WALL_THICKNESS, x: 0, z: halfArena },
    { name: "west-boundary", width: WALL_THICKNESS, depth: ARENA_SIZE, x: -halfArena, z: 0 },
    { name: "east-boundary", width: WALL_THICKNESS, depth: ARENA_SIZE, x: halfArena, z: 0 },
  ];

  for (const wall of walls) {
    const mesh = MeshBuilder.CreateBox(
      wall.name,
      { width: wall.width, depth: wall.depth, height: WALL_HEIGHT },
      scene,
    );
    mesh.position.set(wall.x, WALL_HEIGHT / 2, wall.z);
    mesh.material = wallMaterial;
  }
}
