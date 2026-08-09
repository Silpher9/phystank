import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "./core/ballistics";
import { GameEventBus, type GameEvents } from "./core/events";
import { ShellSystem } from "./shells";
import { createTank } from "./tank/tank";

describe("shell integration", () => {
  it("scores a hit outcome when firing at the target tank at demo range", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const shots: GameEvents["SHOT_FIRED"][] = [];
    const hits: GameEvents["HIT"][] = [];
    const shells = new ShellSystem(scene, events);
    events.on("SHOT_FIRED", (event) => shots.push(event));
    events.on("HIT", (event) => hits.push(event));
    const player = createTank(scene, { name: "player", profile: "BRAWLER", position: new Vector3(-5.5, 0, 2.5), rotationY: Math.PI / 8, color: Color3.White() });
    const target = createTank(scene, { name: "target", profile: "ALLROUNDER", position: new Vector3(5.5, 0, -2.5), rotationY: -Math.PI * 0.78, color: Color3.Gray() });
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    shells.fire(player, target.root.position.clone());
    for (let frame = 0; frame < 240 && hits.length === 0; frame++) shells.update(1 / 60);
    expect(shots).toHaveLength(1);
    expect(shots[0].tank).toBe("player");
    expect(Math.hypot(shots[0].direction.x, shots[0].direction.y, shots[0].direction.z)).toBeCloseTo(1);
    expect(hits.length).toBeGreaterThan(0);
    expect(Object.values(HitOutcome)).toContain(hits[0].outcome);
    expect(hits[0].facetId).toBeTruthy();
    expect(hits[0].impactAngleDegrees).toBeGreaterThanOrEqual(0);
    scene.dispose(); engine.dispose();
  });
});
