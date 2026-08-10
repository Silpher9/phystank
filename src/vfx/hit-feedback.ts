import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { HitOutcome, type Vector3 as EventVector3 } from "../core/ballistics";
import type { GameEventBus, GameEvents } from "../core/events";
import { ObjectHitOutcome } from "../core/impacts";

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
  lifetime: 0.025,
  axialLength: 0.68,
  intermediateOffset: 1.25,
  intermediateDelay: 0.006,
  intermediateLifetime: 0.055,
  secondaryOffset: 2.5,
  secondaryDelay: 0.016,
  secondaryLifetime: 0.04,
  emissivePeak: 1.35,
  sparkCount: 8,
  lightLifetime: 0.03,
  lightIntensity: 2.2,
  lightRange: 6,
  dustCount: 20,
  dustSkirtCount: 8,
  dustSkirtAlpha: 0.34,
  dustSkirtLifetimeSeconds: { minimum: 0.2, maximum: 0.4 },
  dustAlpha: 0.24,
  dustLifetimeSeconds: { minimum: 1.5, maximum: 2.6 },
  dustForwardReach: 4.5,
  dustLateralReach: 3.2,
} as const;

export const TRACER_TUNING = {
  radius: 0.035,
  impactHoldSeconds: 0.08,
  impactFadeSeconds: 0.18,
  ricochetHoldSeconds: 0.16,
  ricochetFadeSeconds: 0.22,
} as const;

export const IMPACT_VFX_TUNING = {
  shotShakeStrength: 0.025,
  shotShakeSeconds: 0.025,
  minimumImpactShakeStrength: 0.035,
  coreLifetimeSeconds: 0.055,
  debrisDelaySeconds: { minimum: 0.015, maximum: 0.045 },
  dustDelaySeconds: { minimum: 0.05, maximum: 0.12 },
  dustLifetimeSeconds: { minimum: 0.9, maximum: 1.45 },
  smokeDelaySeconds: { minimum: 0.09, maximum: 0.16 },
  smokeLifetimeSeconds: { minimum: 1.5, maximum: 2.3 },
  dustAlpha: 0.3,
  groundDebrisCount: 9,
  groundDustCount: 8,
} as const;

const GROUND_TARGET_ID = "arena-ground";

type MovingEffect = {
  mesh: Mesh;
  material: StandardMaterial;
  velocity: Vector3;
  gravity: number;
  lifetime: number;
  delay: number;
  age: number;
  growth: number;
  drag: number;
  initialScale: Vector3;
  emissiveStart?: Color3;
  emissiveEnd?: Color3;
};

type FlashLight = {
  light: PointLight;
  remaining: number;
};

type FeedbackOptions = Readonly<{
  random?: () => number;
}>;

export class HitFeedbackSystem {
  private readonly transients: MovingEffect[] = [];
  private readonly flashLights: FlashLight[] = [];
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

    for (let index = this.flashLights.length - 1; index >= 0; index--) {
      const flash = this.flashLights[index];
      flash.remaining -= deltaSeconds;
      if (flash.remaining > 0) continue;
      flash.light.dispose();
      this.flashLights.splice(index, 1);
    }

    for (let index = this.transients.length - 1; index >= 0; index--) {
      const effect = this.transients[index];
      const previousAge = effect.age;
      effect.age += deltaSeconds;
      if (effect.age >= effect.delay + effect.lifetime) {
        effect.mesh.dispose();
        effect.material.dispose();
        this.transients.splice(index, 1);
        continue;
      }

      const activeAge = effect.age - effect.delay;
      if (activeAge <= 0) continue;
      effect.mesh.setEnabled(true);
      const activeDelta = Math.min(deltaSeconds, activeAge, effect.age - previousAge);
      effect.mesh.position.addInPlace(effect.velocity.scale(activeDelta));
      effect.velocity.y -= effect.gravity * activeDelta;
      effect.velocity.scaleInPlace(Math.max(0, 1 - effect.drag * activeDelta));
      const progress = activeAge / effect.lifetime;
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
    this.flashLights.forEach((flash) => flash.light.dispose());
    this.tracers.forEach((tracer) => tracer.dispose());
    this.transients.length = 0;
    this.flashLights.length = 0;
    this.tracers.clear();
  }

