import { describe, expect, it } from "vitest";
import { GameEventBus } from "./events";
describe("GameEventBus", () => it("notifies multiple listeners and unsubscribes", () => {
  const bus = new GameEventBus(); let first = 0; let second = 0;
  const off = bus.on("DRIVE_STATE", () => first++); bus.on("DRIVE_STATE", () => second++);
  bus.emit("DRIVE_STATE", { acceleration: 1, turnRate: 0, speed: 2 }); off();
  bus.emit("DRIVE_STATE", { acceleration: 1, turnRate: 0, speed: 2 });
  expect(first).toBe(1); expect(second).toBe(2);
}));
