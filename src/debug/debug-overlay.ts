import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { GameEventBus, GameEvents } from "../core/events";
import type { ArmorFacetId } from "../tank/armor";
import type { TankEntity, TankFacet } from "../tank/tank";

const NORMAL_LENGTH = 1.25;
const MAX_PATH_POINTS = 512;

const LOCAL_OUTWARD_NORMAL: Readonly<Record<ArmorFacetId, Vector3>> = {
  FRONT: new Vector3(0, 0, -1),
  LEFT_SIDE: new Vector3(-1, 0, 0),
  RIGHT_SIDE: new Vector3(1, 0, 0),
  REAR: new Vector3(0, 0, 1),
  TURRET_FRONT: new Vector3(0, 0, -1),
  ROOF: new Vector3(0, 1, 0),
};

export type DebugOverlayElements = Readonly<{
  panel: HTMLElement | null;
  facets: HTMLElement | null;
  aim: HTMLElement | null;
  hit: HTMLElement | null;
}>;

type FacetVisual = {
  readonly tank: TankEntity;
  readonly facet: TankFacet;
  readonly line: LinesMesh;
  readonly tip: Mesh;
};

export class DebugOverlaySystem {
  private readonly visuals: FacetVisual[] = [];
  private readonly unsubscribe: Array<() => void> = [];
  private pathLine: LinesMesh | null = null;
  private pathPoints: Vector3[] = [];
  private deflectionMarkers: Mesh[] = [];
  private latestShellId: string | null = null;
  private _enabled = false;
  private _lastHitSummary = "No armor hit yet";
  private currentSpreadDegrees = 0;
  private lastShotSpreadDegrees = 0;
  private lastShotDeviationDegrees = 0;

