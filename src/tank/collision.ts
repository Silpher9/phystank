export type CollisionPosition = Readonly<{
  x: number;
  z: number;
}>;

export type TankCollisionBody = Readonly<{
  kind: "BOX";
  id: string;
  halfWidth: number;
  halfDepth: number;
  getCenter: () => CollisionPosition;
  getRotationY: () => number;
  isActive?: () => boolean;
}>;

/** Half-extents of the single driving body used for each tank. */
export const TANK_COLLISION_HALF_WIDTH = 2.3;
export const TANK_COLLISION_HALF_DEPTH = 2.65;

/** Radius retained for the arena clamp's conservative wall invariant. */
export const CONSERVATIVE_ROTATED_HULL_RADIUS = 3.51;

export function isTankPositionBlocked(
  position: CollisionPosition,
  tankId: string,
  bodies: readonly TankCollisionBody[],
  rotationY = 0,
  halfWidth = TANK_COLLISION_HALF_WIDTH,
  halfDepth = TANK_COLLISION_HALF_DEPTH,
): boolean {
  const movingBox: CollisionBox = {
    center: position,
    halfWidth,
    halfDepth,
    rotationY,
  };

  return bodies.some((body) => {
    if (body.id === tankId) return false;
    if (body.isActive && !body.isActive()) return false;

    return boxesIntersect(movingBox, {
      center: body.getCenter(),
      halfWidth: body.halfWidth,
      halfDepth: body.halfDepth,
      rotationY: body.getRotationY(),
    });
  });
}

type CollisionBox = Readonly<{
  center: CollisionPosition;
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
}>;

function boxesIntersect(first: CollisionBox, second: CollisionBox): boolean {
  const axes = [...getAxes(first), ...getAxes(second)];
  const centerDelta = {
    x: second.center.x - first.center.x,
    z: second.center.z - first.center.z,
  };

  return axes.every((axis) => {
    const centerDistance = Math.abs(dot(centerDelta, axis));
    const firstRadius = projectedRadius(first, axis);
    const secondRadius = projectedRadius(second, axis);
    return centerDistance <= firstRadius + secondRadius;
  });
}

function getAxes(box: CollisionBox): readonly [Axis, Axis] {
  const cosine = Math.cos(box.rotationY);
  const sine = Math.sin(box.rotationY);
  return [
    { x: cosine, z: -sine },
    { x: sine, z: cosine },
  ];
}

function projectedRadius(box: CollisionBox, axis: Axis): number {
  const [widthAxis, depthAxis] = getAxes(box);
  return (
    box.halfWidth * Math.abs(dot(widthAxis, axis)) +
    box.halfDepth * Math.abs(dot(depthAxis, axis))
  );
}

type Axis = Readonly<{
  x: number;
  z: number;
}>;

function dot(first: Axis, second: Axis): number {
  return first.x * second.x + first.z * second.z;
}
