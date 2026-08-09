import type { ArmorFacetId } from "../tank/armor";
import type { HitOutcome, Vector3 } from "./ballistics";
import type { HitCategory, ObjectHitOutcome } from "./impacts";

export type GameEvents = {
  SHOT_FIRED: { shellId: string; tank: string; muzzlePosition: Vector3; direction: Vector3 };
  SHELL_MOVED: { shellId: string; position: Vector3 };
  SHELL_DESPAWNED: { shellId: string; position: Vector3 };
  HIT: { shellId: string; outcome: HitOutcome; facetId: ArmorFacetId; point: Vector3; normal: Vector3; impactAngleDegrees: number; nominalThickness: number; effectiveThickness: number; penetration: number };
  OBJECT_HIT: { targetId: string; category: HitCategory.HARD | HitCategory.SOFT; outcome: ObjectHitOutcome; point: Vector3; normal: Vector3; incoming: Vector3; impactAngleDegrees: number | null };
  RICOCHET: { shellId: string; point: Vector3; incoming: Vector3; outgoing: Vector3; retainedSpeed: number };
  DRIVE_STATE: { acceleration: number; turnRate: number; speed: number };
};

export class GameEventBus {
  private readonly listeners = new Map<keyof GameEvents, Set<(event: never) => void>>();

  on<K extends keyof GameEvents>(type: K, listener: (event: GameEvents[K]) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as never);
    this.listeners.set(type, set);
    return () => set.delete(listener as never);
  }

  emit<K extends keyof GameEvents>(type: K, event: GameEvents[K]): void {
    this.listeners.get(type)?.forEach((listener) => listener(event as never));
  }
}
