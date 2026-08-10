import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { HitCategory } from "../core/impacts";
import { registerHitTarget } from "../hit-targets";
import { ARMOR_PROFILES, type ArmorFacetId, type ArmorProfile, type ArmorProfileId } from "./armor";

export type TankFacet = Readonly<{
  id: ArmorFacetId;
  thickness: number;
  mesh: AbstractMesh;
}>;

export type TankEntity = Readonly<{
  root: TransformNode;
  turret: TransformNode;
  cannon: AbstractMesh;
  muzzle: TransformNode;
  profile: ArmorProfile;
  facets: Readonly<Record<ArmorFacetId, TankFacet>>;
}>;

export type CreateTankOptions = Readonly<{
  name: string;
  profile: ArmorProfileId;
  position: Vector3;
  rotationY?: number;
  color: Color3;
}>;

type PlateLayout = Readonly<{
  width: number;
  height: number;
  depth: number;
  position: Readonly<{ x: number; y: number; z: number }>;
  slopeDegrees: number;
}>;

/**
 * Shared geometry data. Neighboring hull plates intentionally overlap: a
 * grazing shell must never find a non-pickable seam between armor facets.
 */
export const HULL_PLATE_LAYOUT = {
  FRONT: {
    width: 4.4,
    height: 1.5,
    depth: 0.3,
    position: { x: 0, y: 1.3, z: -2.25 },
    slopeDegrees: 20,
  },
  LEFT_SIDE: {
    width: 0.3,
    height: 1.45,
    depth: 4.1,
    position: { x: -2.15, y: 1.05, z: 0 },
    slopeDegrees: 0,
  },
  RIGHT_SIDE: {
    width: 0.3,
    height: 1.45,
    depth: 4.1,
    position: { x: 2.15, y: 1.05, z: 0 },
    slopeDegrees: 0,
  },
  REAR: {
    width: 4.4,
    height: 1.45,
    depth: 0.3,
    position: { x: 0, y: 1.05, z: 2.15 },
    slopeDegrees: 0,
  },
  ROOF: {
    width: 4.1,
    height: 0.25,
    depth: 4.1,
    position: { x: 0, y: 1.78, z: 0.05 },
    slopeDegrees: 0,
  },
} as const satisfies Readonly<
  Record<Exclude<ArmorFacetId, "TURRET_FRONT">, PlateLayout>
>;

const TURRET_FRONT_LAYOUT = {
  width: 2.4,
  height: 0.8,
  depth: 0.25,
  position: { x: 0, y: 2.25, z: -0.95 },
  slopeDegrees: 14,
} as const satisfies PlateLayout;

/**
 * Creates a deliberately simple tank whose armor plates are actual, named
 * meshes. A future raycast can read a picked mesh's geometry normal directly.
 */
export function createTank(scene: Scene, options: CreateTankOptions): TankEntity {
  const profile = ARMOR_PROFILES[options.profile];
  const root = new TransformNode(options.name, scene);
  root.position.copyFrom(options.position);
  root.rotation.y = options.rotationY ?? 0;

  const armorMaterial = createArmorMaterial(`${options.name}-armor`, options.color, scene);
  const darkMaterial = createArmorMaterial(
    `${options.name}-core`,
    options.color.scale(0.58),
    scene,
  );

  const core = MeshBuilder.CreateBox(`${options.name}-hull-core`, { width: 4.2, height: 1.45, depth: 4.4 }, scene);
  core.parent = root;
  core.position.y = 1.05;
  core.material = darkMaterial;
  core.isPickable = false;

  const turret = new TransformNode(`${options.name}-turret`, scene);
  turret.parent = root;

  const facets = {
    FRONT: registerFacet(
      "FRONT",
      profile,
      createPlate(`${options.name}-front`, HULL_PLATE_LAYOUT.FRONT, root, armorMaterial, scene),
      core,
    ),
    LEFT_SIDE: registerFacet(
      "LEFT_SIDE",
      profile,
      createPlate(`${options.name}-left-side`, HULL_PLATE_LAYOUT.LEFT_SIDE, root, armorMaterial, scene),
      core,
    ),
    RIGHT_SIDE: registerFacet(
      "RIGHT_SIDE",
      profile,
      createPlate(`${options.name}-right-side`, HULL_PLATE_LAYOUT.RIGHT_SIDE, root, armorMaterial, scene),
      core,
    ),
    REAR: registerFacet(
      "REAR",
      profile,
      createPlate(`${options.name}-rear`, HULL_PLATE_LAYOUT.REAR, root, armorMaterial, scene),
      core,
    ),
    TURRET_FRONT: registerFacet(
      "TURRET_FRONT",
      profile,
      createPlate(`${options.name}-turret-front`, TURRET_FRONT_LAYOUT, turret, armorMaterial, scene),
      core,
    ),
    ROOF: registerFacet(
      "ROOF",
      profile,
      createPlate(`${options.name}-roof`, HULL_PLATE_LAYOUT.ROOF, root, armorMaterial, scene),
      core,
    ),
  } satisfies Record<ArmorFacetId, TankFacet>;

  const turretCore = MeshBuilder.CreateCylinder(
    `${options.name}-turret-core`,
    { diameter: 2.65, height: 0.55, tessellation: 8 },
    scene,
  );
  turretCore.parent = turret;
  turretCore.position.y = 2.08;
  turretCore.material = darkMaterial;
  turretCore.isPickable = false;

  const cannon = MeshBuilder.CreateBox(`${options.name}-cannon`, { width: 0.3, height: 0.3, depth: 2.5 }, scene);
  cannon.parent = turret;
  cannon.position.set(0, 2.37, -1.9);
  cannon.material = armorMaterial;
  cannon.isPickable = false;

  const muzzle = new TransformNode(`${options.name}-muzzle`, scene);
  muzzle.parent = cannon;
  muzzle.position.z = -1.25;

  return { root, turret, cannon, muzzle, profile, facets };
}

function createPlate(
  name: string,
  layout: PlateLayout,
  parent: TransformNode,
  material: StandardMaterial,
  scene: Scene,
): AbstractMesh {
  const plate = MeshBuilder.CreateBox(name, layout, scene);
  plate.parent = parent;
  plate.position.set(layout.position.x, layout.position.y, layout.position.z);
  plate.rotation.x = degreesToRadians(layout.slopeDegrees);
  plate.material = material;
  return plate;
}

function registerFacet(
  id: ArmorFacetId,
  profile: ArmorProfile,
  mesh: AbstractMesh,
  outwardOrigin: TransformNode,
): TankFacet {
  const facet = { id, thickness: profile.thicknessByFacet[id], mesh };
  registerHitTarget(mesh, {
    category: HitCategory.ARMOR,
    targetId: mesh.name,
    facetId: id,
    thickness: facet.thickness,
  }, outwardOrigin);
  return facet;
}

function createArmorMaterial(name: string, color: Color3, scene: Scene): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  // Armor slopes need highlights so players can read the angle before shooting.
  material.specularColor = new Color3(0.52, 0.52, 0.48);
  material.specularPower = 36;
  return material;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
