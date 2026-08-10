import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

export const LIGHTING_TUNING = {
  sunIntensity: 1.9,
  fillIntensity: 0.3,
  shadowMapSize: 2048,
  shadowDarkness: 0.28,
  shadowBias: 0.0005,
  shadowNormalBias: 0.012,
  shadowOrthoScale: 0.04,
} as const;

export type SceneLighting = Readonly<{
  sun: DirectionalLight;
  fill: HemisphericLight;
  shadows: ShadowGenerator;
}>;

/**
 * Grounds the world with one bounded soft shadow map. The caller passes
 * an explicit caster list so transient VFX and the aim cursor never become
 * extra shadow work later in the scene lifecycle.
 */
export function createSceneLighting(
  scene: Scene,
  shadowReceiver: AbstractMesh,
  shadowCasters: readonly AbstractMesh[],
): SceneLighting {
  const sun = new DirectionalLight(
    "angle-light",
    new Vector3(-0.55, -1, 0.35),
    scene,
  );
  sun.position = new Vector3(12, 20, -10);
  sun.intensity = LIGHTING_TUNING.sunIntensity;
  sun.diffuse = Color3.FromHexString("#ffe9bd");
  sun.autoCalcShadowZBounds = true;
  // Arena walls already bound every moving caster, so calculate the optimal
  // projection once instead of scanning the same world meshes every frame.
  sun.autoUpdateExtends = false;
  sun.shadowOrthoScale = LIGHTING_TUNING.shadowOrthoScale;

  const fill = new HemisphericLight("fill-light", Vector3.Up(), scene);
  fill.intensity = LIGHTING_TUNING.fillIntensity;
  fill.diffuse = Color3.FromHexString("#afc7e6");
  fill.groundColor = Color3.FromHexString("#1b211d");

  const shadows = new ShadowGenerator(
    LIGHTING_TUNING.shadowMapSize,
    sun,
  );
  configureSceneShadows(shadows, shadowReceiver, shadowCasters);

  return { sun, fill, shadows };
}

export function configureSceneShadows(
  shadows: ShadowGenerator,
  shadowReceiver: AbstractMesh,
  shadowCasters: readonly AbstractMesh[],
): void {
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = LIGHTING_TUNING.shadowBias;
  shadows.normalBias = LIGHTING_TUNING.shadowNormalBias;
  shadows.setDarkness(LIGHTING_TUNING.shadowDarkness);

  shadowReceiver.receiveShadows = true;
  shadowCasters.forEach((mesh) => shadows.addShadowCaster(mesh));
}
