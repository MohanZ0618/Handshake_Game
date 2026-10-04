import { describe, expect, it } from "vitest";
import { ready, input, run } from "./helpers";
const hold = (
  g: ReturnType<typeof ready>["g"],
  p: ReturnType<typeof ready>["p"],
  ms: number,
) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    input(g, p, { charge: true });
    g.tick(50);
  }
};

describe("shield cells and impacts", () => {
  it("spawns four reachable central cells and recharges after an uninterrupted hold", () => {
    const { g, p } = ready();
    expect(g.batteries).toHaveLength(4);
    const site = g.batteries[0];
    Object.assign(p, { x: site.x, y: site.y, z: site.z, hp: 50, armor: 20 });
    g.tick(50);
    expect(p.battery).toBe(true);
    expect(site.readyAt).toBe(g.now + 20_000);
    hold(g, p, 1450);
    expect(p.hp).toBe(50);
    hold(g, p, 100);
    expect(p.hp).toBe(100);
    expect(p.armor).toBe(100);
    expect(p.battery).toBe(false);
    expect(p.chargesCompleted).toBe(1);
    expect(g.events.some((e) => e.kind === "charge" && e.actor === p.id)).toBe(
      true,
    );
    p.x += 100;
    run(g, 18_500);
    expect(site.readyAt).toBe(0);
  });
  it("interrupts on release or damage and requires a new key press", () => {
    const { g, p, q } = ready();
    p.battery = true;
    p.armor = 20;
    hold(g, p, 600);
    input(g, p, { charge: false });
    g.tick(50);
    expect(p.chargeStart).toBe(-1);
    hold(g, p, 400);
    g.hit(p, { owner: q.id, team: q.team });
    expect(p.chargeLocked).toBe(true);
    hold(g, p, 1800);
    expect(p.battery).toBe(true);
    input(g, p, { charge: false });
    g.tick(50);
    hold(g, p, 1600);
    expect(p.battery).toBe(false);
  });
  it("absorbs damage with armor before health and emits a bounded impact event", () => {
    const { g, p, q } = ready(false);
    p.armor = 100;
    g.hit(p, { owner: q.id, team: q.team });
    expect([p.hp, p.armor]).toEqual([100, 75]);
    p.armor = 10;
    g.hit(p, { owner: q.id, team: q.team });
    expect([p.hp, p.armor]).toEqual([85, 0]);
    Object.assign(p, { x: 200, z: 200, aim: Math.PI, nextShot: 0 });
    input(g, p, { aim: Math.PI, fire: true });
    run(g, 450);
    const impact = g.events.find(
      (e) => e.kind === "impact" && e.actor === p.id,
    );
    expect(impact?.normal).toBeDefined();
  });
});
