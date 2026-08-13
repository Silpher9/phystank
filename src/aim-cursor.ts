import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { GreasedLineSimpleMaterial } from "@babylonjs/core/Materials/GreasedLine/greasedLineSimpleMaterial";
import { GreasedLineMeshMaterialType } from "@babylonjs/core/Materials/GreasedLine/greasedLineMaterialInterfaces";
import { CreateGreasedLine } from "@babylonjs/core/Meshes/Builders/greasedLineBuilder";
import { CreateDashedLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { GreasedLineBaseMesh } from "@babylonjs/core/Meshes/GreasedLine/greasedLineBaseMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { ARENA_SIZE, WALL_THICKNESS } from "./arena";
import { getHitTarget } from "./hit-targets";

export const AIM_CURSOR_TUNING = {
  elevation: 0.06,
  lineWidthPixels: 4,
  readyLineWidthPixels: 5,
  contrastWidthPixels: 8,
  centerHalfExtent: 0.13,
  contrastCenterHalfExtent: 0.19,
  targetRadius: 0.18,
  contrastTargetRadius: 0.24,
  targetHeight: 0.012,
  groundY: 0,
  arenaHalfExtent: ARENA_SIZE / 2 - WALL_THICKNESS / 2,
  rayMaxDistance: ARENA_SIZE * 2,
  targetSmoothingRate: 25,
  tetherHideDistance: 0.3,
  tetherDashSize: 3,
  tetherGapSize: 2,
  tetherDashCount: 8,
  tetherAlpha: 0.5,
  settlingAlpha: 0.68,
  readyAlpha: 0.98,
  arcDegrees: 54,
  arcSegments: 9,
  renderingGroupId: 2,
} as const;

const AIM_CURSOR_COLORS = {
  contrast: Color3.FromHexString("#252822"),
  reachable: Color3.FromHexString("#d9d4bd"),
  unreachable: Color3.FromHexString("#a9654f"),
  target: Color3.FromHexString("#b8d6df"),
  tether: Color3.FromHexString("#899287"),
} as const;

type Point = Readonly<{ x: number; y: number; z: number }>;

/** Projects an angular shot cone onto the horizontal plane at aim distance. */
export function calculateAimCursorRadius(
  distance: number,
  spreadDegrees: number,
): number {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const safeSpread = Number.isFinite(spreadDegrees) ? Math.max(0, spreadDegrees) : 0;
  return safeDistance * Math.tan(safeSpread * Math.PI / 180);
}

/** Places the spread ring where the actual barrel line meets the ground. */
export function calculateAimCursorLoopPoint(
  origin: Point,
  aimPoint: Point,
  barrelDirection: Point,
): Vector3 {
  const horizontalBarrelLength = Math.hypot(
    barrelDirection.x,
    barrelDirection.z,
  );
  if (
    !Number.isFinite(horizontalBarrelLength) ||
    horizontalBarrelLength <= Number.EPSILON
  ) {
    return new Vector3(
      clamp(aimPoint.x, -AIM_CURSOR_TUNING.arenaHalfExtent, AIM_CURSOR_TUNING.arenaHalfExtent),
      AIM_CURSOR_TUNING.groundY,
      clamp(aimPoint.z, -AIM_CURSOR_TUNING.arenaHalfExtent, AIM_CURSOR_TUNING.arenaHalfExtent),
    );
  }

  const horizontalX = barrelDirection.x / horizontalBarrelLength;
  const horizontalZ = barrelDirection.z / horizontalBarrelLength;
  const arenaDistance = calculateArenaBoundaryDistance(
    origin.x,
    origin.z,
    horizontalX,
    horizontalZ,
  );
  const rayDistance =
    (AIM_CURSOR_TUNING.groundY - origin.y) / barrelDirection.y;
  const groundDistance = Number.isFinite(rayDistance) && rayDistance > 0
    ? rayDistance * horizontalBarrelLength
    : Number.POSITIVE_INFINITY;
  const distance = Math.min(arenaDistance, groundDistance);

  if (!Number.isFinite(distance) || distance < 0) {
    return new Vector3(aimPoint.x, AIM_CURSOR_TUNING.groundY, aimPoint.z);
  }
  return new Vector3(
    origin.x + horizontalX * distance,
    AIM_CURSOR_TUNING.groundY,
    origin.z + horizontalZ * distance,
  );
}

export class AimCursorSystem {
  private readonly root: TransformNode;
  private readonly targetRoot: TransformNode;
  private readonly spreadRing: GreasedLineBaseMesh;
  private readonly contrastRing: GreasedLineBaseMesh;
  private readonly center: GreasedLineBaseMesh;
  private readonly contrastCenter: GreasedLineBaseMesh;
  private readonly target: AbstractMesh;
  private readonly contrastTarget: AbstractMesh;
  private readonly tether: LinesMesh;
  private readonly ringOrientation = Quaternion.Identity();
  private readonly spreadMaterial: GreasedLineSimpleMaterial;
  private readonly centerMaterial: GreasedLineSimpleMaterial;
  private readonly targetMaterial: StandardMaterial;
  private readonly cursorMaterials: Array<
    GreasedLineSimpleMaterial | StandardMaterial
  >;
  private _radius = 0;
  private _reachable = true;
  private displayedAimPoint: Vector3 | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly excludedRoot: TransformNode,
  ) {
    this.root = new TransformNode("aim-cursor", scene);
    this.targetRoot = new TransformNode("aim-cursor-target-root", scene);
    this.root.rotationQuaternion = this.ringOrientation;
    const contrastRing = createCursorLine(
      "aim-cursor-contrast-ring",
      createArcSegments(),
      AIM_CURSOR_TUNING.contrastWidthPixels,
      AIM_CURSOR_COLORS.contrast,
      scene,
    );
    const spreadRing = createCursorLine(
      "aim-cursor-spread-ring",
      createArcSegments(),
      AIM_CURSOR_TUNING.lineWidthPixels,
      AIM_CURSOR_COLORS.reachable,
      scene,
    );
    const contrastCenter = createCursorLine(
      "aim-cursor-contrast-center",
      createCenterLines(AIM_CURSOR_TUNING.contrastCenterHalfExtent),
      AIM_CURSOR_TUNING.contrastWidthPixels,
      AIM_CURSOR_COLORS.contrast,
      scene,
    );
    const center = createCursorLine(
      "aim-cursor-center",
      createCenterLines(AIM_CURSOR_TUNING.centerHalfExtent),
      AIM_CURSOR_TUNING.lineWidthPixels,
      AIM_CURSOR_COLORS.reachable,
      scene,
    );
    const contrastTarget = createTargetDisc(
      "aim-cursor-contrast-target",
      AIM_CURSOR_TUNING.contrastTargetRadius,
      AIM_CURSOR_TUNING.targetHeight,
      AIM_CURSOR_COLORS.contrast,
      scene,
    );
    const target = createTargetDisc(
      "aim-cursor-target",
      AIM_CURSOR_TUNING.targetRadius,
      AIM_CURSOR_TUNING.targetHeight,
      AIM_CURSOR_COLORS.target,
      scene,
    );
    this.tether = CreateDashedLines(
      "aim-cursor-tether",
      {
        points: [Vector3.Zero(), new Vector3(0, 0, 0.001)],
        dashSize: AIM_CURSOR_TUNING.tetherDashSize,
        gapSize: AIM_CURSOR_TUNING.tetherGapSize,
        dashNb: AIM_CURSOR_TUNING.tetherDashCount,
        updatable: true,
      },
      scene,
    );
    this.tether.color = AIM_CURSOR_COLORS.tether.clone();
    this.tether.alpha = AIM_CURSOR_TUNING.tetherAlpha;
    this.contrastRing = contrastRing.mesh;
    this.spreadRing = spreadRing.mesh;
    this.contrastCenter = contrastCenter.mesh;
    this.center = center.mesh;
    this.contrastTarget = contrastTarget.mesh;
    this.target = target.mesh;
    this.spreadMaterial = spreadRing.material;
    this.centerMaterial = center.material;
    this.targetMaterial = target.material;
    this.cursorMaterials = [
      contrastRing.material,
      spreadRing.material,
      contrastCenter.material,
      center.material,
      contrastTarget.material,
      target.material,
    ];

    for (const mesh of [this.contrastRing, this.spreadRing, this.contrastCenter, this.center]) {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = AIM_CURSOR_TUNING.renderingGroupId;
    }
    for (const mesh of [this.contrastTarget, this.target]) {
      mesh.parent = this.targetRoot;
      mesh.isPickable = false;
      mesh.renderingGroupId = AIM_CURSOR_TUNING.renderingGroupId;
    }
    this.tether.isPickable = false;
    this.tether.renderingGroupId = AIM_CURSOR_TUNING.renderingGroupId;
    this.contrastRing.position.y = -0.002;
    this.center.position.y = 0.004;
    this.contrastTarget.position.y = -0.002;
    this.target.position.y = 0.004;
    this.scene.setRenderingAutoClearDepthStencil(
      AIM_CURSOR_TUNING.renderingGroupId,
      true,
      true,
      false,
    );
    this.root.setEnabled(false);
    this.targetRoot.setEnabled(false);
    this.tether.setEnabled(false);
  }

  get radius(): number {
    return this._radius;
  }

  get visible(): boolean {
    return this.root.isEnabled();
  }

  get reachable(): boolean {
    return this._reachable;
  }

  update(
    origin: Point,
    aimPoint: Point | null,
    barrelDirection: Point,
    spreadDegrees: number,
    reachable = true,
    ready = false,
    deltaSeconds = 1 / 60,
  ): void {
    if (!aimPoint) {
      this.root.setEnabled(false);
      this.targetRoot.setEnabled(false);
      this.tether.setEnabled(false);
      this.displayedAimPoint = null;
      return;
    }

    const collision = this.findFirstCollision(origin, barrelDirection);
    const loopPoint = collision?.point
      ?? calculateAimCursorLoopPoint(origin, aimPoint, barrelDirection);
    const distance = collision?.distance
      ?? Math.hypot(loopPoint.x - origin.x, loopPoint.z - origin.z);
    this._radius = calculateAimCursorRadius(distance, spreadDegrees);
    this._reachable = reachable;
    this.updateRingOrientation(barrelDirection);
    this.updateDisplayedAimPoint(aimPoint, deltaSeconds);
    const displayedAimPoint = this.displayedAimPoint;
    if (!displayedAimPoint) return;
    this.root.position.set(
      loopPoint.x,
      loopPoint.y + AIM_CURSOR_TUNING.elevation,
      loopPoint.z,
    );
    this.targetRoot.position.set(
      displayedAimPoint.x,
      displayedAimPoint.y + AIM_CURSOR_TUNING.elevation,
      displayedAimPoint.z,
    );
    this.root.computeWorldMatrix(true);
    this.targetRoot.computeWorldMatrix(true);
    this.target.computeWorldMatrix(true);
    this.contrastTarget.computeWorldMatrix(true);
    this.spreadRing.scaling.set(this._radius, 1, this._radius);
    this.contrastRing.scaling.set(this._radius, 1, this._radius);
    const cursorColor = reachable
      ? AIM_CURSOR_COLORS.reachable
      : AIM_CURSOR_COLORS.unreachable;
    const isReady = ready && reachable;
    this.spreadMaterial.setColor(cursorColor);
    this.centerMaterial.setColor(cursorColor);
    this.targetMaterial.diffuseColor.copyFrom(AIM_CURSOR_COLORS.target);
    this.targetMaterial.alpha = isReady ? 1 : 0.96;
    this.spreadMaterial.width = isReady
      ? AIM_CURSOR_TUNING.readyLineWidthPixels
      : AIM_CURSOR_TUNING.lineWidthPixels;
    this.centerMaterial.width = this.spreadMaterial.width;
    this.spreadMaterial.alpha = isReady
      ? AIM_CURSOR_TUNING.readyAlpha
      : AIM_CURSOR_TUNING.settlingAlpha;
    this.centerMaterial.alpha = this.spreadMaterial.alpha;
    const warningRotation = reachable ? 0 : Math.PI / 4;
    this.center.rotation.y = warningRotation;
    this.contrastCenter.rotation.y = warningRotation;
    this.updateTether();
    this.root.setEnabled(true);
    this.targetRoot.setEnabled(true);
  }

  dispose(): void {
    this.root.dispose();
    this.targetRoot.dispose();
    this.tether.dispose();
    this.cursorMaterials.forEach((material) => material.dispose());
  }

  private updateDisplayedAimPoint(
    aimPoint: Point,
    deltaSeconds: number,
  ): void {
    if (!this.displayedAimPoint) {
      this.displayedAimPoint = new Vector3(aimPoint.x, aimPoint.y, aimPoint.z);
      return;
    }

    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const smoothing = Math.min(1, safeDelta * AIM_CURSOR_TUNING.targetSmoothingRate);
    this.displayedAimPoint.x += (aimPoint.x - this.displayedAimPoint.x) * smoothing;
    this.displayedAimPoint.y += (aimPoint.y - this.displayedAimPoint.y) * smoothing;
    this.displayedAimPoint.z += (aimPoint.z - this.displayedAimPoint.z) * smoothing;
  }

  private updateTether(): void {
    if (!this.displayedAimPoint) return;

    const distance = Math.hypot(
      this.root.position.x - this.targetRoot.position.x,
      this.root.position.z - this.targetRoot.position.z,
    );
    if (distance <= AIM_CURSOR_TUNING.tetherHideDistance) {
      this.tether.setEnabled(false);
      return;
    }

    CreateDashedLines(
      this.tether.name,
      {
        points: [this.root.position.clone(), this.targetRoot.position.clone()],
        instance: this.tether,
      },
      this.scene,
    );
    this.tether.setEnabled(true);
  }

  private updateRingOrientation(barrelDirection: Point): void {
    const direction = new Vector3(
      barrelDirection.x,
      barrelDirection.y,
      barrelDirection.z,
    );
    const lengthSquared = direction.lengthSquared();
    if (!Number.isFinite(lengthSquared) || lengthSquared <= Number.EPSILON) {
      this.ringOrientation.copyFrom(Quaternion.Identity());
      return;
    }
    direction.normalize();
    Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      direction,
      this.ringOrientation,
    );
  }

  private findFirstCollision(
    origin: Point,
    barrelDirection: Point,
  ): { point: Vector3; distance: number } | null {
    const direction = new Vector3(
      barrelDirection.x,
      barrelDirection.y,
      barrelDirection.z,
    );
    const directionLengthSquared = direction.lengthSquared();
    if (!Number.isFinite(directionLengthSquared) || directionLengthSquared <= Number.EPSILON) {
      return null;
    }
    direction.normalize();

    const ray = new Ray(
      new Vector3(origin.x, origin.y, origin.z),
      direction,
      AIM_CURSOR_TUNING.rayMaxDistance,
    );
    const pick = this.scene.pickWithRay(
      ray,
      (mesh) => Boolean(mesh.isPickable)
        && Boolean(getHitTarget(mesh))
        && !mesh.isDescendantOf(this.excludedRoot),
    );
    if (!pick?.hit || !pick.pickedPoint || !Number.isFinite(pick.distance)) {
      return null;
    }
    return {
      point: pick.pickedPoint.clone(),
      distance: Math.max(0, pick.distance),
    };
  }
}

