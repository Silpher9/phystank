import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import {
  AIM_CURSOR_TUNING,
  AimCursorSystem,
  calculateAimCursorRadius,
} from "./aim-cursor";

describe("aim cursor", () => {
  it("projects angular spread onto the actual aim distance", () => {
    expect(calculateAimCursorRadius(12, 7)).toBeCloseTo(1.47, 2);
    expect(calculateAimCursorRadius(20, 7)).toBeCloseTo(2.46, 2);
    expect(calculateAimCursorRadius(40, 7)).toBeCloseTo(4.91, 2);
    expect(calculateAimCursorRadius(12, 0.25)).toBeCloseTo(0.05, 2);
    expect(calculateAimCursorRadius(40, 0.25)).toBeCloseTo(0.17, 2);
  });

  it("moves a contrasting world-space ring to the aim point", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const cursor = new AimCursorSystem(scene);
    const origin = new Vector3(0, 2.37, 0);
    const aimPoint = new Vector3(0, 0, -40);

    expect(cursor.visible).toBe(false);
    cursor.update(origin, aimPoint, 7);

    const ring = scene.getMeshByName("aim-cursor-spread-ring");
    const contrast = scene.getMeshByName("aim-cursor-contrast-ring");
    expect(cursor.visible).toBe(true);
    expect(cursor.radius).toBeCloseTo(4.91, 2);
    expect(ring?.absolutePosition.x).toBeCloseTo(aimPoint.x);
    expect(ring?.absolutePosition.y).toBeCloseTo(AIM_CURSOR_TUNING.elevation);
    expect(ring?.absolutePosition.z).toBeCloseTo(aimPoint.z);
    expect(ring?.scaling.x).toBeCloseTo(cursor.radius);
    expect(contrast?.scaling.x).toBeCloseTo(
      cursor.radius + AIM_CURSOR_TUNING.contrastGap,
    );
    expect(ring?.renderingGroupId).toBe(AIM_CURSOR_TUNING.renderingGroupId);
    for (const name of [
      "aim-cursor-contrast-ring",
      "aim-cursor-spread-ring",
      "aim-cursor-contrast-center",
      "aim-cursor-center",
    ]) {
      expect(scene.getMeshByName(name)?.isPickable).toBe(false);
    }

    const wideRadius = cursor.radius;
    cursor.update(origin, aimPoint, 0.25);
    expect(cursor.radius).toBeCloseTo(0.17, 2);
    expect(ring?.scaling.x).toBeLessThan(wideRadius);

    cursor.update(origin, null, 7);
    expect(cursor.visible).toBe(false);
    cursor.dispose();
    scene.dispose();
    engine.dispose();
  });
});
