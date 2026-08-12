export type CollisionPosition = Readonly<{
  x: number;
  z: number;
}>;

export type TankCollisionBody =
  | Readonly<{
      kind: "TANK";
      id: string;
      radius: number;
      getCenter: () => CollisionPosition;
    }>
  | Readonly<{
      kind: "BOX";
      id: string;
      center: CollisionPosition;
      halfWidth: number;
      halfDepth: number;
      rotationY: number;
      isActive?: () => boolean;
    }>;

/** Radius of the hull's conservative rotated footprint used for driving. */
export const CONSERVATIVE_ROTATED_HULL_RADIUS = 3.51;

export function isTankPositionBlocked(
  position: CollisionPosition,
  tankId: string,
  bodies: readonly TankCollisionBody[],
  tankRadius = CONSERVATIVE_ROTATED_HULL_RADIUS,
): boolean {
  return bodies.some((body) => {
    if (body.id === tankId) return false;
    if (body.kind === "BOX" && body.isActive && !body.isActive()) return false;

    return body.kind === "TANK"
      ? circlesIntersect(position, tankRadius, body.getCenter(), body.radius)
      : circleIntersectsBox(position, tankRadius, body);
  });
}

function circlesIntersect(
  firstCenter: CollisionPosition,
  firstRadius: number,
  secondCenter: CollisionPosition,
  secondRadius: number,
): boolean {
  const distanceX = firstCenter.x - secondCenter.x;
  const distanceZ = firstCenter.z - secondCenter.z;
  const minimumDistance = firstRadius + secondRadius;
  return (
    distanceX * distanceX + distanceZ * distanceZ <=
    minimumDistance * minimumDistance
  );
}

function circleIntersectsBox(
  circleCenter: CollisionPosition,
  circleRadius: number,
  box: Extract<TankCollisionBody, { kind: "BOX" }>,
): boolean {
  const offsetX = circleCenter.x - box.center.x;
  const offsetZ = circleCenter.z - box.center.z;
  const cosine = Math.cos(box.rotationY);
  const sine = Math.sin(box.rotationY);

  // Transform the circle center into the box's local XZ space.
  const localX = offsetX * cosine - offsetZ * sine;
  const localZ = offsetX * sine + offsetZ * cosine;
  const nearestX = clamp(localX, -box.halfWidth, box.halfWidth);
  const nearestZ = clamp(localZ, -box.halfDepth, box.halfDepth);
  const distanceX = localX - nearestX;
  const distanceZ = localZ - nearestZ;
  return (
    distanceX * distanceX + distanceZ * distanceZ <= circleRadius * circleRadius
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
