import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { describe, expect, it } from "vitest";
import { resolveHit } from "../core/ballistics";
import { createTank, getFacetNormalFromPick, HULL_PLATE_LAYOUT } from "./tank";

describe("hull armor geometry", () => {
  it("overlaps the roof with side and rear plates so no grazing seams exist", () => {
    const roof = HULL_PLATE_LAYOUT.ROOF;
    const side = HULL_PLATE_LAYOUT.LEFT_SIDE;
    const rear = HULL_PLATE_LAYOUT.REAR;

    expect(side.position.y + side.height / 2).toBeGreaterThan(roof.position.y - roof.height / 2);
    expect(rear.position.y + rear.height / 2).toBeGreaterThan(roof.position.y - roof.height / 2);
    expect(roof.width / 2).toBeGreaterThan(Math.abs(side.position.x) - side.width / 2);
    expect(roof.depth / 2).toBeGreaterThan(Math.abs(rear.position.z) - rear.depth / 2);
  });

  it("restores an outward normal so a shell leaving from inside is rejected", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tank = createTank(scene, {
      name: "normal-test-tank",
      profile: "BRAWLER",
      position: Vector3.Zero(),
      color: new Color3(0.4, 0.5, 0.3),
    });
    const rearMesh = tank.facets.REAR.mesh;
    rearMesh.computeWorldMatrix(true);
    const center = rearMesh.getBoundingInfo().boundingBox.centerWorld;
    const pick = {
      hit: true,
      pickedMesh: rearMesh,
      pickedPoint: center.add(new Vector3(0, 0, 0.16)),
      // Babylon's picking API would have flipped this toward the outgoing ray.
      getNormal: () => new Vector3(0, 0, -1),
    } as unknown as PickingInfo;

    const outwardNormal = getFacetNormalFromPick(pick);
    expect(outwardNormal?.z).toBeCloseTo(1);
    expect(
      resolveHit({
        shellDirection: new Vector3(0, 0, 1),
        facetNormal: outwardNormal!,
        armorThickness: tank.facets.REAR.thickness,
        shellCaliber: 75,
        penetration: 100,
      }),
    ).toBeNull();

    scene.dispose();
    engine.dispose();
  });
});