  private onShotFired(event: GameEvents["SHOT_FIRED"]): void {
    const position = toVector3(event.muzzlePosition);
    const direction = toVector3(event.direction).normalize();
    this.tracers.set(event.shellId, new Tracer(this.scene, event.shellId, position));
    this.spawnFlash(position, direction);
    this.spawnMuzzleDust(
      new Vector3(position.x, 0.12, position.z),
      direction,
      SHOT_FLASH_TUNING.dustCount,
    );
    this.addShake(
      IMPACT_VFX_TUNING.shotShakeStrength,
      IMPACT_VFX_TUNING.shotShakeSeconds,
    );
    this.setCue("FIRE", "shot");
  }

  private onArmorHit(event: GameEvents["HIT"]): void {
    const point = toVector3(event.point);
    const normal = toVector3(event.normal).normalize();
    const profile = HIT_EFFECT_PROFILES[event.outcome];

    this.spawnImpactCore(point, normal, event.outcome);
    if (profile.mark) this.spawnImpactMark(point, normal);
    if (profile.debris !== "NONE") {
      this.spawnDebris(point, normal, profile.debris, profile.debrisCount);
    }
    this.spawnDust(point, normal, profile.dustCount, true);
    if (event.outcome === HitOutcome.PENETRATION) this.spawnSmoke(point, normal, 6);

    this.addShake(
      Math.max(
        IMPACT_VFX_TUNING.minimumImpactShakeStrength,
        event.outcome === HitOutcome.PENETRATION ? 0.08 : 0.045,
      ),
      0.08,
    );
    this.setCue(
      `${profile.hud} · ${event.facetId} · ${Math.round(event.impactAngleDegrees)}°`,
      event.outcome.toLowerCase(),
    );
  }

  private onObjectHit(event: GameEvents["OBJECT_HIT"]): void {
    const point = toVector3(event.point);
    const normal = toVector3(event.normal).normalize();

    this.spawnImpactCore(point, normal, event.outcome);
    if (event.targetId === GROUND_TARGET_ID) {
      this.spawnDebris(
        point,
        normal,
        "OUTWARD",
        IMPACT_VFX_TUNING.groundDebrisCount,
        Color3.FromHexString("#554838"),
      );
      this.spawnDust(
        point,
        normal,
        IMPACT_VFX_TUNING.groundDustCount,
        true,
      );
      this.setCue("GROUND IMPACT", "ground");
    } else if (event.outcome === ObjectHitOutcome.DESTROYED) {
      this.spawnDebris(point, normal, "OUTWARD", 10, Color3.FromHexString("#6f4d2f"));
      this.spawnDust(point, normal, 6, true);
      this.setCue("COVER DESTROYED", "destroyed");
    } else if (event.outcome === ObjectHitOutcome.STOPPED) {
      this.spawnDebris(point, normal, "DROP", 5, Color3.FromHexString("#5d5b52"));
      this.spawnDust(point, normal, 5, true);
      this.setCue("HARD IMPACT", "shatter");
    } else {
      this.spawnDust(point, normal, 2, true);
      this.setCue("RICOCHET", "ricochet");
    }
    this.addShake(IMPACT_VFX_TUNING.minimumImpactShakeStrength, 0.06);
  }

  private onRicochet(event: GameEvents["RICOCHET"]): void {
    const point = toVector3(event.point);
    const outgoing = toVector3(event.outgoing).normalize();
    this.tracers.get(event.shellId)?.markRicochet(point);
    this.spawnSparks(point, outgoing, 10);
    this.setCue("RICOCHET", "ricochet");
  }

