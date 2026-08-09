import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { ARENA_OBJECT_SPECS, createArena } from "./arena-scene";
import { HitCategory } from "./core/impacts";
import { getHitTarget } from "./hit-targets";

describe("arena hit targets", () => {
  it("registers boundaries, hard cover, and destructible soft objects as data", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const meshes = createArena(scene);
    const targets = meshes.map(getHitTarget);

    expect(targets.every(Boolean)).toBe(true);
    expect(targets.filter((target) => target?.category === HitCategory.HARD).length).toBe(7);
    expect(targets.filter((target) => target?.category === HitCategory.SOFT).length).toBe(4);
    expect(ARENA_OBJECT_SPECS).toHaveLength(6);

    scene.dispose();
    engine.dispose();
  });
});
