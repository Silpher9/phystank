import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { GreasedLineSimpleMaterial } from "@babylonjs/core/Materials/GreasedLine/greasedLineSimpleMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { HitCategory } from "./core/impacts";
import { describe, expect, it } from "vitest";
import {
  AIM_CURSOR_TUNING,
  AimCursorSystem,
  calculateAimCursorLoopPoint,
  calculateAimCursorRadius,
} from "./aim-cursor";
import { getHitTarget, registerHitTarget } from "./hit-targets";
import { createTank } from "./tank/tank";

describe("aim cursor", () => {
  it("projects angular spread onto the actual aim distance", () => {
    expect(calculateAimCursorRadius(12, 7)).toBeCloseTo(1.47, 2);
    expect(calculateAimCursorRadius(20, 7)).toBeCloseTo(2.46, 2);
    expect(calculateAimCursorRadius(40, 7)).toBeCloseTo(4.91, 2);
    expect(calculateAimCursorRadius(12, 0.25)).toBeCloseTo(0.05, 2);
    expect(calculateAimCursorRadius(40, 0.25)).toBeCloseTo(0.17, 2);
  });

  it("anchors the loop ring at ground impact and clamps it to the arena", () => {
    const origin = { x: 0, y: 2.37, z: 0 };
    const aimPoint = { x: 0, y: 0, z: -3 };
    const eightDegrees = 8 * Math.PI / 180;
    const eightDegreeDirection = new Vector3(
      0,
      -Math.sin(eightDegrees),
      -Math.cos(eightDegrees),
    );
    const groundPoint = calculateAimCursorLoopPoint(
      origin,
      aimPoint,
      eightDegreeDirection,
    );
    expect(groundPoint.y).toBe(AIM_CURSOR_TUNING.groundY);
    expect(
      Math.hypot(groundPoint.x - origin.x, groundPoint.z - origin.z),
    ).toBeCloseTo(origin.y / Math.tan(eightDegrees), 2);

    const oneDegree = Math.PI / 180;
    const arenaEdgePoint = calculateAimCursorLoopPoint(
      origin,
      aimPoint,
      new Vector3(0, -Math.sin(oneDegree), -Math.cos(oneDegree)),
    );
    expect(arenaEdgePoint.z).toBeCloseTo(-AIM_CURSOR_TUNING.arenaHalfExtent);
  });

  it("stops at the first registered collision and ignores the own tank", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const ownTank = createTank(scene, {
      name: "aim-own-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: Color3.FromHexString("#777f47"),
    });
    const enemyTank = createTank(scene, {
      name: "aim-enemy-tank",
      profile: "ALLROUNDER",
      position: new Vector3(0, 0, -8),
      color: Color3.FromHexString("#536d75"),
    });
    const wall = MeshBuilder.CreateBox(
      "aim-test-wall",
      { width: 8, height: 2, depth: 1 },
      scene,
    );
    wall.position.set(0, 1, -18);
    const ownTankBlocker = MeshBuilder.CreateBox(
      "aim-own-tank-blocker",
      { width: 8, height: 2, depth: 1 },
      scene,
    );
    ownTankBlocker.parent = ownTank.root;
    ownTankBlocker.position.set(0, 2, -3);
    registerHitTarget(wall, {
      category: HitCategory.HARD,
      targetId: wall.name,
      equivalentArmor: 400,
    });
    registerHitTarget(ownTankBlocker, {
      category: HitCategory.HARD,
      targetId: ownTankBlocker.name,
      equivalentArmor: 400,
    });
    ownTank.root.computeWorldMatrix(true);
    enemyTank.root.computeWorldMatrix(true);
    wall.computeWorldMatrix(true);

    const cursor = new AimCursorSystem(scene, ownTank.root);
    const origin = new Vector3(0, 2.37, 0);
    const barrelDirection = new Vector3(0, -0.08, -1).normalize();
    const aimPoint = new Vector3(0, 0, -40);
    cursor.update(
      origin,
      aimPoint,
      barrelDirection,
      7,
      true,
      false,
      1 / 60,
    );

    const expectedPick = scene.pickWithRay(
      new Ray(origin.clone(), barrelDirection.clone(), AIM_CURSOR_TUNING.rayMaxDistance),
      (mesh) => Boolean(mesh.isPickable)
        && Boolean(getHitTarget(mesh))
        && !mesh.isDescendantOf(ownTank.root),
    );
    expect(expectedPick?.hit).toBe(true);
    expect(expectedPick?.pickedMesh?.isDescendantOf(enemyTank.root)).toBe(true);
    expect(expectedPick?.pickedPoint).not.toBeNull();

    const ring = scene.getMeshByName("aim-cursor-spread-ring");
    expect(ring?.absolutePosition.x).toBeCloseTo(expectedPick!.pickedPoint!.x);
    expect(ring?.absolutePosition.y).toBeCloseTo(
      expectedPick!.pickedPoint!.y + AIM_CURSOR_TUNING.elevation,
    );
    expect(ring?.absolutePosition.z).toBeCloseTo(expectedPick!.pickedPoint!.z);
    expect(cursor.radius).toBeCloseTo(
      calculateAimCursorRadius(expectedPick!.distance, 7),
    );
    const ringNormal = Vector3.TransformNormal(
      Vector3.Up(),
      ring!.getWorldMatrix(),
    ).normalize();
    expect(Vector3.Dot(ringNormal, barrelDirection)).toBeCloseTo(1, 5);

    cursor.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("uses the registered ground as the fallback collision", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround(
      "aim-test-ground",
      { width: 100, height: 100 },
      scene,
    );
    registerHitTarget(ground, {
      category: HitCategory.HARD,
      targetId: ground.name,
      equivalentArmor: 400,
    });

    const cursorOwner = new TransformNode("aim-ground-test-owner", scene);
    const cursor = new AimCursorSystem(scene, cursorOwner);
    const origin = new Vector3(0, 2.37, 0);
    const barrelDirection = new Vector3(0, -8, -57).normalize();
    const aimPoint = new Vector3(0, 0, -40);
    cursor.update(origin, aimPoint, barrelDirection, 7);

    const expectedPick = scene.pickWithRay(
      new Ray(origin.clone(), barrelDirection.clone(), AIM_CURSOR_TUNING.rayMaxDistance),
      (mesh) => Boolean(mesh.isPickable) && Boolean(getHitTarget(mesh)),
    );
    expect(expectedPick?.hit).toBe(true);
    expect(expectedPick?.pickedMesh).toBe(ground);
    const ring = scene.getMeshByName("aim-cursor-spread-ring");
    expect(ring?.absolutePosition.y).toBeCloseTo(
      AIM_CURSOR_TUNING.groundY + AIM_CURSOR_TUNING.elevation,
    );
    expect(ring?.absolutePosition.z).toBeCloseTo(expectedPick!.pickedPoint!.z);
    expect(cursor.radius).toBeCloseTo(
      calculateAimCursorRadius(expectedPick!.distance, 7),
    );

    cursor.dispose();
    cursorOwner.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("separates the intended target point from the actual barrel line", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const cursorOwner = new TransformNode("aim-visual-test-owner", scene);
    const cursor = new AimCursorSystem(scene, cursorOwner);
    const origin = new Vector3(0, 2.37, 0);
    const aimPoint = new Vector3(0, 1.4, -40);
    const depression = 8 * Math.PI / 180;
    const barrelDirection = new Vector3(
      Math.cos(depression) / Math.sqrt(2),
      -Math.sin(depression),
      -Math.cos(depression) / Math.sqrt(2),
    );
    const loopPoint = calculateAimCursorLoopPoint(
      origin,
      aimPoint,
      barrelDirection,
    );
    expect(
      Math.hypot(loopPoint.x - origin.x, loopPoint.z - origin.z),
    ).toBeCloseTo(origin.y / Math.tan(depression), 2);
    expect(loopPoint.y).toBe(AIM_CURSOR_TUNING.groundY);

    expect(cursor.visible).toBe(false);
    cursor.update(origin, aimPoint, barrelDirection, 7);

    const ring = scene.getMeshByName("aim-cursor-spread-ring");
    const contrast = scene.getMeshByName("aim-cursor-contrast-ring");
    const target = scene.getMeshByName("aim-cursor-target");
    const contrastTarget = scene.getMeshByName("aim-cursor-contrast-target");
    const tether = scene.getMeshByName("aim-cursor-tether");
    expect(cursor.visible).toBe(true);
    expect(cursor.radius).toBeCloseTo(
      calculateAimCursorRadius(
        Math.hypot(loopPoint.x - origin.x, loopPoint.z - origin.z),
        7,
      ),
    );
    expect(ring?.absolutePosition.x).toBeCloseTo(loopPoint.x);
    expect(ring?.absolutePosition.y).toBeCloseTo(
      AIM_CURSOR_TUNING.groundY + AIM_CURSOR_TUNING.elevation,
    );
    expect(ring?.absolutePosition.z).toBeCloseTo(loopPoint.z);
    expect(target?.absolutePosition.x).toBeCloseTo(aimPoint.x);
    expect(target?.absolutePosition.y).toBeCloseTo(
      aimPoint.y + AIM_CURSOR_TUNING.elevation,
    );
    expect(target?.absolutePosition.z).toBeCloseTo(aimPoint.z);
    expect(ring?.scaling.x).toBeCloseTo(cursor.radius);
    expect(contrast?.scaling.x).toBeCloseTo(cursor.radius);
    const ringNormal = Vector3.TransformNormal(
      Vector3.Up(),
      ring!.getWorldMatrix(),
    ).normalize();
    expect(Vector3.Dot(ringNormal, barrelDirection)).toBeCloseTo(1, 5);
    const ringMaterial = ring?.material as GreasedLineSimpleMaterial;
    const contrastMaterial = contrast?.material as GreasedLineSimpleMaterial;
    const targetMaterial = target?.material as StandardMaterial;
    const contrastTargetMaterial = contrastTarget?.material as StandardMaterial;
    expect(AIM_CURSOR_TUNING.lineWidthPixels).toBeGreaterThanOrEqual(3);
    expect(ringMaterial.width).toBe(AIM_CURSOR_TUNING.lineWidthPixels);
    expect(contrastMaterial.width).toBe(AIM_CURSOR_TUNING.contrastWidthPixels);
    expect(contrastMaterial.width).toBeGreaterThan(ringMaterial.width);
    expect(ringMaterial.sizeAttenuation).toBe(true);
    expect(ring?.renderingGroupId).toBe(AIM_CURSOR_TUNING.renderingGroupId);
    expect(targetMaterial).toBeInstanceOf(StandardMaterial);
    expect(contrastTargetMaterial).toBeInstanceOf(StandardMaterial);
    expect(AIM_CURSOR_TUNING.targetRadius).toBeGreaterThan(
      AIM_CURSOR_TUNING.centerHalfExtent,
    );
    expect(targetMaterial.diffuseColor.equals(ringMaterial.color!)).toBe(false);
    expect(targetMaterial.diffuseColor.b).toBeGreaterThan(
      targetMaterial.diffuseColor.r,
    );
    expect(
      contrastTargetMaterial.diffuseColor.equals(contrastMaterial.color!),
    ).toBe(true);
    expect(tether?.isEnabled()).toBe(true);
    for (const name of [
      "aim-cursor-contrast-ring",
      "aim-cursor-spread-ring",
      "aim-cursor-contrast-center",
      "aim-cursor-center",
      "aim-cursor-contrast-target",
      "aim-cursor-target",
      "aim-cursor-tether",
    ]) {
      expect(scene.getMeshByName(name)?.isPickable).toBe(false);
    }

    const displayedBeforeAimMove = target!.absolutePosition.clone();
    const nextAimPoint = new Vector3(20, 1.4, -40);
    cursor.update(origin, nextAimPoint, barrelDirection, 7, true, false, 1 / 60);
    expect(target!.absolutePosition.x).toBeGreaterThan(
      displayedBeforeAimMove.x,
    );
    expect(target!.absolutePosition.x).toBeLessThan(nextAimPoint.x);
    expect(tether?.isEnabled()).toBe(true);

    const alignedBarrelDirection = new Vector3(20, -origin.y, -40).normalize();
    cursor.update(
      origin,
      nextAimPoint,
      alignedBarrelDirection,
      7,
      true,
      false,
      1,
    );
    expect(target!.absolutePosition.x).toBeCloseTo(nextAimPoint.x);
    expect(target!.absolutePosition.z).toBeCloseTo(nextAimPoint.z);
    expect(tether?.isEnabled()).toBe(false);

    const wideRadius = cursor.radius;
    const closeAimPoint = new Vector3(0, 0, -12);
    const closeBarrelDirection = new Vector3(0, -2.37, -11.46).normalize();
    cursor.update(origin, closeAimPoint, closeBarrelDirection, 0.25);
    expect(cursor.radius).toBeCloseTo(0.05, 2);
    expect(ring?.scaling.x).toBeLessThan(wideRadius);
    expect(contrast?.scaling.x).toBeCloseTo(cursor.radius);

    const center = scene.getMeshByName("aim-cursor-center")!;
    const centerMaterial = center.material as GreasedLineSimpleMaterial;
    const reachableColor = centerMaterial.color!.clone();
    const positionBeforeWarning = ring!.absolutePosition.clone();
    const radiusBeforeWarning = cursor.radius;
    cursor.update(origin, closeAimPoint, closeBarrelDirection, 0.25, false);
    expect(cursor.reachable).toBe(false);
    expect(cursor.radius).toBeCloseTo(radiusBeforeWarning);
    expect(ring?.absolutePosition.equalsWithEpsilon(positionBeforeWarning)).toBe(true);
    expect(center.rotation.y).toBeCloseTo(Math.PI / 4);
    expect(centerMaterial.color!.equals(reachableColor)).toBe(false);

    cursor.update(
      origin,
      closeAimPoint,
      closeBarrelDirection,
      0.25,
      true,
      true,
    );
    expect(cursor.reachable).toBe(true);
    expect(center.rotation.y).toBe(0);
    expect(centerMaterial.color!.equals(reachableColor)).toBe(true);
    expect(ringMaterial.width).toBe(AIM_CURSOR_TUNING.readyLineWidthPixels);
    expect(ringMaterial.alpha).toBe(AIM_CURSOR_TUNING.readyAlpha);

    cursor.update(origin, null, barrelDirection, 7);
    expect(cursor.visible).toBe(false);
    cursor.dispose();
    cursorOwner.dispose();
    scene.dispose();
    engine.dispose();
  });
});
