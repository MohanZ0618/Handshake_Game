import { describe, it, expect } from "vitest";
import {
  Game,
  ROUND_MS,
  BREAK_MS,
  idleInput,
  validInput,
} from "../shared/game";
import { ready, input, run } from "./helpers";
describe("authoritative 3D game rules", () => {
  it("simulates every tick of a full eight-robot match and restarts cleanly", () => {
    const g = new Game(() => 0.5);
    const phases = new Set<string>();
    for (let i = 0; i < (ROUND_MS * 3 + BREAK_MS * 2) / 50; i++) {
      g.tick(50);
      phases.add(`${g.round}:${g.phase}`);
      for (const p of g.players) {
        expect(Number.isFinite(p.x + p.y + p.z + p.vy)).toBe(true);
        expect(p.hp).toBeGreaterThanOrEqual(0);
        expect(p.hp).toBeLessThanOrEqual(100);
      }
    }
    expect(phases).toEqual(
      new Set([
        "1:playing",
        "1:intermission",
        "2:playing",
        "2:intermission",
        "3:playing",
        "3:finished",
      ]),
    );
    expect(g.scores.reduce((sum, score) => sum + score, 0)).toBeGreaterThan(0);
    for (let team = 0; team < 4; team++)
      expect(g.scores[team]).toBe(
        g.players
          .filter((p) => p.team === team)
          .reduce((sum, p) => sum + p.score, 0),
      );
    expect(g.bullets).toEqual([]);
    expect(g.beams).toEqual([]);
    g.rematch();
    expect(g.phase).toBe("playing");
    expect(g.round).toBe(1);
    expect(g.scores).toEqual([0, 0, 0, 0]);
    expect(
      g.players.every(
        (p) =>
          p.hp === 100 && !p.power && !p.storedPower && p.dashReadyAt === 0,
      ),
    ).toBe(true);
  }, 30_000);
  it("actually routes a robot up a ramp to engage an upstairs enemy", () => {
    const g = new Game(() => 0.5),
      bot = g.players[0],
      target = g.addHuman("target", "Target", 1);
    g.pickups = [];
    for (const p of g.players)
      if (p !== bot && p !== target) {
        p.hp = 0;
        p.respawnAt = 1e9;
      }
    Object.assign(target, { x: 1200, y: 140, z: 550, shieldUntil: 1e9 });
    let maxY = 0;
    for (let i = 0; i < 800; i++) {
      g.tick(50);
      maxY = Math.max(maxY, bot.y);
    }
    expect(maxY).toBe(140);
  });
  it("robots reach and collect supplies located between navigation nodes", () => {
    const g = new Game(() => 0.5),
      bot = g.players[0];
    for (const p of g.players)
      if (p !== bot) {
        p.hp = 0;
        p.respawnAt = 1e9;
      }
    const target = g.addHuman("target", "Target", 1);
    target.shieldUntil = 1e9;
    g.pickups = [{ id: 0, x: 250, y: 0, z: 250, kind: "double", readyAt: 0 }];
    for (let i = 0; i < 160; i++) g.tick(50);
    expect(g.pickups[0].readyAt).toBeGreaterThan(0);
  });
  it("fills eight slots, admits two humans per team, and rejects overflow", () => {
    const g = new Game();
    for (let n = 0; n < 8; n++)
      g.addHuman(`p${n}`, `Player${n}`, Math.floor(n / 2));
    expect(g.humans).toBe(8);
    expect(() => g.addHuman("ninth", "Ninth", 0)).toThrow("full");
    expect(() => g.addHuman("bad", "<script>", 0)).toThrow();
  });
  it("retains team points when a human leaves and resets personal points on join", () => {
    const { g, p } = ready();
    g.scores[0] = 12;
    p.score = 12;
    g.removeHuman(p.id);
    expect(g.players[0].bot).toBe(true);
    expect(g.scores[0]).toBe(12);
    expect(g.addHuman("new", "New", 0).score).toBe(0);
  });
  it("awards one point to either human or bot killers, with no repeat death score", () => {
    const { g, p, q } = ready();
    for (let i = 0; i < 4; i++) g.hit(q, { owner: p.id, team: 0 });
    expect(p.score).toBe(1);
    expect(g.scores[0]).toBe(1);
    g.hit(q, { owner: p.id, team: 0 });
    expect(p.score).toBe(1);
    const bot = g.players[4];
    bot.hp = 100;
    for (let i = 0; i < 4; i++) g.hit(p, { owner: bot.id, team: 2 });
    expect(g.scores[2]).toBe(1);
    expect(bot.score).toBe(1);
  });
  it("keeps friendly immunity and full spawn protection while shooting", () => {
    const { g, p, q } = ready();
    p.shieldUntil = g.now + 1000;
    input(g, p, { fire: true });
    g.tick(50);
    g.hit(p, { owner: q.id, team: 1 });
    expect(p.hp).toBe(100);
    p.shieldUntil = 0;
    g.hit(p, { owner: q.id, team: 0 });
    expect(p.hp).toBe(100);
  });
  it("respawns after three seconds and clears powers, velocity and dash state", () => {
    const { g, p, q } = ready();
    p.storedPower = "double";
    p.power = "speed";
    p.powerUntil = 1e9;
    p.dashReadyAt = 1e9;
    for (let i = 0; i < 4; i++) g.hit(p, { owner: q.id, team: 1 });
    expect(p.storedPower).toBeNull();
    expect(p.power).toBeNull();
    run(g, 2950);
    expect(p.hp).toBe(0);
    g.tick(50);
    expect(p.hp).toBe(100);
    expect(p.shieldUntil - g.now).toBe(1000);
    expect(p.dashReadyAt).toBe(0);
    expect(p.y).toBe(0);
  });
  it("rejects malformed movement, pitch and sequence counters", () => {
    for (const patch of [
      { x: Infinity },
      { z: 2 },
      { pitch: 2 },
      { seq: -1 },
      { jump: 1.2 },
      { dash: NaN },
      { fire: 1 },
    ])
      expect(validInput({ ...idleInput(), ...patch })).toBe(false);
    expect(validInput({ ...idleInput(), seq: 1 })).toBe(true);
  });
  it("normalizes diagonal speed and stops stale input", () => {
    const { g, p } = ready();
    input(g, p, { x: 1, z: 1 });
    const x = p.x,
      z = p.z;
    g.tick(100);
    expect(Math.hypot(p.x - x, p.z - z)).toBeCloseTo(24);
    run(g, 1000);
    const stop = p.x;
    run(g, 500);
    expect(p.x).toBe(stop);
  });
  it("deduplicates jump and dash counters despite newer input sequence numbers", () => {
    const { g, p } = ready();
    input(g, p, { dash: 1, x: 1 });
    g.tick(50);
    expect(p.x).toBeCloseTo(250);
    input(g, p, { dash: 1, x: 1 });
    g.tick(50);
    expect(p.dashReadyAt).toBe(6000);
    input(g, p, { dash: 1, x: 1 });
    g.tick(50);
    expect(p.x).toBeCloseTo(350);
    g.now = 7000;
    input(g, p, { dash: 1 });
    g.tick(50);
    expect(p.dashReadyAt).toBe(6000);
    input(g, p, { dash: 2 });
    g.tick(50);
    expect(p.dashReadyAt).toBe(11050);
  });
  it("does not replay stale or out of order packets", () => {
    const { g, p } = ready();
    input(g, p, { seq: 3, x: 1 });
    g.setInput(p.id, { ...idleInput(), seq: 2, dash: 1 });
    g.tick(50);
    expect(p.ack).toBe(3);
    expect(p.x).toBeCloseTo(212);
    expect(p.dashReadyAt).toBe(0);
  });
  it("keeps dash vulnerable and stops it at cover", () => {
    const { g, p, q } = ready();
    g.arena.boxes.push({
      x: 280,
      y: 0,
      z: 100,
      w: 20,
      h: 100,
      d: 200,
      kind: "cover",
    });
    input(g, p, { dash: 1, x: 1 });
    run(g, 150);
    expect(p.x).toBeLessThanOrEqual(263);
    g.hit(p, { owner: q.id, team: 1 });
    expect(p.hp).toBe(75);
  });
  it("supports pitched shots and blocks bullets with upper floor slabs", () => {
    const { g, p, q } = ready();
    Object.assign(q, { x: 400, y: 140, z: 200, grounded: true });
    g.arena.boxes.push({
      x: 360,
      y: 124,
      z: 100,
      w: 200,
      h: 16,
      d: 200,
      kind: "floor",
    });
    p.x = 400;
    input(g, p, { fire: true, aim: 0, pitch: Math.PI / 2 });
    run(g, 300);
    expect(q.hp).toBe(100);
    g.bullets = [];
    g.arena.boxes = [];
    p.x = 200;
    p.nextShot = 0;
    Object.assign(q, { x: 400, y: 80, z: 200, vy: 0, grounded: true });
    input(g, p, { fire: true, aim: 0, pitch: Math.atan2(70, 200) });
    g.tick(50);
    const bullet = g.bullets.find((b) => b.owner === p.id)!;
    expect(bullet.vy).toBeGreaterThan(0);
  });
  it("lands an upward aimed shot on an enemy standing on an upper platform", () => {
    const { g, p, q } = ready();
    Object.assign(q, { x: 400, y: 140, z: 200, grounded: true });
    g.arena.boxes = [
      { x: 380, y: 124, z: 150, w: 100, h: 16, d: 100, kind: "floor" },
    ];
    input(g, p, { fire: true, pitch: Math.atan2(118, 200) });
    g.tick(50);
    input(g, p, { fire: false, pitch: Math.atan2(118, 200) });
    run(g, 250);
    expect(q.y).toBe(140);
    expect(q.hp).toBe(75);
    expect(
      g.events.some(
        (e) => e.kind === "hit" && e.actor === q.id && e.target === p.id,
      ),
    ).toBe(true);
  });
  it("separates overlapping players, but permits players on different floors", () => {
    const { g, p, q } = ready();
    Object.assign(q, { x: p.x + 5, y: 0, z: p.z });
    g.tick(50);
    expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(34);
    Object.assign(q, { x: p.x, y: 140, z: p.z });
    const x = p.x;
    g.tick(50);
    expect(p.x).toBe(x);
  });
  it("runs three complete rounds, clears transient effects and rematches", () => {
    const { g } = ready();
    g.now = 0;
    g.endsAt = ROUND_MS;
    for (const p of g.players) {
      p.hp = 0;
      p.respawnAt = 1e9;
    }
    for (let r = 0; r < 3; r++) {
      g.now = g.endsAt - 50;
      g.tick(50);
      if (r < 2) {
        expect(g.phase).toBe("intermission");
        g.now = g.endsAt - 50;
        g.tick(50);
        expect(g.round).toBe(r + 2);
        for (const p of g.players) {
          p.hp = 0;
          p.respawnAt = 1e9;
        }
      }
    }
    expect(g.phase).toBe("finished");
    expect(g.beams).toEqual([]);
    g.scores = [2, 3, 4, 5];
    g.rematch();
    expect(g.round).toBe(1);
    expect(g.phase).toBe("playing");
    expect(g.scores).toEqual([0, 0, 0, 0]);
    expect(g.humans).toBe(2);
    expect(BREAK_MS).toBe(5000);
  });
});
