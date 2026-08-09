import type { GameEventBus } from "../core/events";
import type { TankEntity } from "./tank";

export const SHOT_RECOIL_TUNING = {
  BARREL_TRAVEL: 0.62,
  ATTACK_SECONDS: 0.045,
  SETTLE_SECONDS: 0.34,
} as const;

type RecoilState = {
  readonly tank: TankEntity;
  elapsed: number;
  appliedBarrelOffset: number;
  active: boolean;
};

/** Adds and removes only its own local barrel offset, so other motion composes safely. */
export class ShotRecoilSystem {
  private readonly states = new Map<string, RecoilState>();
  private readonly unsubscribe: () => void;

  constructor(events: GameEventBus, tanks: readonly TankEntity[]) {
    for (const tank of tanks) {
      this.states.set(tank.root.name, {
        tank,
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

      if (state.elapsed >= recoilDuration()) {
        this.removeAppliedOffset(state);
        state.active = false;
      }
    }
  }

  dispose(): void {
    this.unsubscribe();
    for (const state of this.states.values()) this.removeAppliedOffset(state);
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
  if (elapsedSeconds <= 0) return 0;
  if (elapsedSeconds < SHOT_RECOIL_TUNING.ATTACK_SECONDS) {
    const progress = elapsedSeconds / SHOT_RECOIL_TUNING.ATTACK_SECONDS;
    return SHOT_RECOIL_TUNING.BARREL_TRAVEL * (1 - (1 - progress) ** 3);
  }

  const settleElapsed = elapsedSeconds - SHOT_RECOIL_TUNING.ATTACK_SECONDS;
  if (settleElapsed >= SHOT_RECOIL_TUNING.SETTLE_SECONDS) return 0;
  const progress = settleElapsed / SHOT_RECOIL_TUNING.SETTLE_SECONDS;
  const envelope = (1 - progress) ** 2;
  return SHOT_RECOIL_TUNING.BARREL_TRAVEL
    * envelope
    * Math.cos(progress * Math.PI * 1.5);
}

function recoilDuration(): number {
  return SHOT_RECOIL_TUNING.ATTACK_SECONDS + SHOT_RECOIL_TUNING.SETTLE_SECONDS;
}
