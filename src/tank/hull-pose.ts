import type { TankEntity } from "./tank";

export type HullPoseOffset = Readonly<{
  pitchRadians: number;
  rollRadians: number;
}>;

const ZERO_OFFSET: HullPoseOffset = Object.freeze({
  pitchRadians: 0,
  rollRadians: 0,
});

/** The only writer that composes additive pitch and roll onto the hull root. */
export class HullPoseComposer {
  private readonly sources = new Map<string, HullPoseOffset>();
  private applied: HullPoseOffset = ZERO_OFFSET;

  constructor(private readonly tank: TankEntity) {}

  setSource(source: string, offset: HullPoseOffset): void {
    this.sources.set(source, Object.freeze({ ...offset }));
  }

  clearSource(source: string): void {
    this.sources.delete(source);
  }

  apply(): HullPoseOffset {
    const composed = [...this.sources.values()].reduce<HullPoseOffset>(
      (total, offset) => ({
        pitchRadians: total.pitchRadians + offset.pitchRadians,
        rollRadians: total.rollRadians + offset.rollRadians,
      }),
      ZERO_OFFSET,
    );
    this.tank.root.rotation.x += composed.pitchRadians - this.applied.pitchRadians;
    this.tank.root.rotation.z += composed.rollRadians - this.applied.rollRadians;
    this.applied = composed;
    return composed;
  }

  dispose(): void {
    this.sources.clear();
    this.apply();
  }
}