  private spawnFlash(point: Vector3, direction: Vector3): void {
    const glowColor = new Color3(0.92, 0.24, 0.1);
    const glow = MeshBuilder.CreateSphere("muzzle-flash-glow", {
      diameter: 0.2,
      segments: 4,
    }, this.scene);
    glow.position.copyFrom(point.add(direction.scale(0.04)));
    this.addTransient(glow, {
      color: glowColor,
      emissive: true,
      emissiveEnd: glowColor.scale(0.08),
      velocity: direction.scale(0.1),
      lifetime: SHOT_FLASH_TUNING.lifetime,
      gravity: 0,
      growth: 0.2,
    });

    const primaryColor = new Color3(
      SHOT_FLASH_TUNING.emissivePeak,
      1.15,
      0.95,
    );
    const core = MeshBuilder.CreateBox("muzzle-flash-core", {
      width: 0.13,
      height: 0.13,
      depth: SHOT_FLASH_TUNING.axialLength,
    }, this.scene);
    core.position.copyFrom(point.add(direction.scale(SHOT_FLASH_TUNING.axialLength * 0.35)));
    core.rotationQuaternion = lookAlong(direction);
    this.addTransient(core, {
      color: primaryColor,
      emissive: true,
      velocity: direction.scale(0.65),
      lifetime: SHOT_FLASH_TUNING.lifetime,
      gravity: 0,
      growth: 0.2,
    });

    const intermediateColor = new Color3(1.08, 0.34, 0.14);
    const intermediate = MeshBuilder.CreateCylinder("muzzle-flash-intermediate", {
      height: 0.16,
      diameterTop: 0.58,
      diameterBottom: 0.82,
      tessellation: 10,
    }, this.scene);
    intermediate.position.copyFrom(
      point.add(direction.scale(SHOT_FLASH_TUNING.intermediateOffset)),
    );
    intermediate.rotationQuaternion = alignYAxis(direction);
    this.addTransient(intermediate, {
      color: intermediateColor,
      emissive: true,
      emissiveEnd: intermediateColor.scale(0.12),
      velocity: direction.scale(0.42),
      lifetime: SHOT_FLASH_TUNING.intermediateLifetime,
      delay: SHOT_FLASH_TUNING.intermediateDelay,
      gravity: 0,
      growth: 0.38,
    });

    const secondaryColor = new Color3(1.16, 0.58, 0.18);
    const burst = MeshBuilder.CreatePolyhedron("muzzle-flash-burst", {
      type: 1,
      size: 0.65,
    }, this.scene);
    burst.position.copyFrom(point.add(direction.scale(SHOT_FLASH_TUNING.secondaryOffset)));
    burst.rotationQuaternion = lookAlong(direction);
    burst.scaling.set(1.05, 0.82, 1.6);
    this.addTransient(burst, {
      color: secondaryColor,
      emissive: true,
      emissiveEnd: secondaryColor.scale(0.1),
      velocity: direction.scale(0.55),
      lifetime: SHOT_FLASH_TUNING.secondaryLifetime,
      delay: SHOT_FLASH_TUNING.secondaryDelay,
      gravity: 0,
      growth: 0.5,
    });

    this.spawnMuzzleSparks(point, direction, SHOT_FLASH_TUNING.sparkCount);

    const light = new PointLight(
      "muzzle-flash-light",
      point.add(direction.scale(SHOT_FLASH_TUNING.secondaryOffset)),
      this.scene,
    );
    light.diffuse = new Color3(1, 0.48, 0.16);
    light.specular = new Color3(0.5, 0.16, 0.04);
    light.intensity = SHOT_FLASH_TUNING.lightIntensity;
    light.range = SHOT_FLASH_TUNING.lightRange;
    this.flashLights.push({
      light,
      remaining: SHOT_FLASH_TUNING.lightLifetime,
    });
  }

  private spawnMuzzleSparks(
    point: Vector3,
    direction: Vector3,
    count: number,
  ): void {
    const start = new Color3(1.2, 0.62, 0.2);
    const end = Color3.FromHexString("#3b160b");
    for (let index = 0; index < count; index++) {
      const velocity = this.spread(direction, 0.28).scale(this.range(5, 9));
      const mesh = MeshBuilder.CreateBox("muzzle-spark", {
        width: 0.035,
        height: 0.035,
        depth: 0.24,
      }, this.scene);
      mesh.position.copyFrom(point.add(direction.scale(1.9)));
      mesh.rotationQuaternion = lookAlong(velocity);
      this.addTransient(mesh, {
        color: start,
        emissive: true,
        emissiveEnd: end,
        velocity,
        lifetime: this.range(0.14, 0.24),
        gravity: 2,
        growth: -0.45,
      });
    }
  }

