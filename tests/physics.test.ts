import { describe, it, expect } from "vitest";
import { createArena } from "../shared/arena";
import { moveBody, rayWorld, bodyBlocked, type Body } from "../shared/physics";
import { Navigation } from "../shared/navigation";
const body = (x = 1200, z = 90, y = 0): Body => ({
  x,
  y,
  z,
  vy: 0,
  grounded: true,
  dashUntil: 0,
  dashReadyAt: 0,
  dashX: 0,
  dashZ: 0,
});
const idle = { x: 0, z: 0, aim: 0, jump: false, dash: false };
describe("3D geometry and navigation", () => {
  it("walks up and down all four ramps without penetrating the floor edge", () => {
    const a = createArena();
    for (const r of a.ramps) {
      const sign = r.reverse ? -1 : 1,
        axis = r.axis;
      const p = body(
        r.x + (axis === "x" ? (r.reverse ? r.w + 30 : -30) : r.w / 2),
        r.z + (axis === "z" ? (r.reverse ? r.d + 30 : -30) : r.d / 2),
      );
      const i = { ...idle, [axis]: sign };
      for (
        let t = 0;
        t < (((axis === "x" ? r.w : r.d) + 85) / 240) * 1000;
        t += 50
      )
        moveBody(p, i, a, 50, t);
      expect(p.y).toBeCloseTo(140);
      expect(bodyBlocked(a, p.x, p.y, p.z)).toBe(false);
      for (let t = 3000; t < 6500; t += 50)
        moveBody(p, { ...idle, [axis]: -sign }, a, 50, t);
      expect(p.y).toBeCloseTo(0);
    }
  });
  it("jumps only on ground, lands, and keeps gravity during an air dash", () => {
    const a = { ...createArena(), boxes: [], ramps: [] },
      p = body(200, 200);
    moveBody(p, { ...idle, jump: true }, a, 50, 0);
    expect(p.y).toBeGreaterThan(0);
    const velocity = p.vy;
    moveBody(p, { ...idle, jump: true, dash: true, x: 1 }, a, 50, 50);
    expect(p.vy).toBeLessThan(velocity);
    for (let t = 100; t < 1000; t += 50) moveBody(p, idle, a, 50, t);
    expect(p.grounded).toBe(true);
    expect(p.y).toBe(0);
  });
  it("can jump over a 32-unit crate but not through a ceiling", () => {
    const a = {
        ...createArena(),
        boxes: [
          {
            x: 300,
            y: 0,
            z: 100,
            w: 70,
            h: 32,
            d: 200,
            kind: "cover" as const,
          },
        ],
        ramps: [],
      },
      p = body(250, 200);
    moveBody(p, { ...idle, jump: true, x: 1 }, a, 50, 0);
    for (let t = 50; t < 900; t += 50) moveBody(p, { ...idle, x: 1 }, a, 50, t);
    expect(p.x).toBeGreaterThan(400);
    const under = body(200, 200);
    a.boxes = [{ x: 100, y: 75, z: 100, w: 300, h: 16, d: 300, kind: "cover" }];
    for (let t = 0; t < 400; t += 50)
      moveBody(under, { ...idle, jump: t === 0 }, a, 50, t);
    expect(under.y).toBeLessThanOrEqual(15);
  });
  it("falls through the central opening and lands on ground", () => {
    const a = createArena(),
      p = body(1200, 600, 140);
    for (let t = 0; t < 2000; t += 50) moveBody(p, { ...idle, z: 1 }, a, 50, t);
    expect(p.y).toBe(0);
    expect(p.grounded).toBe(true);
  });
  it("raycasts slabs and ramp surfaces with reflection normals", () => {
    const a = createArena();
    const slab = rayWorld(
      a,
      { x: 1200, y: 50, z: 500 },
      { x: 0, y: 1, z: 0 },
      200,
    );
    expect(slab?.point.y).toBeCloseTo(124);
    const ramp = rayWorld(
      a,
      { x: 1200, y: 200, z: 275 },
      { x: 0, y: -1, z: 0 },
      250,
    );
    expect(ramp?.point.y).toBeCloseTo(70);
    expect(ramp!.normal.y).toBeGreaterThan(0.9);
    expect(ramp!.normal.z).toBeLessThan(0);
  });
  it("connects every spawn to both levels and all usable supply positions", () => {
    const a = createArena(),
      nav = new Navigation(a);
    for (const spawn of a.spawns) {
      const path = nav.path(spawn, { x: 1200, y: 140, z: 550 });
      expect(path.length).toBeGreaterThan(0);
      expect(path.some((p) => p.y > 0 && p.y < 140)).toBe(true);
    }
    for (const point of a.supplies.filter(
      (p) => !bodyBlocked(a, p.x, p.y, p.z, 36),
    )) {
      expect(
        nav.path(a.spawns[0], point).length,
        JSON.stringify(point),
      ).toBeGreaterThan(0);
    }
  });
});
