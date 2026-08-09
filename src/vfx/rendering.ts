import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { Scene } from "@babylonjs/core/scene";

export const RENDERING_TUNING = {
  glowIntensity: 0.22,
  glowBlurKernel: 24,
  bloomThreshold: 1.15,
  bloomWeight: 0.12,
  bloomKernel: 32,
  exposure: 0.78,
  contrast: 1.12,
} as const;

export type RenderingStack = Readonly<{
  glow: GlowLayer;
  pipeline: DefaultRenderingPipeline;
}>;

/** Global baseline. Individual effects are tuned only after this is active. */
export function createRenderingStack(
  scene: Scene,
  camera: ArcRotateCamera,
): RenderingStack {
  const glow = new GlowLayer("subtle-emissive-glow", scene, {
    blurKernelSize: RENDERING_TUNING.glowBlurKernel,
  });
  glow.intensity = RENDERING_TUNING.glowIntensity;

  const pipeline = new DefaultRenderingPipeline(
    "gritty-rendering-pipeline",
    true,
    scene,
    [camera],
  );
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = RENDERING_TUNING.bloomThreshold;
  pipeline.bloomWeight = RENDERING_TUNING.bloomWeight;
  pipeline.bloomKernel = RENDERING_TUNING.bloomKernel;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.exposure = RENDERING_TUNING.exposure;
  pipeline.imageProcessing.contrast = RENDERING_TUNING.contrast;

  return { glow, pipeline };
}