  private spawnMuzzleDust(
    point: Vector3,
    direction: Vector3,
    count: number,
  ): void {
    const forward = new Vector3(direction.x, 0, direction.z);
    if (forward.lengthSquared() < 1e-8) forward.copyFromFloats(0, 0, -1);
    forward.normalize();
    const lateral = Vector3.Cross(Vector3.Up(), forward).normalize();

    for (let index = 0; index < count; index++) {
      const isSkirt = index < SHOT_FLASH_TUNING.dustSkirtCount;
      const forwardOffset = this.range(
        0.2,
        SHOT_FLASH_TUNING.dustForwardReach * (isSkirt ? 0.65 : 0.85),
      );
      const lateralOffset = this.range(
        -SHOT_FLASH_TUNING.dustLateralReach * (isSkirt ? 1 : 0.85),
        SHOT_FLASH_TUNING.dustLateralReach * (isSkirt ? 1 : 0.85),
      );
      const mesh = MeshBuilder.CreateSphere(
        isSkirt ? "muzzle-dust-skirt" : "muzzle-dust-fine",
        {
          diameter: isSkirt
            ? this.range(0.18, 0.34)
            : this.range(0.38, 0.68),
          segments: 4,
        },
        this.scene,
      );
      mesh.position.copyFrom(
        point
          .add(forward.scale(forwardOffset))
          .add(lateral.scale(lateralOffset))
          .add(Vector3.Up().scale(this.range(0, 0.12))),
      );
      mesh.rotationQuaternion = lookAlong(forward);
      mesh.scaling.set(
        this.range(1.25, isSkirt ? 2 : 1.8),
        this.range(0.22, isSkirt ? 0.38 : 0.48),
        1,
      );
      const velocity = forward
        .scale(isSkirt ? this.range(2.2, 4.2) : this.range(0.45, 1.35))
        .add(lateral.scale(
          isSkirt
            ? this.range(-3.2, 3.2)
            : this.range(-1.35, 1.35),
        ))
        .add(Vector3.Up().scale(
          isSkirt
            ? this.range(0.06, 0.2)
            : this.range(0.08, 0.32),
        ));
      this.addTransient(mesh, {
        color: Color3.Lerp(
          Color3.FromHexString("#514b41"),
          Color3.FromHexString("#6d6454"),
          this.random(),
        ),
        alpha: isSkirt
          ? SHOT_FLASH_TUNING.dustSkirtAlpha
          : SHOT_FLASH_TUNING.dustAlpha,
        velocity,
        lifetime: isSkirt
          ? this.range(
            SHOT_FLASH_TUNING.dustSkirtLifetimeSeconds.minimum,
            SHOT_FLASH_TUNING.dustSkirtLifetimeSeconds.maximum,
          )
          : this.range(
            SHOT_FLASH_TUNING.dustLifetimeSeconds.minimum,
            SHOT_FLASH_TUNING.dustLifetimeSeconds.maximum,
          ),
        gravity: isSkirt ? 0.8 : 0.12,
        growth: isSkirt ? 1.4 : 3.2,
        drag: isSkirt ? 4.5 : 1.1,
      });
    }
  }

