import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "./core/ballistics";
import { ShellSystem } from "./shells";
import { createTank } from "./tank/tank";

describe("shell integration", () => {
  it("scores a hit outcome when firing at the target tank at demo range", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const outcomes: HitOutcome[] = [];
    const shells = new ShellSystem(scene, (outcome) => outcomes.push(outcome));
    const player = createTank(scene, { name: "player", profile: "BRAWLER", position: new Vector3(-5.5, 0, 2.5), rotationY: Math.PI / 8, color: Color3.White() });
    const target = createTank(scene, { name: "target", profile: "ALLROUNDER", position: new Vector3(5.5, 0, -2.5), rotationY: -Math.PI * 0.78, color: Color3.Gray() });
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    shells.fire(player, target.root.position.clone());
    for (let frame = 0; frame < 240 && outcomes.length === 0; frame++) shells.update(1 / 60);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(Object.values(HitOutcome)).toContain(outcomes[0]);
    scene.dispose(); engine.dispose();
  });
});
