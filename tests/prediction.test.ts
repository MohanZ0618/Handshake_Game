import { it, expect } from "vitest";
import { Prediction, Interpolation, constrainCamera } from "../src/prediction";
import { idleInput } from "../shared/game";
import { ready } from "./helpers";
it("continuous prediction is independent of render frame rate and replays actual unacknowledged durations", () => {
  const { g, p } = ready();
  const s = g.snapshot();
  for (const fps of [30, 60, 144]) {
    const prediction = new Prediction(g.arena);
    prediction.accept(p, s);
    for (let n = 0; n < fps; n++)
      prediction.step({ ...idleInput(), x: 1 }, 1000 / fps);
    expect(prediction.body!.x).toBeCloseTo(p.x + 240, 3);
  }
  const prediction = new Prediction(g.arena);
  prediction.accept(p, s);
  prediction.step({ ...idleInput(), x: 1 }, 17);
  prediction.step({ ...idleInput(), seq: 1, x: 1 }, 33);
  prediction.accept({ ...p, ack: 1, x: p.x + 4.08 }, { ...s, now: s.now + 17 });
  expect(prediction.body!.x).toBeCloseTo(p.x + 12);
});
it("smooths small visual errors while hard resetting large errors, respawn and rounds", () => {
  const { g, p } = ready();
  const prediction = new Prediction(g.arena);
  const s = g.snapshot();
  prediction.accept(p, s);
  prediction.accept({ ...p, x: p.x + 10 }, { ...s, now: s.now + 50 });
  expect(prediction.body!.x).toBe(p.x + 10);
  expect(prediction.display().x).toBe(p.x);
  prediction.step(idleInput(), 100, false);
  expect(prediction.display().x).toBeGreaterThan(p.x + 9);
  prediction.accept({ ...p, x: p.x + 100 }, s);
  expect(prediction.display().x).toBe(p.x + 100);
  prediction.accept({ ...p, life: p.life + 1 }, s);
  expect(prediction.display().x).toBe(p.x);
});
it("sorts jittered snapshots, interpolates at 100 ms and caps extrapolation at 50 ms", () => {
  const { g, p } = ready();
  const s = g.snapshot();
  const buffer = new Interpolation();
  for (const n of [0, 100, 50])
    buffer.push({ ...s, now: n, players: [{ ...p, x: n + 200 }] });
  expect(buffer.sample(p.id, 175)!.x).toBe(275);
  expect(buffer.sample(p.id, 225)!.x).toBe(325);
  expect(buffer.sample(p.id, 500)!.x).toBe(350);
  buffer.push({
    ...s,
    now: 150,
    players: [{ ...p, life: p.life + 1, x: 1000 }],
  });
  expect(buffer.sample(p.id, 225)!.x).toBe(1000);
});
it("camera sweep cannot cross a wall, floor or ramp during smoothing", () => {
  const { g } = ready();
  g.arena.boxes = [
    { x: 250, y: 0, z: 100, w: 20, h: 200, d: 300, kind: "cover" },
  ];
  const safe = constrainCamera(
    g.arena,
    { x: 240, y: 52, z: 200 },
    { x: 280, y: 52, z: 200 },
  );
  expect(safe.x).toBeLessThanOrEqual(248);
  g.arena.boxes = [
    { x: 100, y: 124, z: 100, w: 300, h: 16, d: 300, kind: "floor" },
  ];
  expect(
    constrainCamera(
      g.arena,
      { x: 200, y: 110, z: 200 },
      { x: 200, y: 160, z: 200 },
    ).y,
  ).toBeLessThanOrEqual(122);
  g.arena.boxes = [];
  g.arena.ramps = [
    { x: 100, z: 100, w: 200, d: 200, axis: "x", reverse: false, height: 140 },
  ];
  expect(
    constrainCamera(
      g.arena,
      { x: 110, y: 30, z: 200 },
      { x: 280, y: 30, z: 200 },
    ).x,
  ).toBeLessThan(160);
});
