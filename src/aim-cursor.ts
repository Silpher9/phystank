import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GreasedLineSimpleMaterial } from "@babylonjs/core/Materials/GreasedLine/greasedLineSimpleMaterial";
import { GreasedLineMeshMaterialType } from "@babylonjs/core/Materials/GreasedLine/greasedLineMaterialInterfaces";
import { CreateGreasedLine } from "@babylonjs/core/Meshes/Builders/greasedLineBuilder";
import type { GreasedLineBaseMesh } from "@babylonjs/core/Meshes/GreasedLine/greasedLineBaseMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export const AIM_CURSOR_TUNING = {
  elevation: 0.06,
  lineWidthPixels: 4,
  readyLineWidthPixels: 5,
  contrastWidthPixels: 8,
  centerHalfExtent: 0.13,
  contrastCenterHalfExtent: 0.19,
  targetHalfExtent: 0.06,
  contrastTargetHalfExtent: 0.1,
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

/** Places the spread ring on the horizontal projection of the actual barrel line. */
export function calculateAimCursorLoopPoint(
  origin: Point,
  aimPoint: Point,
  barrelDirection: Point,
): Vector3 {
  const targetDistance = Math.hypot(
    aimPoint.x - origin.x,
    aimPoint.z - origin.z,
  );
  const horizontalBarrelLength = Math.hypot(
    barrelDirection.x,
    barrelDirection.z,
  );
  if (
    !Number.isFinite(targetDistance) ||
    !Number.isFinite(horizontalBarrelLength) ||
    horizontalBarrelLength <= Number.EPSILON
  ) {
    return new Vector3(aimPoint.x, aimPoint.y, aimPoint.z);
  }

  return new Vector3(
    origin.x + barrelDirection.x / horizontalBarrelLength * targetDistance,
    aimPoint.y,
    origin.z + barrelDirection.z / horizontalBarrelLength * targetDistance,
  );
}

export class AimCursorSystem {
  private readonly root: TransformNode;
  private readonly targetRoot: TransformNode;
  private readonly spreadRing: GreasedLineBaseMesh;
  private readonly contrastRing: GreasedLineBaseMesh;
  private readonly center: GreasedLineBaseMesh;
  private readonly contrastCenter: GreasedLineBaseMesh;
  private readonly target: GreasedLineBaseMesh;
  private readonly contrastTarget: GreasedLineBaseMesh;
  private readonly spreadMaterial: GreasedLineSimpleMaterial;
  private readonly centerMaterial: GreasedLineSimpleMaterial;
  private readonly targetMaterial: GreasedLineSimpleMaterial;
  private readonly cursorMaterials: GreasedLineSimpleMaterial[];
  private _radius = 0;
  private _reachable = true;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode("aim-cursor", scene);
    this.targetRoot = new TransformNode("aim-cursor-target-root", scene);
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
    const contrastTarget = createCursorLine(
      "aim-cursor-contrast-target",
      createCenterLines(AIM_CURSOR_TUNING.contrastTargetHalfExtent),
      AIM_CURSOR_TUNING.contrastWidthPixels,
      AIM_CURSOR_COLORS.contrast,
      scene,
    );
    const target = createCursorLine(
      "aim-cursor-target",
      createCenterLines(AIM_CURSOR_TUNING.targetHalfExtent),
      AIM_CURSOR_TUNING.lineWidthPixels,
      AIM_CURSOR_COLORS.reachable,
      scene,
    );
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
  ): void {
    if (!aimPoint) {
      this.root.setEnabled(false);
      this.targetRoot.setEnabled(false);
      return;
    }

    const distance = Math.hypot(aimPoint.x - origin.x, aimPoint.z - origin.z);
    this._radius = calculateAimCursorRadius(distance, spreadDegrees);
    this._reachable = reachable;
    const loopPoint = calculateAimCursorLoopPoint(origin, aimPoint, barrelDirection);
    this.root.position.set(
      loopPoint.x,
      aimPoint.y + AIM_CURSOR_TUNING.elevation,
      loopPoint.z,
    );
    this.targetRoot.position.set(
      aimPoint.x,
      aimPoint.y + AIM_CURSOR_TUNING.elevation,
      aimPoint.z,
    );
    this.spreadRing.scaling.set(this._radius, 1, this._radius);
    this.contrastRing.scaling.set(this._radius, 1, this._radius);
    const cursorColor = reachable
      ? AIM_CURSOR_COLORS.reachable
      : AIM_CURSOR_COLORS.unreachable;
    const isReady = ready && reachable;
    this.spreadMaterial.setColor(cursorColor);
    this.centerMaterial.setColor(cursorColor);
    this.targetMaterial.setColor(cursorColor);
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
    this.root.setEnabled(true);
    this.targetRoot.setEnabled(true);
  }

  dispose(): void {
    this.root.dispose();
    this.targetRoot.dispose();
    this.cursorMaterials.forEach((material) => material.dispose());
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
