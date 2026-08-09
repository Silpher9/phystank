import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { HitOutcome, type Vector3 as EventVector3 } from "../core/ballistics";
import type { GameEventBus, GameEvents } from "../core/events";
import { HitCategory, ObjectHitOutcome } from "../core/impacts";

type DebrisMotion = "INWARD" | "DROP" | "OUTWARD" | "NONE";

export const HIT_EFFECT_PROFILES = {
  [HitOutcome.PENETRATION]: {
    hud: "PENETRATED",
    mark: true,
    debris: "INWARD" as DebrisMotion,
    debrisCount: 7,
    dustCount: 2,
  },
  [HitOutcome.RICOCHET]: {
    hud: "RICOCHET",
    mark: false,
    debris: "NONE" as DebrisMotion,
    debrisCount: 0,
    dustCount: 2,
  },
  [HitOutcome.SHATTER]: {
    hud: "SHATTERED",
    mark: false,
    debris: "DROP" as DebrisMotion,
    debrisCount: 8,
    dustCount: 5,
  },
} as const;

export const SHOT_FLASH_TUNING = {
  lifetime: 0.05,
  axialLength: 0.68,
  emissivePeak: 1.35,
  dustCount: 7,
} as const;

type MovingEffect = {
  mesh: Mesh;
  material: StandardMaterial;
  velocity: Vector3;
  gravity: number;
  lifetime: number;
  age: number;
  growth: number;
  initialScale: Vector3;
  emissiveStart?: Color3;
  emissiveEnd?: Color3;
};

type FeedbackOptions = Readonly<{
  random?: () => number;
}>;

