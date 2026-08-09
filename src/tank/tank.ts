import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ARMOR_PROFILES, type ArmorFacetId, type ArmorProfile, type ArmorProfileId } from "./armor";

export type TankFacet = Readonly<{
  id: ArmorFacetId;
  thickness: number;
  mesh: AbstractMesh;
}>;

export type TankEntity = Readonly<{
  root: TransformNode;
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

const FACET_BY_MESH = new WeakMap<AbstractMesh, TankFacet>();

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

  const facets = {
    FRONT: registerFacet(
      "FRONT",
      profile,
      createPlate(`${options.name}-front`, { width: 4.4, height: 1.5, depth: 0.3 }, new Vector3(0, 1.3, -2.25), 20, root, armorMaterial, scene),
    ),
    LEFT_SIDE: registerFacet(
      "LEFT_SIDE",
      profile,
      createPlate(`${options.name}-left-side`, { width: 0.3, height: 1.3, depth: 4.1 }, new Vector3(-2.15, 1.05, 0), 0, root, armorMaterial, scene),
    ),
    RIGHT_SIDE: registerFacet(
      "RIGHT_SIDE",
      profile,
      createPlate(`${options.name}-right-side`, { width: 0.3, height: 1.3, depth: 4.1 }, new Vector3(2.15, 1.05, 0), 0, root, armorMaterial, scene),
    ),
    REAR: registerFacet(
      "REAR",
      profile,
      createPlate(`${options.name}-rear`, { width: 4.4, height: 1.3, depth: 0.3 }, new Vector3(0, 1.05, 2.15), 0, root, armorMaterial, scene),
    ),
    TURRET_FRONT: registerFacet(
      "TURRET_FRONT",
      profile,
      createPlate(`${options.name}-turret-front`, { width: 2.4, height: 0.8, depth: 0.25 }, new Vector3(0, 2.25, -0.95), 14, root, armorMaterial, scene),
    ),
    ROOF: registerFacet(
      "ROOF",
      profile,
      createPlate(`${options.name}-roof`, { width: 3.95, height: 0.2, depth: 3.85 }, new Vector3(0, 1.83, 0.05), 0, root, armorMaterial, scene),
    ),
  } satisfies Record<ArmorFacetId, TankFacet>;

  const turretCore = MeshBuilder.CreateCylinder(
    `${options.name}-turret-core`,
    { diameter: 2.65, height: 0.55, tessellation: 8 },
    scene,
  );
  turretCore.parent = root;
  turretCore.position.y = 2.08;
  turretCore.material = darkMaterial;
  turretCore.isPickable = false;

  const cannon = MeshBuilder.CreateBox(`${options.name}-cannon`, { width: 0.3, height: 0.3, depth: 2.5 }, scene);
  cannon.parent = root;
  cannon.position.set(0, 2.37, -1.9);
  cannon.material = armorMaterial;
  cannon.isPickable = false;

  return { root, profile, facets };
}

/** Returns armor data only when the picked mesh is one of the named plates. */
export function getFacetForMesh(mesh: AbstractMesh | null | undefined): TankFacet | undefined {
  return mesh ? FACET_BY_MESH.get(mesh) : undefined;
}

/**
 * Reads the world-space normal from the picked geometry, instead of recreating
 * a slope angle in gameplay code. Returns null for non-armor or invalid picks.
 */
export function getFacetNormalFromPick(pick: PickingInfo): Vector3 | null {
  if (!getFacetForMesh(pick.pickedMesh) || !pick.hit) return null;

  const normal = pick.getNormal(true);
  return normal?.normalize() ?? null;
}

function createPlate(
  name: string,
  dimensions: { width: number; height: number; depth: number },
  position: Vector3,
  slopeDegrees: number,
  parent: TransformNode,
  material: StandardMaterial,
  scene: Scene,
): AbstractMesh {
  const plate = MeshBuilder.CreateBox(name, dimensions, scene);
  plate.parent = parent;
  plate.position.copyFrom(position);
  plate.rotation.x = degreesToRadians(slopeDegrees);
  plate.material = material;
  return plate;
}

function registerFacet(id: ArmorFacetId, profile: ArmorProfile, mesh: AbstractMesh): TankFacet {
  const facet = { id, thickness: profile.thicknessByFacet[id], mesh };
  FACET_BY_MESH.set(mesh, facet);
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
