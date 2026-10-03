import { it, expect } from "vitest";
import { Game, type GameEvent } from "../shared/game";
import { EventCursor } from "../src/events";
import { movementAxes } from "../src/input";
it("establishes a fresh event baseline after returning to the foreground", () => {
  const s = new Game().snapshot(),
    cursor = new EventCursor();
  const event: GameEvent = {
    id: 1,
    time: 0,
    kind: "shot",
    actor: "a",
    team: 0,
    x: 0,
    y: 52,
    z: 0,
  };
  cursor.read(s);
  s.events = [event];
  cursor.reset();
  expect(cursor.read(s)).toEqual([]);
  s.events.push({ ...event, id: 2 });
  expect(cursor.read(s).map((e) => e.id)).toEqual([2]);
});
it("normalizes camera-relative diagonal movement at every aim angle", () => {
  for (let aim = -Math.PI; aim <= Math.PI; aim += 0.1) {
    const axes = movementAxes(aim, 1, 1);
    expect(Math.hypot(axes.x, axes.z)).toBeCloseTo(1);
    expect(Math.abs(axes.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(axes.z)).toBeLessThanOrEqual(1);
  }
});
it("skips join history, deduplicates snapshots and never replays background audio", () => {
  const s = new Game().snapshot(),
    cursor = new EventCursor();
  const event = (id: number, time = 0): GameEvent => ({
    id,
    time,
    kind: "shot",
    actor: "a",
    team: 0,
    x: 0,
    y: 52,
    z: 0,
  });
  s.events = [event(1)];
  expect(cursor.read(s)).toEqual([]);
  s.events.push(event(2));
  expect(cursor.read(s).map((e) => e.id)).toEqual([2]);
  expect(cursor.read(s)).toEqual([]);
  s.events.push(event(3));
  expect(cursor.read(s, false)).toEqual([]);
  expect(cursor.read(s)).toEqual([]);
  s.now = 1000;
  s.events.push(event(4, 0), event(5, 900));
  expect(cursor.read(s).map((e) => e.id)).toEqual([5]);
});