export class HitFeedbackSystem {
  private readonly transients: MovingEffect[] = [];
  private readonly tracers = new Map<string, Tracer>();
  private readonly unsubscribe: Array<() => void> = [];
  private readonly random: () => number;
  private hudRemaining = 0;
  private shakeRemaining = 0;
  private shakeStrength = 0;
  private _lastCue: string | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly camera: ArcRotateCamera,
    events: GameEventBus,
    private readonly hud: HTMLElement | null,
    options: FeedbackOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.unsubscribe.push(
      events.on("SHOT_FIRED", (event) => this.onShotFired(event)),
      events.on("SHELL_MOVED", (event) => this.tracers.get(event.shellId)?.move(toVector3(event.position))),
      events.on("SHELL_DESPAWNED", (event) => this.tracers.get(event.shellId)?.finish()),
      events.on("HIT", (event) => this.onArmorHit(event)),
      events.on("OBJECT_HIT", (event) => this.onObjectHit(event)),
      events.on("RICOCHET", (event) => this.onRicochet(event)),
    );
  }

  get lastCue(): string | null {
    return this._lastCue;
  }

  get activeTracerCount(): number {
    return this.tracers.size;
  }

  update(deltaSeconds: number): void {
    this.updateHud(deltaSeconds);
    this.updateShake(deltaSeconds);

    for (let index = this.transients.length - 1; index >= 0; index--) {
      const effect = this.transients[index];
      effect.age += deltaSeconds;
      if (effect.age >= effect.lifetime) {
        effect.mesh.dispose();
        effect.material.dispose();
        this.transients.splice(index, 1);
        continue;
      }

      effect.mesh.position.addInPlace(effect.velocity.scale(deltaSeconds));
      effect.velocity.y -= effect.gravity * deltaSeconds;
      const progress = effect.age / effect.lifetime;
      effect.mesh.visibility = Math.min(1, (1 - progress) * 2.5);
      effect.mesh.scaling.copyFrom(effect.initialScale.scale(1 + effect.growth * progress));
      if (effect.emissiveStart && effect.emissiveEnd) {
        effect.material.emissiveColor = Color3.Lerp(
          effect.emissiveStart,
          effect.emissiveEnd,
          progress,
        );
      }
    }

    for (const [shellId, tracer] of this.tracers) {
      if (!tracer.update(deltaSeconds)) this.tracers.delete(shellId);
    }
  }

  dispose(): void {
    this.unsubscribe.forEach((off) => off());
    this.transients.forEach((effect) => {
      effect.mesh.dispose();
      effect.material.dispose();
    });
    this.tracers.forEach((tracer) => tracer.dispose());
    this.transients.length = 0;
    this.tracers.clear();
  }

  private onShotFired(event: GameEvents["SHOT_FIRED"]): void {
    const position = toVector3(event.muzzlePosition);
    const direction = toVector3(event.direction).normalize();
    this.tracers.set(event.shellId, new Tracer(this.scene, event.shellId, position, direction));
    this.spawnFlash(position, direction);
    this.spawnDust(
      new Vector3(position.x, 0.12, position.z),
      direction,
      SHOT_FLASH_TUNING.dustCount,
    );
    this.addShake(0.11, 0.09);
    this.setCue("FIRE", "shot");
  }

  private onArmorHit(event: GameEvents["HIT"]): void {
    const point = toVector3(event.point);
    const normal = toVector3(event.normal).normalize();
    const profile = HIT_EFFECT_PROFILES[event.outcome];

    if (profile.mark) this.spawnImpactMark(point, normal);
    if (profile.debris !== "NONE") {
      this.spawnDebris(point, normal, profile.debris, profile.debrisCount);
    }
    this.spawnDust(point, normal, profile.dustCount);
    if (event.outcome === HitOutcome.PENETRATION) this.spawnSmoke(point, normal, 6);

    this.addShake(event.outcome === HitOutcome.PENETRATION ? 0.08 : 0.045, 0.08);
    this.setCue(
      `${profile.hud} · ${event.facetId} · ${Math.round(event.impactAngleDegrees)}°`,
      event.outcome.toLowerCase(),
    );
  }

  private onObjectHit(event: GameEvents["OBJECT_HIT"]): void {
    const point = toVector3(event.point);
    const normal = toVector3(event.normal).normalize();

    if (event.outcome === ObjectHitOutcome.DESTROYED) {
      this.spawnDebris(point, normal, "OUTWARD", 10, Color3.FromHexString("#6f4d2f"));
      this.spawnDust(point, normal, 6);
      this.setCue("COVER DESTROYED", "destroyed");
    } else if (event.outcome === ObjectHitOutcome.STOPPED) {
      this.spawnDebris(point, normal, "DROP", 5, Color3.FromHexString("#5d5b52"));
      this.spawnDust(point, normal, 5);
      this.setCue("HARD IMPACT", "shatter");
    } else {
      this.spawnDust(point, normal, 2);
      this.setCue("RICOCHET", "ricochet");
    }
    this.addShake(0.035, 0.06);
  }

  private onRicochet(event: GameEvents["RICOCHET"]): void {
    const point = toVector3(event.point);
    const outgoing = toVector3(event.outgoing).normalize();
    this.spawnSparks(point, outgoing, 10);
    this.setCue("RICOCHET", "ricochet");
  }

  private spawnFlash(point: Vector3, direction: Vector3): void {
    const color = new Color3(SHOT_FLASH_TUNING.emissivePeak, 0.72, 0.26);
    const core = MeshBuilder.CreateBox("muzzle-flash-core", {
      width: 0.13,
      height: 0.13,
      depth: SHOT_FLASH_TUNING.axialLength,
    }, this.scene);
    core.position.copyFrom(point.add(direction.scale(SHOT_FLASH_TUNING.axialLength * 0.35)));
    core.rotationQuaternion = lookAlong(direction);
    this.addTransient(core, {
      color,
      emissive: true,
      velocity: direction.scale(0.65),
      lifetime: SHOT_FLASH_TUNING.lifetime,
      gravity: 0,
      growth: 0.2,
    });

    const burst = MeshBuilder.CreatePolyhedron("muzzle-flash-burst", {
      type: 1,
      size: 0.28,
    }, this.scene);
    burst.position.copyFrom(point.add(direction.scale(0.08)));
    this.addTransient(burst, {
      color,
      emissive: true,
      velocity: direction.scale(0.25),
      lifetime: SHOT_FLASH_TUNING.lifetime,
      gravity: 0,
      growth: 0.3,
    });
  }

  private spawnSparks(point: Vector3, direction: Vector3, count: number): void {
    const start = Color3.FromHexString("#b96b32");
    const end = Color3.FromHexString("#35150e");
    for (let index = 0; index < count; index++) {
      const velocity = this.spread(direction, 0.32).scale(this.range(3.2, 6.2));
      const mesh = MeshBuilder.CreateBox("ricochet-spark", { width: 0.045, height: 0.045, depth: 0.32 }, this.scene);
      mesh.position.copyFrom(point.add(direction.scale(0.035)));
      mesh.rotationQuaternion = lookAlong(velocity);
      this.addTransient(mesh, {
        color: start,
        emissive: true,
        emissiveEnd: end,
        velocity,
        lifetime: this.range(0.3, 0.5),
        gravity: 8,
        growth: -0.45,
      });
    }
  }

  private spawnDebris(
    point: Vector3,
    normal: Vector3,
    motion: Exclude<DebrisMotion, "NONE">,
    count: number,
    color = Color3.FromHexString("#3d3a31"),
  ): void {
    const baseDirection = motion === "INWARD"
      ? normal.negate()
      : motion === "DROP"
        ? Vector3.Down()
        : normal;
    for (let index = 0; index < count; index++) {
      const velocity = this.spread(baseDirection, motion === "DROP" ? 0.7 : 0.55)
        .scale(this.range(0.8, motion === "INWARD" ? 3.6 : 2.5));
      const mesh = MeshBuilder.CreateBox("impact-fragment", { size: this.range(0.08, 0.15) }, this.scene);
      mesh.position.copyFrom(point.add(normal.scale(0.055)));
      mesh.rotation.set(this.range(0, Math.PI), this.range(0, Math.PI), this.range(0, Math.PI));
      this.addTransient(mesh, {
        color,
        velocity,
        lifetime: this.range(0.35, 0.65),
        gravity: 7,
        growth: -0.15,
      });
    }
  }

  private spawnDust(point: Vector3, direction: Vector3, count: number): void {
    const surfaceOffset = direction.lengthSquared() > 0
      ? direction.normalizeToNew().scale(0.07)
      : Vector3.Zero();
    for (let index = 0; index < count; index++) {
      const velocity = this.spread(direction.add(Vector3.Up().scale(0.4)), 0.95)
        .scale(this.range(0.25, 1.1));
      const mesh = MeshBuilder.CreateSphere("impact-dust", { diameter: this.range(0.2, 0.38), segments: 4 }, this.scene);
      mesh.position.copyFrom(point.add(surfaceOffset).add(this.randomVector(0.08)));
      this.addTransient(mesh, {
        color: Color3.FromHexString("#736957"),
        alpha: 0.36,
        velocity,
        lifetime: this.range(0.45, 0.8),
        gravity: 0.25,
        growth: 2.6,
      });
    }
  }

  private spawnSmoke(point: Vector3, normal: Vector3, count: number): void {
    for (let index = 0; index < count; index++) {
      const mesh = MeshBuilder.CreateSphere("penetration-smoke", { diameter: this.range(0.24, 0.42), segments: 4 }, this.scene);
      mesh.position.copyFrom(point.add(normal.scale(0.09)).add(this.randomVector(0.08)));
      this.addTransient(mesh, {
        color: Color3.FromHexString("#3d3c38"),
        alpha: 0.38,
        velocity: normal.scale(this.range(0.12, 0.35)).add(new Vector3(this.range(-0.12, 0.12), this.range(0.35, 0.8), this.range(-0.12, 0.12))),
        lifetime: this.range(0.8, 1.2),
        gravity: 0,
        growth: 2.5,
      });
    }
  }

  private spawnImpactMark(point: Vector3, normal: Vector3): void {
    const mesh = MeshBuilder.CreateDisc("penetration-mark", {
      radius: 0.18,
      tessellation: 12,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    mesh.position.copyFrom(point.add(normal.scale(0.012)));
    mesh.rotationQuaternion = lookAlong(normal);
    this.addTransient(mesh, {
      color: Color3.FromHexString("#090a08"),
      velocity: Vector3.Zero(),
      lifetime: 10,
      gravity: 0,
      growth: 0,
    });
  }

  private addTransient(
    mesh: Mesh,
    options: Readonly<{
      color: Color3;
      alpha?: number;
      emissive?: boolean;
      emissiveEnd?: Color3;
      velocity: Vector3;
      lifetime: number;
      gravity: number;
      growth: number;
    }>,
  ): void {
    const material = new StandardMaterial(`${mesh.name}-material`, this.scene);
    material.diffuseColor = options.color;
    material.specularColor = Color3.Black();
    material.alpha = options.alpha ?? 1;
    if (options.emissive) {
      material.disableLighting = true;
      material.emissiveColor = options.color;
    }
    mesh.material = material;
    mesh.isPickable = false;
    this.transients.push({
      mesh,
      material,
      velocity: options.velocity,
      gravity: options.gravity,
      lifetime: options.lifetime,
      age: 0,
      growth: options.growth,
      initialScale: mesh.scaling.clone(),
      emissiveStart: options.emissive ? options.color : undefined,
      emissiveEnd: options.emissiveEnd,
    });
  }

  private addShake(strength: number, duration: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeRemaining = Math.max(this.shakeRemaining, duration);
  }

  private updateShake(deltaSeconds: number): void {
    if (this.shakeRemaining <= 0) return;
    const strength = this.shakeStrength * Math.min(1, this.shakeRemaining / 0.05);
    this.camera.target.addInPlace(new Vector3(
      this.range(-strength, strength),
      this.range(-strength * 0.35, strength * 0.35),
      this.range(-strength, strength),
    ));
    this.shakeRemaining = Math.max(0, this.shakeRemaining - deltaSeconds);
    if (this.shakeRemaining === 0) this.shakeStrength = 0;
  }

  private setCue(text: string, cue: string): void {
    this._lastCue = cue;
    this.hudRemaining = 1.35;
    if (!this.hud) return;
    this.hud.textContent = text;
    this.hud.dataset.cue = cue;
    this.hud.classList.add("visible");
  }

  private updateHud(deltaSeconds: number): void {
    if (this.hudRemaining <= 0) return;
    this.hudRemaining = Math.max(0, this.hudRemaining - deltaSeconds);
    if (this.hudRemaining === 0) this.hud?.classList.remove("visible");
  }

  private spread(direction: Vector3, amount: number): Vector3 {
    return direction.normalizeToNew().add(this.randomVector(amount)).normalize();
  }

  private randomVector(amount: number): Vector3 {
    return new Vector3(
      this.range(-amount, amount),
      this.range(-amount, amount),
      this.range(-amount, amount),
    );
  }

  private range(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.random();
  }
}

class Tracer {
  private readonly points: Vector3[];
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private fadeRemaining: number | null = null;

  constructor(scene: Scene, shellId: string, position: Vector3, direction: Vector3) {
    const pointCount = 12;
    this.points = Array.from({ length: pointCount }, (_, index) => (
      position.subtract(direction.scale((pointCount - 1 - index) * 0.065))
    ));
    this.mesh = MeshBuilder.CreateTube(`tracer-${shellId}`, {
      path: this.points,
      radius: 0.035,
      tessellation: 4,
      updatable: true,
    }, scene);
    this.mesh.isPickable = false;
    this.material = new StandardMaterial(`tracer-${shellId}-material`, scene);
    this.material.disableLighting = true;
    this.material.diffuseColor = Color3.FromHexString("#6f3a21");
    this.material.emissiveColor = Color3.FromHexString("#9a572d");
    this.mesh.material = this.material;
  }

  move(position: Vector3): void {
    this.points.shift();
    this.points.push(position.clone());
    MeshBuilder.CreateTube(this.mesh.name, {
      path: this.points,
      instance: this.mesh,
    });
  }

  finish(): void {
    this.fadeRemaining = 0.18;
  }

  update(deltaSeconds: number): boolean {
    if (this.fadeRemaining === null) return true;
    this.fadeRemaining = Math.max(0, this.fadeRemaining - deltaSeconds);
    this.mesh.visibility = this.fadeRemaining / 0.18;
    if (this.fadeRemaining > 0) return true;
    this.dispose();
    return false;
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
  }
}

function toVector3(vector: EventVector3): Vector3 {
  return new Vector3(vector.x, vector.y, vector.z);
}

function lookAlong(direction: Vector3): Quaternion {
  const normalized = direction.normalizeToNew();
  const up = Math.abs(Vector3.Dot(normalized, Vector3.Up())) > 0.95
    ? Vector3.Right()
    : Vector3.Up();
  return Quaternion.FromLookDirectionLH(normalized, up);
}
