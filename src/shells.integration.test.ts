import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HitOutcome } from "./core/ballistics";
import { GameEventBus, type GameEvents } from "./core/events";
import { HitCategory, ObjectHitOutcome } from "./core/impacts";
import { registerHitTarget } from "./hit-targets";
import { ShellSystem } from "./shells";
import { createTank } from "./tank/tank";

describe("shell integration", () => {
  it("scores a hit outcome when firing at the target tank at demo range", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const shots: GameEvents["SHOT_FIRED"][] = [];
    const movements: GameEvents["SHELL_MOVED"][] = [];
    const despawns: GameEvents["SHELL_DESPAWNED"][] = [];
    const hits: GameEvents["HIT"][] = [];
    const shells = new ShellSystem(scene, events);
    events.on("SHOT_FIRED", (event) => shots.push(event));
    events.on("SHELL_MOVED", (event) => movements.push(event));
    events.on("SHELL_DESPAWNED", (event) => despawns.push(event));
    events.on("HIT", (event) => hits.push(event));
    const player = createTank(scene, { name: "player", profile: "BRAWLER", position: new Vector3(-5.5, 0, 2.5), rotationY: Math.PI / 8, color: Color3.White() });
    const target = createTank(scene, { name: "target", profile: "ALLROUNDER", position: new Vector3(5.5, 0, -2.5), rotationY: -Math.PI * 0.78, color: Color3.Gray() });
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    shells.fire(player, target.root.position.clone());
    for (let frame = 0; frame < 240 && hits.length === 0; frame++) shells.update(1 / 60);
    expect(shots).toHaveLength(1);
    expect(shots[0].tank).toBe("player");
    expect(Math.hypot(shots[0].direction.x, shots[0].direction.y, shots[0].direction.z)).toBeCloseTo(1);
    expect(movements.length).toBeGreaterThan(0);
    expect(movements.every(({ shellId }) => shellId === shots[0].shellId)).toBe(true);
    expect(despawns).toEqual([
      expect.objectContaining({ shellId: shots[0].shellId }),
    ]);
    expect(hits.length).toBeGreaterThan(0);
    expect(Object.values(HitOutcome)).toContain(hits[0].outcome);
    expect(hits[0].facetId).toBeTruthy();
    expect(hits[0].impactAngleDegrees).toBeGreaterThanOrEqual(0);
    scene.dispose(); engine.dispose();
  });

  it("keeps shells active on the expanded arena's far half", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const hits: GameEvents["HIT"][] = [];
    const shells = new ShellSystem(scene, events);
    events.on("HIT", (event) => hits.push(event));
    const player = createTank(scene, { name: "far-player", profile: "BRAWLER", position: new Vector3(24.5, 0, 2.5), rotationY: Math.PI / 8, color: Color3.White() });
    const target = createTank(scene, { name: "far-target", profile: "ALLROUNDER", position: new Vector3(35.5, 0, -2.5), rotationY: -Math.PI * 0.78, color: Color3.Gray() });
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));

    shells.fire(player, target.root.position.clone());
    for (let frame = 0; frame < 240 && hits.length === 0; frame++) shells.update(1 / 60);

    expect(hits.length).toBeGreaterThan(0);
    scene.dispose(); engine.dispose();
  });

  it("destroys soft cover, continues, and then stops on a hard wall", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const objectHits: GameEvents["OBJECT_HIT"][] = [];
    const shells = new ShellSystem(scene, events);
    events.on("OBJECT_HIT", (event) => objectHits.push(event));
    const player = createTank(scene, { name: "object-test-player", profile: "BRAWLER", position: new Vector3(0, 0, 6), color: Color3.White() });
    const crate = MeshBuilder.CreateBox("test-crate", { width: 3, height: 3, depth: 1 }, scene);
    crate.position.set(0, 1.5, 0);
    registerHitTarget(crate, { category: HitCategory.SOFT, targetId: "test-crate", retainedSpeed: 0.8, retainedPenetration: 0.7 });
    const wall = MeshBuilder.CreateBox("test-wall", { width: 5, height: 3, depth: 1 }, scene);
    wall.position.set(0, 1.5, -5);
    registerHitTarget(wall, { category: HitCategory.HARD, targetId: "test-wall", equivalentArmor: 400 });
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));

    shells.fire(player, wall.position.clone());
    for (let frame = 0; frame < 240 && objectHits.length < 2; frame++) shells.update(1 / 60);

    expect(objectHits.map(({ targetId, outcome }) => ({ targetId, outcome }))).toEqual([
      { targetId: "test-crate", outcome: ObjectHitOutcome.DESTROYED },
      { targetId: "test-wall", outcome: ObjectHitOutcome.STOPPED },
    ]);
    expect(crate.isDisposed()).toBe(true);
    scene.dispose(); engine.dispose();
  });

  it("ricochets from sloped hard cover and destroys soft cover in its new path", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const events = new GameEventBus();
    const objectHits: GameEvents["OBJECT_HIT"][] = [];
    const ricochets: GameEvents["RICOCHET"][] = [];
    const shells = new ShellSystem(scene, events);
    events.on("OBJECT_HIT", (event) => objectHits.push(event));
    events.on("RICOCHET", (event) => ricochets.push(event));
    const player = createTank(scene, {
      name: "ricochet-chain-player",
      profile: "BRAWLER",
      position: new Vector3(0, 0, 6),
      color: Color3.White(),
    });
    const plate = MeshBuilder.CreateBox(
      "sloped-hard-plate",
      { width: 8, height: 5, depth: 0.4 },
      scene,
    );
    plate.position.set(0, 2.1, 0);
    plate.rotation.y = 80 * Math.PI / 180;
    registerHitTarget(plate, {
      category: HitCategory.HARD,
      targetId: "sloped-hard-plate",
      equivalentArmor: 400,
    });
    const crate = MeshBuilder.CreateBox(
      "ricochet-chain-crate",
      { width: 4, height: 4, depth: 3 },
      scene,
    );
    crate.position.set(3, 1.9, -8);
    registerHitTarget(crate, {
      category: HitCategory.SOFT,
      targetId: "ricochet-chain-crate",
      retainedSpeed: 0.8,
      retainedPenetration: 0.7,
    });
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));

    shells.fire(player, new Vector3(0, 0, -12));
    for (let frame = 0; frame < 300 && !crate.isDisposed(); frame++) {
      shells.update(1 / 120);
    }

    expect(objectHits.map(({ targetId, outcome }) => ({ targetId, outcome }))).toEqual([
      { targetId: "sloped-hard-plate", outcome: ObjectHitOutcome.RICOCHET },
      { targetId: "ricochet-chain-crate", outcome: ObjectHitOutcome.DESTROYED },
    ]);
    expect(ricochets).toHaveLength(1);
    expect(ricochets[0].outgoing.x).toBeGreaterThan(0);
    expect(crate.isDisposed()).toBe(true);
    scene.dispose(); engine.dispose();
  });
});
