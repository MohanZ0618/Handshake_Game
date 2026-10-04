import { describe, expect, it } from "vitest";
import { ready, input, run } from "./helpers";

describe("central power sniper", () => {
  it("spawns centrally, can scope, and one shot penetrates full defenses", () => {
    const { g, p, q } = ready();
    Object.assign(p, { x: 1200, z: 800, aim: Math.PI / 2 });
    Object.assign(q, { x: 1200, z: 1000, armor: 100, hp: 100, shieldUntil: 0 });
    input(g, p, { aim: Math.PI / 2, ads: true });
    g.tick(50);
    expect(g.sniper.available).toBe(false);
    expect(p.ammo.sniper).toBe(5);
    expect(p.weapon).toBe("sniper");
    input(g, p, { weapon: "sniper", aim: Math.PI / 2, ads: true });
    run(g, 250);
    input(g, p, { weapon: "sniper", aim: Math.PI / 2, ads: true, fire: true });
    g.tick(50);
    expect(q.hp).toBe(0);
    expect(g.beams.some((b) => b.weapon === "sniper")).toBe(true);
    expect(p.ammo.sniper).toBe(4);
  });
  it("drops remaining ammunition on death, then expires and respawns centrally", () => {
    const { g, p, q } = ready();
    Object.assign(p, { x: 1200, z: 800 });
    input(g, p);
    g.tick(50);
    input(g, p, { weapon: "sniper", reload: 1 });
    g.tick(50);
    expect(p.reloadUntil).toBe(0);
    expect(p.ammo.sniper).toBe(5);
    g.hit(p, { owner: q.id, team: q.team, damage: 200 });
    expect(p.ammo.sniper).toBe(0);
    expect(g.sniper).toMatchObject({ available: true, ammo: 5, x: 1200, z: 800 });
    run(g, 20_050);
    expect(g.sniper.available).toBe(false);
    expect(g.sniper.readyAt).toBeGreaterThan(g.now);
    run(g, 30_000);
    expect(g.sniper).toMatchObject({ available: true, ammo: 5, x: 1200, z: 800 });
    expect(g.events.some((e) => e.kind === "sniper-spawn")).toBe(true);
  });
  it("allows another player to recover dropped rounds", () => {
    const { g, p, q } = ready();
    Object.assign(p, { x: 1200, z: 800 });
    input(g, p);
    g.tick(50);
    g.hit(p, { owner: q.id, team: q.team, damage: 200 });
    Object.assign(q, { x: 1200, z: 800 });
    input(g, q);
    g.tick(50);
    expect(q.ammo.sniper).toBe(5);
    expect(g.sniper.available).toBe(false);
  });
  it("drops the remaining rounds when a carrier leaves the room", () => {
    const { g, p } = ready();
    Object.assign(p, { x: 1200, z: 800 });
    input(g, p);
    g.tick(50);
    expect(p.ammo.sniper).toBe(5);
    g.removeHuman(p.id);
    expect(g.sniper).toMatchObject({ available: true, ammo: 5, x: 1200, z: 800 });
    expect(g.sniper.expiresAt).toBe(g.now + 20_000);
  });
  it("has only five shots, ignores reload, and waits thirty seconds to return", () => {
    const { g, p } = ready();
    Object.assign(p, { x: 1200, z: 800, aim: 0 });
    input(g, p);
    g.tick(50);
    for (let n = 0; n < 160; n++) {
      input(g, p, { weapon: "sniper", aim: 0, ads: true, fire: true });
      g.tick(50);
    }
    expect(p.ammo.sniper).toBe(0);
    expect(p.weapon).toBe("rifle");
    expect(g.sniper.available).toBe(false);
    expect(g.sniper.readyAt).toBeGreaterThan(g.now);
    input(g, p, { weapon: "sniper", fire: false });
    g.tick(50);
    expect(p.ammo.sniper).toBe(0);
    Object.assign(p, { x: 200, z: 200 });
    run(g, 30_000);
    expect(g.sniper.available).toBe(true);
  });
});
