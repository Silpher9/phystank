import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HitOutcome, type Vector3 as EventVector3 } from "../core/ballistics";
import type { GameEventBus } from "../core/events";
import type { HullPoseComposer, HullPoseOffset } from "./hull-pose";
import type { TankEntity } from "./tank";

const SOURCE_NAME = "hit-suspension";
const DEGREES_TO_RADIANS = Math.PI / 180;

export const HIT_SUSPENSION_PROFILES = {
  [HitOutcome.PENETRATION]: { amplitudeDegrees: 2.5, settleSeconds: 0.32 },
  [HitOutcome.SHATTER]: { amplitudeDegrees: 1.6, settleSeconds: 0.24 },
  [HitOutcome.RICOCHET]: { amplitudeDegrees: 0.9, settleSeconds: 0.18 },
} as const;

export const HIT_SUSPENSION_ATTACK_SECONDS = 0.035;

export type HitSuspensionTarget = Readonly<{
  tank: TankEntity;
  hullPose: HullPoseComposer;
}>;

type HitSuspensionState = {
  readonly tank: TankEntity;
  readonly hullPose: HullPoseComposer;
  elapsed: number;
  outcome: HitOutcome;
  localIncoming: Vector3;
  active: boolean;
};

/** Adds a short receiving-hull tilt in the shell's direction of travel. */
export class HitSuspensionSystem {
  private readonly states = new Map<string, HitSuspensionState>();
  private readonly unsubscribes: readonly (() => void)[];

  constructor(events: GameEventBus, targets: readonly HitSuspensionTarget[]) {
    for (const { tank, hullPose } of targets) {
      this.states.set(tank.root.name, {
        tank,
        hullPose,
        elapsed: 0,
        outcome: HitOutcome.RICOCHET,
        localIncoming: Vector3.Zero(),
        active: false,
      });
    }
    this.unsubscribes = [
      events.on("HIT", ({ tank, incoming, outcome }) => {
        // Armor ricochets carry their continuation event immediately after HIT.
        if (outcome !== HitOutcome.RICOCHET) this.trigger(tank, incoming, outcome);
      }),
      events.on("RICOCHET", ({ tank, incoming }) => {
        if (tank) this.trigger(tank, incoming, HitOutcome.RICOCHET);
      }),
    ];
  }

  update(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    for (const state of this.states.values()) {
      if (!state.active) continue;
      state.elapsed += deltaSeconds;
      const offset = hitSuspensionOffsetAt(state.elapsed, state.localIncoming, state.outcome);
      state.hullPose.setSource(SOURCE_NAME, offset);

      if (state.elapsed >= effectDuration(state.outcome)) {
        state.hullPose.clearSource(SOURCE_NAME);
        state.active = false;
      }
    }
  }

  dispose(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    for (const state of this.states.values()) state.hullPose.clearSource(SOURCE_NAME);
  }

  private trigger(tankName: string, incoming: EventVector3, outcome: HitOutcome): void {
    const state = this.states.get(tankName);
    if (!state) return;
    const worldIncoming = new Vector3(incoming.x, incoming.y, incoming.z);
    if (worldIncoming.lengthSquared() === 0) return;

    const inverseWorld = Matrix.Invert(state.tank.root.computeWorldMatrix(true));
    state.localIncoming = Vector3.TransformNormal(worldIncoming, inverseWorld).normalize();
    state.elapsed = 0;
    state.outcome = outcome;
    state.active = true;
  }
}

export function hitSuspensionOffsetAt(
  elapsedSeconds: number,
  localIncoming: Readonly<{ x: number; y: number; z: number }>,
  outcome: HitOutcome,
): HullPoseOffset {
  const profile = HIT_SUSPENSION_PROFILES[outcome];
  const amplitude = profile.amplitudeDegrees * DEGREES_TO_RADIANS;
  const envelope = dampedEnvelopeAt(elapsedSeconds, profile.settleSeconds);
  return {
    pitchRadians: localIncoming.z * amplitude * envelope,
    rollRadians: -localIncoming.x * amplitude * envelope,
  };
}

function dampedEnvelopeAt(elapsedSeconds: number, settleSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  if (elapsedSeconds < HIT_SUSPENSION_ATTACK_SECONDS) {
    const progress = elapsedSeconds / HIT_SUSPENSION_ATTACK_SECONDS;
    return 1 - (1 - progress) ** 3;
  }

  const settleElapsed = elapsedSeconds - HIT_SUSPENSION_ATTACK_SECONDS;
  if (settleElapsed >= settleSeconds) return 0;
  const progress = settleElapsed / settleSeconds;
  return (1 - progress) ** 2 * Math.cos(progress * Math.PI * 1.5);
}

function effectDuration(outcome: HitOutcome): number {
  return HIT_SUSPENSION_ATTACK_SECONDS + HIT_SUSPENSION_PROFILES[outcome].settleSeconds;
}
