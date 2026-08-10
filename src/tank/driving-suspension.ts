import type { GameEventBus } from "../core/events";
import { CONTROL_TUNING } from "./controls";
import type { HullPoseComposer, HullPoseOffset } from "./hull-pose";

const SOURCE_NAME = "driving-suspension";
const DEGREES_TO_RADIANS = Math.PI / 180;

export const DRIVING_SUSPENSION_TUNING = {
  MAX_PITCH_DEGREES: 5.5,
  MAX_ROLL_DEGREES: 5.5,
  SPEED_FILTER_RATE: 4,
  TURN_FILTER_RATE: 7,
  POSE_RESPONSE_RATE: 12,
  SPEED_SNAP_THRESHOLD: 0.005,
  TURN_SNAP_THRESHOLD: 0.0005,
  POSE_SNAP_THRESHOLD_RADIANS: 0.00001,
} as const;

/**
 * Converts drive state into a bounded hull pose.
 *
 * Pitch uses the high-pass difference between commanded and filtered speed, so
 * acceleration and braking are transient. Roll follows filtered turn rate and
 * can remain present throughout a steady turn.
 */
export class DrivingSuspensionSystem {
  private rawSpeed = 0;
  private filteredSpeed = 0;
  private rawTurnRate = 0;
  private filteredTurnRate = 0;
  private pitchRadians = 0;
  private rollRadians = 0;
  private readonly unsubscribe: () => void;

  constructor(
    events: GameEventBus,
    private readonly hullPose: HullPoseComposer,
  ) {
    this.unsubscribe = events.on("DRIVE_STATE", ({ speed, turnRate }) => {
      this.rawSpeed = speed;
      this.rawTurnRate = turnRate;
    });
  }

  update(deltaSeconds: number): HullPoseOffset {
    if (deltaSeconds <= 0) return this.currentOffset();

    this.filteredSpeed = filterAndSnap(
      this.filteredSpeed,
      this.rawSpeed,
      DRIVING_SUSPENSION_TUNING.SPEED_FILTER_RATE,
      DRIVING_SUSPENSION_TUNING.SPEED_SNAP_THRESHOLD,
      deltaSeconds,
    );
    this.filteredTurnRate = filterAndSnap(
      this.filteredTurnRate,
      this.rawTurnRate,
      DRIVING_SUSPENSION_TUNING.TURN_FILTER_RATE,
      DRIVING_SUSPENSION_TUNING.TURN_SNAP_THRESHOLD,
      deltaSeconds,
    );

    const maximumPitch = DRIVING_SUSPENSION_TUNING.MAX_PITCH_DEGREES * DEGREES_TO_RADIANS;
    const maximumRoll = DRIVING_SUSPENSION_TUNING.MAX_ROLL_DEGREES * DEGREES_TO_RADIANS;
    const pitchTarget = clamp(
      (this.rawSpeed - this.filteredSpeed) / CONTROL_TUNING.DRIVE_SPEED * maximumPitch,
      -maximumPitch,
      maximumPitch,
    );
    const rollTarget = clamp(
      -this.filteredTurnRate / CONTROL_TUNING.HULL_TURN_SPEED * maximumRoll,
      -maximumRoll,
      maximumRoll,
    );

    this.pitchRadians = poseTowards(this.pitchRadians, pitchTarget, deltaSeconds);
    this.rollRadians = poseTowards(this.rollRadians, rollTarget, deltaSeconds);

    const offset = this.currentOffset();
    if (offset.pitchRadians === 0 && offset.rollRadians === 0) {
      this.hullPose.clearSource(SOURCE_NAME);
    } else {
      this.hullPose.setSource(SOURCE_NAME, offset);
    }
    return offset;
  }

  dispose(): void {
    this.unsubscribe();
    this.hullPose.clearSource(SOURCE_NAME);
  }

  private currentOffset(): HullPoseOffset {
    return {
      pitchRadians: this.pitchRadians,
      rollRadians: this.rollRadians,
    };
  }
}

function filterAndSnap(
  current: number,
  target: number,
  responseRate: number,
  snapThreshold: number,
  deltaSeconds: number,
): number {
  const filtered = damp(current, target, responseRate, deltaSeconds);
  return Math.abs(target - filtered) <= snapThreshold ? target : filtered;
}

function poseTowards(current: number, target: number, deltaSeconds: number): number {
  const next = damp(current, target, DRIVING_SUSPENSION_TUNING.POSE_RESPONSE_RATE, deltaSeconds);
  return Math.abs(next) <= DRIVING_SUSPENSION_TUNING.POSE_SNAP_THRESHOLD_RADIANS && target === 0
    ? 0
    : next;
}

function damp(current: number, target: number, responseRate: number, deltaSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-responseRate * deltaSeconds));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