  constructor(
    private readonly scene: Scene,
    events: GameEventBus,
    private readonly tanks: readonly TankEntity[],
    private readonly elements: DebugOverlayElements = {
      panel: null,
      facets: null,
      aim: null,
      hit: null,
    },
  ) {
    tanks.forEach((tank, tankIndex) => {
      const color = tankIndex === 0
        ? Color3.FromHexString("#62d9b2")
        : Color3.FromHexString("#e0bf63");
      Object.values(tank.facets).forEach((facet) => {
        const pose = readFacetPose(facet);
        const line = MeshBuilder.CreateLines(`debug-normal-${tank.root.name}-${facet.id}`, {
          points: [pose.origin, pose.origin.add(pose.normal.scale(NORMAL_LENGTH))],
          updatable: true,
        }, scene);
        line.color = color;
        line.isPickable = false;
        line.setEnabled(false);
        const tip = MeshBuilder.CreateSphere(`debug-normal-tip-${tank.root.name}-${facet.id}`, {
          diameter: 0.13,
          segments: 4,
        }, scene);
        tip.position.copyFrom(pose.origin.add(pose.normal.scale(NORMAL_LENGTH)));
        tip.isPickable = false;
        const tipMaterial = new StandardMaterial(`${tip.name}-material`, scene);
        tipMaterial.disableLighting = true;
        tipMaterial.emissiveColor = color;
        tip.material = tipMaterial;
        tip.setEnabled(false);
        this.visuals.push({ tank, facet, line, tip });
      });
    });

    this.unsubscribe.push(
      events.on("SHOT_FIRED", (event) => this.startPath(event)),
      events.on("SHELL_MOVED", (event) => this.extendPath(event)),
      events.on("RICOCHET", (event) => this.markDeflection(event)),
      events.on("HIT", (event) => this.showHit(event)),
    );
    if (this.elements.hit) this.elements.hit.textContent = this._lastHitSummary;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get lastHitSummary(): string {
    return this._lastHitSummary;
  }

  get lastPathPointCount(): number {
    return this.pathPoints.length;
  }

  get deflectionCount(): number {
    return this.deflectionMarkers.length;
  }

  setAimSpreadDegrees(spreadDegrees: number): void {
    this.currentSpreadDegrees = spreadDegrees;
  }

  toggle(): boolean {
    this.setEnabled(!this._enabled);
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (this.elements.panel) this.elements.panel.hidden = !enabled;
    this.visuals.forEach(({ line, tip }) => {
      line.setEnabled(enabled);
      tip.setEnabled(enabled);
    });
    this.pathLine?.setEnabled(enabled);
    this.deflectionMarkers.forEach((marker) => marker.setEnabled(enabled));
    if (enabled) this.update();
  }

  update(): void {
    if (!this._enabled) return;

    const facetText: string[] = [];
    let previousTankName: string | null = null;
    for (const { tank, facet, line, tip } of this.visuals) {
      const pose = readFacetPose(facet);
      const normalEnd = pose.origin.add(pose.normal.scale(NORMAL_LENGTH));
      MeshBuilder.CreateLines(line.name, {
        points: [pose.origin, normalEnd],
        instance: line,
      });
      tip.position.copyFrom(normalEnd);
      if (previousTankName !== tank.root.name) {
        if (facetText.length > 0) facetText.push("");
        facetText.push(tank.root.name);
        previousTankName = tank.root.name;
      }
      facetText.push(
        `  ${facet.id.padEnd(12)} ${formatSigned(pose.slopeDegrees)}°  ${facet.thickness.toFixed(0).padStart(3)} mm  n(${formatSigned(pose.normal.x)}, ${formatSigned(pose.normal.y)}, ${formatSigned(pose.normal.z)})`,
      );
    }
    if (this.elements.facets) this.elements.facets.textContent = facetText.join("\n");
    if (this.elements.aim) {
      this.elements.aim.textContent = [
        `CURRENT SPREAD  ${this.currentSpreadDegrees.toFixed(2)}°`,
        `LAST SHOT CONE ${this.lastShotSpreadDegrees.toFixed(2)}°`,
        `ACTUAL DEVIATION ${this.lastShotDeviationDegrees.toFixed(2)}°`,
      ].join("\n");
    }
  }

  dispose(): void {
    this.unsubscribe.forEach((off) => off());
    this.visuals.forEach(({ line, tip }) => {
      line.dispose();
      tip.material?.dispose();
      tip.dispose();
    });
    this.clearPath();
  }

  private startPath(event: GameEvents["SHOT_FIRED"]): void {
    this.clearPath();
    this.latestShellId = event.shellId;
    this.pathPoints = [toVector3(event.muzzlePosition)];
    this.lastShotSpreadDegrees = event.spreadDegrees;
    this.lastShotDeviationDegrees = event.deviationDegrees;
  }

  private extendPath(event: GameEvents["SHELL_MOVED"]): void {
    if (event.shellId !== this.latestShellId) return;
    this.pathPoints.push(toVector3(event.position));
    if (this.pathPoints.length > MAX_PATH_POINTS) this.pathPoints.splice(1, 1);
    this.updatePathLine();
  }

  private markDeflection(event: GameEvents["RICOCHET"]): void {
    if (event.shellId !== this.latestShellId) return;
    const marker = MeshBuilder.CreatePolyhedron("debug-deflection", {
      type: 1,
      size: 0.22,
    }, this.scene);
    marker.position.copyFrom(toVector3(event.point));
    marker.isPickable = false;
    const material = new StandardMaterial("debug-deflection-material", this.scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString("#e98a45");
    marker.material = material;
    marker.setEnabled(this._enabled);
    this.deflectionMarkers.push(marker);
  }

  private showHit(event: GameEvents["HIT"]): void {
    this._lastHitSummary = [
      `FACET        ${event.facetId}`,
      `IMPACT ANGLE ${event.impactAngleDegrees.toFixed(1)}°`,
      `ARMOR        ${event.nominalThickness.toFixed(0)} mm nominal`,
      `             ${event.effectiveThickness.toFixed(1)} mm effective`,
      `PENETRATION  ${event.penetration.toFixed(1)} mm`,
      `OUTCOME      ${event.outcome}`,
    ].join("\n");
    if (this.elements.hit) this.elements.hit.textContent = this._lastHitSummary;
  }

  private updatePathLine(): void {
    if (this.pathPoints.length < 2) return;
    const last = this.pathPoints.at(-1) as Vector3;
    const renderPoints = Array.from(
      { length: MAX_PATH_POINTS },
      (_, index) => (this.pathPoints[index] ?? last).clone(),
    );
    if (!this.pathLine) {
      this.pathLine = MeshBuilder.CreateLines("debug-last-shell-path", {
        points: renderPoints,
        updatable: true,
      }, this.scene);
      this.pathLine.color = Color3.FromHexString("#f0d36c");
      this.pathLine.isPickable = false;
      this.pathLine.setEnabled(this._enabled);
      return;
    }
    MeshBuilder.CreateLines(this.pathLine.name, {
      points: renderPoints,
      instance: this.pathLine,
    });
  }

  private clearPath(): void {
    this.pathLine?.dispose();
    this.pathLine = null;
    this.pathPoints = [];
    this.deflectionMarkers.forEach((marker) => {
      marker.material?.dispose();
      marker.dispose();
    });
    this.deflectionMarkers = [];
    this.latestShellId = null;
  }
}

export function readFacetPose(facet: TankFacet): Readonly<{
  origin: Vector3;
  normal: Vector3;
  slopeDegrees: number;
}> {
  facet.mesh.computeWorldMatrix(true);
  const normal = Vector3.TransformNormal(
    LOCAL_OUTWARD_NORMAL[facet.id],
    facet.mesh.getWorldMatrix(),
  ).normalize();
  const origin = facet.mesh.getBoundingInfo().boundingBox.centerWorld.clone();
  return {
    origin,
    normal,
    slopeDegrees: Math.asin(clamp(normal.y, -1, 1)) * 180 / Math.PI,
  };
}

function toVector3(vector: Readonly<{ x: number; y: number; z: number }>): Vector3 {
  return new Vector3(vector.x, vector.y, vector.z);
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
