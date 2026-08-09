import { describe, expect, it } from "vitest";
import { RENDERING_TUNING } from "./rendering";

describe("gritty rendering baseline", () => {
  it("keeps glow and bloom intentionally restrained", () => {
    expect(RENDERING_TUNING.glowIntensity).toBeLessThanOrEqual(0.25);
    expect(RENDERING_TUNING.bloomThreshold).toBeGreaterThanOrEqual(1.1);
    expect(RENDERING_TUNING.bloomWeight).toBeLessThanOrEqual(0.15);
  });
});
