import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { ARENA_SIZE, WALL_HEIGHT, WALL_THICKNESS } from "./arena";
import { HitCategory, type HitTargetData } from "./core/impacts";
import { registerHitTarget } from "./hit-targets";

const HIT_TARGET_PRESETS = {
  CONCRETE: {
    category: HitCategory.HARD,
    equivalentArmor: 400,
  },
  WOODEN_CRATE: {
    category: HitCategory.SOFT,
    retainedSpeed: 0.8,
    retainedPenetration: 0.7,
  },
} as const;

type HitTargetPreset = keyof typeof HIT_TARGET_PRESETS;
type ArenaObjectSpec = Readonly<{
  id: string;
  targetPreset: HitTargetPreset;
  position: Readonly<{ x: number; y: number; z: number }>;
  size: Readonly<{ width: number; height: number; depth: number }>;
  rotationY?: number;
}>;

export const ARENA_OBJECT_SPECS: readonly ArenaObjectSpec[] = [
  { id: "concrete-northwest", targetPreset: "CONCRETE", position: { x: -22, y: 1, z: -15 }, size: { width: 12, height: 2, depth: 1.5 }, rotationY: 0.25 },
  { id: "concrete-east", targetPreset: "CONCRETE", position: { x: 21, y: 1, z: 12 }, size: { width: 1.5, height: 2, depth: 12 }, rotationY: -0.2 },
  { id: "crate-west", targetPreset: "WOODEN_CRATE", position: { x: -18, y: 1, z: 8 }, size: { width: 2, height: 2, depth: 2 }, rotationY: 0.15 },
  { id: "crate-southeast", targetPreset: "WOODEN_CRATE", position: { x: 16, y: 1, z: -12 }, size: { width: 2.4, height: 2, depth: 2 }, rotationY: -0.3 },
  { id: "crate-far-north", targetPreset: "WOODEN_CRATE", position: { x: 28, y: 1, z: 25 }, size: { width: 2, height: 2, depth: 2.5 }, rotationY: 0.45 },
  { id: "crate-far-south", targetPreset: "WOODEN_CRATE", position: { x: -30, y: 1, z: -25 }, size: { width: 2.5, height: 2, depth: 2 }, rotationY: -0.2 },
];

export function createArena(scene: Scene): readonly AbstractMesh[] {
  const materials = createMaterials(scene);
  const targets: AbstractMesh[] = [];

  const ground = MeshBuilder.CreateGround("arena-ground", { width: ARENA_SIZE, height: ARENA_SIZE }, scene);
  ground.material = materials.GROUND;
  registerPreset(ground, "arena-ground", "CONCRETE");
  targets.push(ground);

  const halfArena = ARENA_SIZE / 2;
  const walls = [
    { id: "north-boundary", width: ARENA_SIZE + WALL_THICKNESS * 2, depth: WALL_THICKNESS, x: 0, z: -halfArena },
    { id: "south-boundary", width: ARENA_SIZE + WALL_THICKNESS * 2, depth: WALL_THICKNESS, x: 0, z: halfArena },
    { id: "west-boundary", width: WALL_THICKNESS, depth: ARENA_SIZE, x: -halfArena, z: 0 },
    { id: "east-boundary", width: WALL_THICKNESS, depth: ARENA_SIZE, x: halfArena, z: 0 },
  ];
  for (const wall of walls) {
    const mesh = MeshBuilder.CreateBox(
      wall.id,
      { width: wall.width, depth: wall.depth, height: WALL_HEIGHT },
      scene,
    );
    mesh.position.set(wall.x, WALL_HEIGHT / 2, wall.z);
    mesh.material = materials.CONCRETE;
    registerPreset(mesh, wall.id, "CONCRETE");
    targets.push(mesh);
  }

  for (const spec of ARENA_OBJECT_SPECS) {
    const mesh = MeshBuilder.CreateBox(spec.id, spec.size, scene);
    mesh.position.copyFrom(new Vector3(spec.position.x, spec.position.y, spec.position.z));
    mesh.rotation.y = spec.rotationY ?? 0;
    mesh.material = materials[spec.targetPreset];
    registerPreset(mesh, spec.id, spec.targetPreset);
    targets.push(mesh);
  }

  return targets;
}

function registerPreset(mesh: AbstractMesh, targetId: string, preset: HitTargetPreset): void {
  registerHitTarget(mesh, {
    ...HIT_TARGET_PRESETS[preset],
    targetId,
  } as HitTargetData);
}

function createMaterials(scene: Scene): Record<"GROUND" | HitTargetPreset, StandardMaterial> {
  const ground = new StandardMaterial("ground-material", scene);
  ground.diffuseColor = Color3.FromHexString("#465146");
  ground.specularColor = Color3.Black();

  const concrete = new StandardMaterial("concrete-material", scene);
  concrete.diffuseColor = Color3.FromHexString("#77796f");
  concrete.specularColor = Color3.Black();

  const wood = new StandardMaterial("wood-material", scene);
  wood.diffuseColor = Color3.FromHexString("#785f3d");
  wood.specularColor = Color3.Black();

  return {
    GROUND: ground,
    CONCRETE: concrete,
    WOODEN_CRATE: wood,
  };
}
