import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { HullPoseComposer } from "./hull-pose";
import { createTank } from "./tank";

describe("hull pose composition", () => {
  it("adds independent sources without changing simulation yaw", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "pose-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      rotationY: 0.7,
      color: Color3.White(),
    });
    const composer = new HullPoseComposer(tank);

    composer.setSource("shot-recoil", { pitchRadians: 0.02, rollRadians: 0 });
    composer.setSource("suspension", { pitchRadians: -0.01, rollRadians: 0.04 });
    expect(composer.apply()).toEqual({ pitchRadians: 0.01, rollRadians: 0.04 });
    expect(tank.root.rotation.x).toBeCloseTo(0.01);
    expect(tank.root.rotation.y).toBeCloseTo(0.7);
    expect(tank.root.rotation.z).toBeCloseTo(0.04);

    composer.clearSource("shot-recoil");
    composer.clearSource("suspension");
    composer.apply();
    expect(tank.root.rotation.x).toBeCloseTo(0);
    expect(tank.root.rotation.y).toBeCloseTo(0.7);
    expect(tank.root.rotation.z).toBeCloseTo(0);

    composer.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("removes only its own applied delta when external state changes", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "delta-pose-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.White(),
    });
    const composer = new HullPoseComposer(tank);

    composer.setSource("shot-recoil", { pitchRadians: 0.02, rollRadians: 0.03 });
    composer.apply();
    tank.root.rotation.x += 0.1;
    tank.root.rotation.z -= 0.05;
    composer.clearSource("shot-recoil");
    composer.apply();

    expect(tank.root.rotation.x).toBeCloseTo(0.1);
    expect(tank.root.rotation.z).toBeCloseTo(-0.05);
    composer.dispose();
    scene.dispose();
    engine.dispose();
  });
});
