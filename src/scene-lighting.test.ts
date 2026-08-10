import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { describe, expect, it, vi } from "vitest";
import { LIGHTING_TUNING, configureSceneShadows } from "./scene-lighting";

describe("scene lighting", () => {
  it("grounds explicit world casters with one bounded soft shadow map", () => {
    const ground = { receiveShadows: false } as AbstractMesh;
    const tank = { receiveShadows: false } as AbstractMesh;
    const addShadowCaster = vi.fn();
    const setDarkness = vi.fn();
    const shadows = {
      usePercentageCloserFiltering: false,
      filteringQuality: -1,
      bias: 0,
      normalBias: 0,
      addShadowCaster,
      setDarkness,
    } as unknown as ShadowGenerator;

    configureSceneShadows(shadows, ground, [tank]);

    expect(ground.receiveShadows).toBe(true);
    expect(tank.receiveShadows).toBe(false);
    expect(addShadowCaster).toHaveBeenCalledOnce();
    expect(addShadowCaster).toHaveBeenCalledWith(tank);
    expect(shadows.usePercentageCloserFiltering).toBe(true);
    expect(shadows.filteringQuality).toBe(ShadowGenerator.QUALITY_MEDIUM);
    expect(shadows.bias).toBe(LIGHTING_TUNING.shadowBias);
    expect(shadows.normalBias).toBe(LIGHTING_TUNING.shadowNormalBias);
    expect(setDarkness).toHaveBeenCalledWith(LIGHTING_TUNING.shadowDarkness);
    expect(LIGHTING_TUNING.sunIntensity).toBeLessThan(2.4);
  });
});
