import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "../core/ballistics";
import { GameEventBus } from "../core/events";
import { getHitTarget } from "../hit-targets";
import { createTank } from "../tank/tank";
import { DebugOverlaySystem, readFacetPose } from "./debug-overlay";

describe("debug overlay", () => {
  it("reads the live world-space facet angle without publishing frame events", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "debug-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });

    const resting = readFacetPose(tank.facets.FRONT);
    tank.root.rotation.x = 10 * Math.PI / 180;
    const pitched = readFacetPose(tank.facets.FRONT);

    expect(resting.slopeDegrees).toBeCloseTo(20);
    expect(pitched.slopeDegrees).toBeCloseTo(30);
    scene.dispose();
    engine.dispose();
  });

  it("keeps the last shell path, deflection, and authoritative hit facts", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const tank = createTank(scene, {
      name: "event-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const aimElement = { textContent: "" } as HTMLElement;
    const overlay = new DebugOverlaySystem(scene, events, [tank], {
      panel: null,
      facets: null,
      aim: aimElement,
      hit: null,
    });
    overlay.setAimSpreadDegrees(2.5);

    events.emit("SHOT_FIRED", {
      shellId: "shell-debug",
      tank: tank.root.name,
      muzzlePosition: { x: 0, y: 2, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
      spreadDegrees: 3,
      deviationDegrees: 1.25,
    });
    events.emit("SHELL_MOVED", {
      shellId: "shell-debug",
      position: { x: 0, y: 1.9, z: -2 },
    });
    events.emit("RICOCHET", {
      shellId: "shell-debug",
      tank: tank.root.name,
      point: { x: 0, y: 1.9, z: -2 },
      normal: { x: 0, y: 0, z: 1 },
      incoming: { x: 0, y: 0, z: -1 },
      outgoing: { x: 1, y: 0, z: -1 },
      retainedSpeed: 30,
    });
    events.emit("SHELL_MOVED", {
      shellId: "shell-debug",
      position: { x: 2, y: 1.8, z: -4 },
    });
    events.emit("HIT", {
      shellId: "shell-debug",
      tank: tank.root.name,
      outcome: HitOutcome.RICOCHET,
      facetId: "FRONT",
      point: { x: 0, y: 1.9, z: -2 },
      normal: { x: 0, y: 0, z: 1 },
      incoming: { x: 0, y: 0, z: -1 },
      impactAngleDegrees: 75,
      nominalThickness: 160,
      effectiveThickness: 618.2,
      penetration: 150,
    });

    expect(overlay.lastPathPointCount).toBe(3);
    expect(overlay.deflectionCount).toBe(1);
    expect(overlay.lastHitSummary).toContain("160 mm nominal");
    expect(overlay.lastHitSummary).toContain("618.2 mm effective");
    expect(overlay.lastHitSummary).toContain("RICOCHET");
    const normal = scene.getMeshByName("debug-normal-event-tank-FRONT");
    const path = scene.getMeshByName("debug-last-shell-path");
    const deflection = scene.getMeshByName("debug-deflection");
    const debugMeshes = scene.meshes.filter(({ name }) => name.startsWith("debug-"));
    expect(debugMeshes.length).toBeGreaterThan(0);
    expect(debugMeshes.every((mesh) => getHitTarget(mesh) === undefined)).toBe(true);
    expect(normal?.isEnabled()).toBe(false);
    expect(path?.isEnabled()).toBe(false);
    expect(deflection?.isEnabled()).toBe(false);
    expect(overlay.toggle()).toBe(true);
    expect(overlay.enabled).toBe(true);
    expect(aimElement.textContent).toContain("CURRENT SPREAD  2.50°");
    expect(aimElement.textContent).toContain("LAST SHOT CONE 3.00°");
    expect(aimElement.textContent).toContain("ACTUAL DEVIATION 1.25°");
    expect(normal?.isEnabled()).toBe(true);
    expect(path?.isEnabled()).toBe(true);
    expect(deflection?.isEnabled()).toBe(true);
    expect(overlay.toggle()).toBe(false);
    expect(normal?.isEnabled()).toBe(false);
    expect(path?.isEnabled()).toBe(false);
    expect(deflection?.isEnabled()).toBe(false);

    overlay.dispose();
    scene.dispose();
    engine.dispose();
  });
});
