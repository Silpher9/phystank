import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export const AIM_CURSOR_TUNING = {
  elevation: 0.06,
  contrastGap: 0.055,
  centerHalfExtent: 0.13,
  contrastCenterHalfExtent: 0.19,
  arcDegrees: 54,
  arcSegments: 9,
  renderingGroupId: 2,
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

export class AimCursorSystem {
  private readonly root: TransformNode;
  private readonly spreadRing;
  private readonly contrastRing;
  private _radius = 0;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode("aim-cursor", scene);
    this.contrastRing = MeshBuilder.CreateLineSystem("aim-cursor-contrast-ring", {
      lines: createArcSegments(),
    }, scene);
    this.spreadRing = MeshBuilder.CreateLineSystem("aim-cursor-spread-ring", {
      lines: createArcSegments(),
    }, scene);
    const contrastCenter = MeshBuilder.CreateLineSystem("aim-cursor-contrast-center", {
      lines: createCenterLines(AIM_CURSOR_TUNING.contrastCenterHalfExtent),
    }, scene);
    const center = MeshBuilder.CreateLineSystem("aim-cursor-center", {
      lines: createCenterLines(AIM_CURSOR_TUNING.centerHalfExtent),
    }, scene);

    this.contrastRing.color = Color3.FromHexString("#252822");
    this.contrastRing.alpha = 0.95;
    this.spreadRing.color = Color3.FromHexString("#d9d4bd");
    this.spreadRing.alpha = 0.92;
    contrastCenter.color = Color3.FromHexString("#252822");
    contrastCenter.alpha = 0.95;
    center.color = Color3.FromHexString("#d9d4bd");
    center.alpha = 0.92;

    for (const mesh of [this.contrastRing, this.spreadRing, contrastCenter, center]) {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = AIM_CURSOR_TUNING.renderingGroupId;
    }
    this.contrastRing.position.y = -0.002;
    center.position.y = 0.004;
    this.scene.setRenderingAutoClearDepthStencil(
      AIM_CURSOR_TUNING.renderingGroupId,
      true,
      true,
      false,
    );
    this.root.setEnabled(false);
  }

  get radius(): number {
    return this._radius;
  }

  get visible(): boolean {
    return this.root.isEnabled();
  }

  update(origin: Point, aimPoint: Point | null, spreadDegrees: number): void {
    if (!aimPoint) {
      this.root.setEnabled(false);
      return;
    }

    const distance = Math.hypot(aimPoint.x - origin.x, aimPoint.z - origin.z);
    this._radius = calculateAimCursorRadius(distance, spreadDegrees);
    this.root.position.set(aimPoint.x, AIM_CURSOR_TUNING.elevation, aimPoint.z);
    this.spreadRing.scaling.set(this._radius, 1, this._radius);
    const contrastRadius = this._radius + AIM_CURSOR_TUNING.contrastGap;
    this.contrastRing.scaling.set(contrastRadius, 1, contrastRadius);
    this.root.setEnabled(true);
  }

  dispose(): void {
    this.root.dispose();
  }
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