function createCursorLine(
  name: string,
  points: Vector3[][],
  width: number,
  color: Color3,
  scene: Scene,
): { mesh: GreasedLineBaseMesh; material: GreasedLineSimpleMaterial } {
  const mesh = CreateGreasedLine(
    name,
    { points },
    {
      materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_SIMPLE,
      width,
      sizeAttenuation: true,
      color,
    },
    scene,
  );
  const material = mesh.material as GreasedLineSimpleMaterial;
  material.alpha = name.includes("contrast") ? 0.95 : 0.92;
  return { mesh, material };
}

function createTargetDisc(
  name: string,
  radius: number,
  height: number,
  color: Color3,
  scene: Scene,
): { mesh: AbstractMesh; material: StandardMaterial } {
  const mesh = MeshBuilder.CreateCylinder(
    name,
    { diameter: radius * 2, height, tessellation: 16 },
    scene,
  );
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = color.clone();
  material.emissiveColor = color.scale(0.2);
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = 0.96;
  mesh.material = material;
  return { mesh, material };
}

function calculateArenaBoundaryDistance(
  originX: number,
  originZ: number,
  directionX: number,
  directionZ: number,
): number {
  const halfExtent = AIM_CURSOR_TUNING.arenaHalfExtent;
  const candidates = [
    directionX > Number.EPSILON
      ? (halfExtent - originX) / directionX
      : directionX < -Number.EPSILON
        ? (-halfExtent - originX) / directionX
        : Number.POSITIVE_INFINITY,
    directionZ > Number.EPSILON
      ? (halfExtent - originZ) / directionZ
      : directionZ < -Number.EPSILON
        ? (-halfExtent - originZ) / directionZ
        : Number.POSITIVE_INFINITY,
  ].filter((distance) => Number.isFinite(distance) && distance >= 0);
  return candidates.length > 0 ? Math.min(...candidates) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function createArcSegments(): Vector3[][] {
  const halfArc = AIM_CURSOR_TUNING.arcDegrees * Math.PI / 360;
  return Array.from({ length: 4 }, (_, quadrant) => {
    const center = Math.PI / 4 + quadrant * Math.PI / 2;
    return Array.from({ length: AIM_CURSOR_TUNING.arcSegments + 1 }, (_, index) => {
      const progress = index / AIM_CURSOR_TUNING.arcSegments;
      const angle = center - halfArc + progress * halfArc * 2;
      return new Vector3(Math.cos(angle), 0, Math.sin(angle));
    });
  });
}

function createCenterLines(halfExtent: number): Vector3[][] {
  return [
    [new Vector3(-halfExtent, 0, 0), new Vector3(halfExtent, 0, 0)],
    [new Vector3(0, 0, -halfExtent), new Vector3(0, 0, halfExtent)],
  ];
}
