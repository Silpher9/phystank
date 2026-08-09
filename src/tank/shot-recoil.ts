import type { GameEventBus } from "../core/events";
import type { HullPoseComposer } from "./hull-pose";
import type { TankEntity } from "./tank";

export const SHOT_RECOIL_TUNING = {
  BARREL_TRAVEL: 0.62,
  ATTACK_SECONDS: 0.045,
  SETTLE_SECONDS: 0.34,
  HULL_KICK_DEGREES: 1.5,
  HULL_ATTACK_SECONDS: 0.035,
  HULL_SETTLE_SECONDS: 0.24,
} as const;

export type ShotRecoilTarget = Readonly<{
  tank: TankEntity;
  hullPose: HullPoseComposer;
}>;

type RecoilState = {
  readonly tank: TankEntity;
  readonly hullPose: HullPoseComposer;
  elapsed: number;
  appliedBarrelOffset: number;
  active: boolean;
};

/** Adds and removes only its own local barrel offset, so other motion composes safely. */
export class ShotRecoilSystem {
  private readonly states = new Map<string, RecoilState>();
  private readonly unsubscribe: () => void;

  constructor(events: GameEventBus, targets: readonly ShotRecoilTarget[]) {
    for (const { tank, hullPose } of targets) {
      this.states.set(tank.root.name, {
        tank,
        hullPose,
        elapsed: 0,
        appliedBarrelOffset: 0,
        active: false,
      });
    }
    this.unsubscribe = events.on("SHOT_FIRED", ({ tank }) => this.trigger(tank));
  }

  update(deltaSeconds: number): void {
    for (const state of this.states.values()) {
      if (!state.active) continue;

      state.elapsed += deltaSeconds;
      const nextOffset = barrelOffsetAt(state.elapsed);
      state.tank.cannon.position.z += nextOffset - state.appliedBarrelOffset;
      state.appliedBarrelOffset = nextOffset;
      state.hullPose.setSource("shot-recoil", {
        pitchRadians: hullKickPitchAt(state.elapsed),
        rollRadians: 0,
      });

      if (state.elapsed >= effectDuration()) {
        this.removeAppliedOffset(state);
        state.hullPose.clearSource("shot-recoil");
        state.active = false;
      }
    }
  }

  dispose(): void {
    this.unsubscribe();
    for (const state of this.states.values()) {
      this.removeAppliedOffset(state);
      state.hullPose.clearSource("shot-recoil");
    }
  }

  private trigger(tankName: string): void {
    const state = this.states.get(tankName);
    if (!state) return;
    state.elapsed = 0;
    state.active = true;
  }

  private removeAppliedOffset(state: RecoilState): void {
    state.tank.cannon.position.z -= state.appliedBarrelOffset;
    state.appliedBarrelOffset = 0;
  }
}

export function barrelOffsetAt(elapsedSeconds: number): number {
  return dampedOffsetAt(
    elapsedSeconds,
    SHOT_RECOIL_TUNING.BARREL_TRAVEL,
    SHOT_RECOIL_TUNING.ATTACK_SECONDS,
    SHOT_RECOIL_TUNING.SETTLE_SECONDS,
  );
}

export function hullKickPitchAt(elapsedSeconds: number): number {
  return dampedOffsetAt(
    elapsedSeconds,
    SHOT_RECOIL_TUNING.HULL_KICK_DEGREES * Math.PI / 180,
    SHOT_RECOIL_TUNING.HULL_ATTACK_SECONDS,
    SHOT_RECOIL_TUNING.HULL_SETTLE_SECONDS,
  );
}

function dampedOffsetAt(
  elapsedSeconds: number,
  amplitude: number,
  attackSeconds: number,
  settleSeconds: number,
): number {
  if (elapsedSeconds <= 0) return 0;
  if (elapsedSeconds < attackSeconds) {
    const progress = elapsedSeconds / attackSeconds;
    return amplitude * (1 - (1 - progress) ** 3);
  }

  const settleElapsed = elapsedSeconds - attackSeconds;
  if (settleElapsed >= settleSeconds) return 0;
  const progress = settleElapsed / settleSeconds;
  const envelope = (1 - progress) ** 2;
  return amplitude * envelope * Math.cos(progress * Math.PI * 1.5);
}

function effectDuration(): number {
  return Math.max(
    SHOT_RECOIL_TUNING.ATTACK_SECONDS + SHOT_RECOIL_TUNING.SETTLE_SECONDS,
    SHOT_RECOIL_TUNING.HULL_ATTACK_SECONDS + SHOT_RECOIL_TUNING.HULL_SETTLE_SECONDS,
  );
}
