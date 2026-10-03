import { describe, it, expect } from "vitest";
import { Game, POWER_TYPES, POWER_INFO } from "../shared/game";
import { bodyBlocked, distance } from "../shared/physics";
import { ready, input, run } from "./helpers";
describe("stored and active supplies", () => {
  it("spawns seven clear supplies including all five types on the fixed arena", () => {
    const g = new Game();
    expect(g.pickups).toHaveLength(7);
    for (const kind of POWER_TYPES)
      expect(g.pickups.some((p) => p.kind === kind)).toBe(true);
    for (const p of g.pickups) {
      expect(bodyBlocked(g.arena, p.x, p.y, p.z, 36)).toBe(false);
      expect(g.arena.spawns.every((s) => distance(p, s) > 250)).toBe(true);
    }
    const id = g.arena.id;
    g.phase = "finished";
    g.rematch();
    expect(g.arena.id).toBe(id);
  });
  it("stores a pickup without activating and uses it exactly once on E", () => {
    const { g, p } = ready();
    g.pickups = [{ id: 1, x: p.x, y: 0, z: p.z, kind: "double", readyAt: 0 }];
    g.tick(50);
    expect(p.storedPower).toBe("double");
    expect(p.power).toBeNull();
    input(g, p, { use: 1 });
    g.tick(50);
    expect(p.power).toBe("double");
    expect(p.powerUntil - g.now).toBe(4000);
    expect(p.storedPower).toBeNull();
    const until = p.powerUntil;
    input(g, p, { use: 1 });
    g.tick(50);
    expect(p.powerUntil).toBe(until);
  });
  it("requires F to replace a stored supply, and cannot stack active powers", () => {
    const { g, p } = ready();
    p.storedPower = "laser";
    p.power = "speed";
    p.powerUntil = g.now + 5000;
    g.pickups = [{ id: 1, x: p.x, y: 0, z: p.z, kind: "rapid", readyAt: 0 }];
    g.tick(50);
    expect(p.storedPower).toBe("laser");
    input(g, p, { swap: 1, use: 1 });
    g.tick(50);
    expect(p.storedPower).toBe("rapid");
    expect(p.power).toBe("speed");
    expect(g.pickups[0].readyAt - g.now).toBe(10000);
  });
  it("respawns a consumed supply at a different clear location after ten seconds", () => {
    const { g, p } = ready(false);
    g.pickups = [{ id: 1, x: p.x, y: p.y, z: p.z, kind: "shield", readyAt: 0 }];
    g.tick(50);
    const before = { ...g.pickups[0] };
    g.now = g.pickups[0].readyAt - 50;
    g.tick(50);
    expect(g.pickups[0].readyAt).toBe(0);
    expect(distance(before, g.pickups[0])).toBeGreaterThan(100);
  });
  it("uses individual durations and allows a new power after expiration", () => {
    for (const kind of POWER_TYPES) {
      const { g, p } = ready();
      p.storedPower = kind;
      input(g, p, { use: 1 });
      g.tick(50);
      expect(p.powerUntil - g.now).toBe(POWER_INFO[kind].duration);
      g.now = p.powerUntil - 50;
      g.tick(50);
      expect(p.power).toBeNull();
    }
  });
  it("double shot creates parallel bullets and rapid fire halves cooldown", () => {
    const { g, p } = ready();
    p.power = "double";
    p.powerUntil = g.now + 4000;
    input(g, p, { fire: true });
    g.tick(50);
    expect(g.bullets).toHaveLength(2);
    expect(Math.abs(g.bullets[0].z - g.bullets[1].z)).toBe(16);
    g.bullets = [];
    p.power = "rapid";
    p.nextShot = 0;
    input(g, p, { fire: true });
    g.tick(50);
    expect(p.nextShot - g.now).toBe(75);
  });
  it("speed increases movement while shield blocks damage until expiry", () => {
    const { g, p, q } = ready();
    p.power = "speed";
    p.powerUntil = g.now + 5000;
    input(g, p, { x: 1 });
    const x = p.x;
    g.tick(100);
    expect(p.x - x).toBeCloseTo(36);
    p.power = "shield";
    p.powerUntil = g.now + 2000;
    g.hit(p, { owner: q.id, team: 1 });
    expect(p.hp).toBe(100);
    g.now = p.powerUntil;
    g.hit(p, { owner: q.id, team: 1 });
    expect(p.hp).toBe(75);
  });
  it("laser pierces, reflects in 3D, and hits each enemy once per shot", () => {
    const { g, p, q } = ready();
    Object.assign(p, { x: 100, y: 0, z: 200, power: "laser", powerUntil: 1e9 });
    Object.assign(q, { x: 250, y: 0, z: 200 });
    g.arena.boxes = [
      { x: 400, y: 0, z: 100, w: 10, h: 300, d: 200, kind: "cover" },
      { x: 50, y: 0, z: 100, w: 10, h: 300, d: 200, kind: "cover" },
    ];
    input(g, p, { fire: true });
    g.tick(50);
    expect(q.hp).toBe(75);
    expect(g.beams).toHaveLength(4);
    const total = g.beams.reduce((n, b) => n + distance(b.start, b.end), 0);
    expect(total).toBeLessThanOrEqual(1600);
    expect(g.beams[1].end.x).toBeLessThan(g.beams[1].start.x);
  });
  it("laser reflects off a floor and cannot hurt its owner or allies", () => {
    const { g, p } = ready();
    p.power = "laser";
    p.powerUntil = 1e9;
    input(g, p, { fire: true, pitch: -0.6 });
    g.tick(50);
    expect(g.beams.length).toBeGreaterThan(1);
    expect(g.beams[1].end.y).toBeGreaterThan(g.beams[1].start.y);
    expect(p.hp).toBe(100);
    input(g, p, { fire: false });
    run(g, 200);
    expect(g.beams).toHaveLength(0);
  });
});