  private spawnImpactCore(
    point: Vector3,
    normal: Vector3,
    outcome: HitOutcome | ObjectHitOutcome,
  ): void {
    const color = outcome === HitOutcome.PENETRATION
      ? Color3.FromHexString("#c1793f")
      : outcome === HitOutcome.RICOCHET || outcome === ObjectHitOutcome.RICOCHET
        ? Color3.FromHexString("#d0924e")
        : Color3.FromHexString("#8b7758");
    const mesh = MeshBuilder.CreateSphere("impact-core", {
      diameter: this.range(0.15, 0.22),
      segments: 4,
    }, this.scene);
    mesh.position.copyFrom(point.add(normal.scale(0.075)));
    this.addTransient(mesh, {
      color,
      emissive: true,
      emissiveEnd: color.scale(0.18),
      velocity: normal.scale(0.08),
      lifetime: IMPACT_VFX_TUNING.coreLifetimeSeconds,
      gravity: 0,
      growth: 0.8,
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
        delay: this.range(
          IMPACT_VFX_TUNING.debrisDelaySeconds.minimum,
          IMPACT_VFX_TUNING.debrisDelaySeconds.maximum,
        ),
        gravity: 7,
        growth: -0.15,
      });
    }
  }

  private spawnDust(
    point: Vector3,
    direction: Vector3,
    count: number,
    lingering = false,
  ): void {
    const surfaceOffset = direction.lengthSquared() > 0
      ? direction.normalizeToNew().scale(0.07)
      : Vector3.Zero();
    for (let index = 0; index < count; index++) {
      const velocity = this.spread(direction.add(Vector3.Up().scale(0.4)), 0.95)
        .scale(this.range(0.25, 1.1));
      const mesh = MeshBuilder.CreateSphere("impact-dust", { diameter: this.range(0.2, 0.38), segments: 4 }, this.scene);
      mesh.position.copyFrom(point.add(surfaceOffset).add(this.randomVector(0.08)));
      this.addTransient(mesh, {
        color: Color3.Lerp(
          Color3.FromHexString("#575044"),
          Color3.FromHexString("#756b58"),
          this.random(),
        ),
        alpha: IMPACT_VFX_TUNING.dustAlpha,
        velocity,
        lifetime: lingering
          ? this.range(
            IMPACT_VFX_TUNING.dustLifetimeSeconds.minimum,
            IMPACT_VFX_TUNING.dustLifetimeSeconds.maximum,
          )
          : this.range(0.45, 0.8),
        delay: lingering
          ? this.range(
            IMPACT_VFX_TUNING.dustDelaySeconds.minimum,
            IMPACT_VFX_TUNING.dustDelaySeconds.maximum,
          )
          : 0,
        gravity: 0.25,
        growth: lingering ? 3.1 : 2.6,
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
        lifetime: this.range(
          IMPACT_VFX_TUNING.smokeLifetimeSeconds.minimum,
          IMPACT_VFX_TUNING.smokeLifetimeSeconds.maximum,
        ),
        delay: this.range(
          IMPACT_VFX_TUNING.smokeDelaySeconds.minimum,
          IMPACT_VFX_TUNING.smokeDelaySeconds.maximum,
        ),
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
      delay?: number;
      gravity: number;
      growth: number;
      drag?: number;
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
    const delay = options.delay ?? 0;
    if (delay > 0) mesh.setEnabled(false);
    this.transients.push({
      mesh,
      material,
      velocity: options.velocity,
      gravity: options.gravity,
      lifetime: options.lifetime,
      delay,
      age: 0,
      growth: options.growth,
      drag: options.drag ?? 0,
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

/** Records the whole simulated path so even a one-frame flight leaves a readable shot line. */
class Tracer {
  private readonly points: Vector3[];
  private mesh: Mesh | null = null;
  private readonly material: StandardMaterial;
  private readonly name: string;
  private isRicochet = false;
  private holdRemaining: number | null = null;
  private fadeRemaining: number | null = null;

  constructor(
    private readonly scene: Scene,
    shellId: string,
    position: Vector3,
  ) {
    this.name = `tracer-${shellId}`;
    this.points = [position.clone()];
    this.material = new StandardMaterial(`tracer-${shellId}-material`, scene);
    this.material.disableLighting = true;
    this.material.diffuseColor = Color3.FromHexString("#6f3a21");
    this.material.emissiveColor = Color3.FromHexString("#9a572d");
  }

  move(position: Vector3): void {
    const last = this.points[this.points.length - 1];
    if (Vector3.DistanceSquared(last, position) < 1e-8) return;
    this.points.push(position.clone());
    this.rebuild();
  }

  markRicochet(point: Vector3): void {
    this.move(point);
    this.isRicochet = true;
    this.material.diffuseColor = Color3.FromHexString("#a34c20");
    this.material.emissiveColor = Color3.FromHexString("#ff9a3c");
  }

  private rebuild(): void {
    this.mesh?.dispose(false, false);
    this.mesh = MeshBuilder.CreateTube(this.name, {
      path: this.points,
      radius: TRACER_TUNING.radius,
      tessellation: 4,
    }, this.scene);
    this.mesh.isPickable = false;
    this.mesh.material = this.material;
  }

  finish(): void {
    this.holdRemaining = this.isRicochet
      ? TRACER_TUNING.ricochetHoldSeconds
      : TRACER_TUNING.impactHoldSeconds;
    this.fadeRemaining = this.isRicochet
      ? TRACER_TUNING.ricochetFadeSeconds
      : TRACER_TUNING.impactFadeSeconds;
  }

  update(deltaSeconds: number): boolean {
    if (this.holdRemaining === null || this.fadeRemaining === null) return true;
    const fadeDelta = Math.max(0, deltaSeconds - this.holdRemaining);
    this.holdRemaining = Math.max(0, this.holdRemaining - deltaSeconds);
    if (this.holdRemaining > 0) return true;
    const fadeDuration = this.isRicochet
      ? TRACER_TUNING.ricochetFadeSeconds
      : TRACER_TUNING.impactFadeSeconds;
    this.fadeRemaining = Math.max(0, this.fadeRemaining - fadeDelta);
    if (this.mesh) this.mesh.visibility = this.fadeRemaining / fadeDuration;
    if (this.fadeRemaining > 0) return true;
    this.dispose();
    return false;
  }

  dispose(): void {
    this.mesh?.dispose(false, false);
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

function alignYAxis(direction: Vector3): Quaternion {
  const normalized = direction.normalizeToNew();
  const dot = Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), normalized)));
  if (dot > 0.999999) return Quaternion.Identity();
  if (dot < -0.999999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  return Quaternion.RotationAxis(
    Vector3.Cross(Vector3.Up(), normalized).normalize(),
    Math.acos(dot),
  );
}
