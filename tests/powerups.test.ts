import { describe, expect, it } from "vitest";
import {
  Game,
  WIDTH,
  HEIGHT,
  blocked,
  generateMap,
  POWER_MS,
} from "../shared/game";

function arena() {
  const g = new Game(() => 0.25);
  g.walls = [];
  for (const p of g.players) {
    p.hp = 0;
    p.respawnAt = 1e9;
  }
  const p = g.addHuman("a", "Alpha", 0);
  p.x = 200;
  p.y = 450;
  p.nextShot = 0;
  g.now = 2000;
  return { g, p };
}

describe("random arenas", () => {
  it("generates different cover and leaves connected paths to every supply and team spawn", () => {
    expect(generateMap(() => 0.1)).not.toEqual(generateMap(() => 0.9));
    for (let seed = 1; seed <= 20; seed++) {
      let value = seed;
      const g = new Game(
        () => (value = (value * 1664525 + 1013904223) >>> 0) / 4294967296,
      );
      const seen = new Set<string>();
      const queue = [{ x: 100, y: 100 }];
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const [dx, dy] of [
          [40, 0],
          [-40, 0],
          [0, 40],
          [0, -40],
        ]) {
          const x = p.x + dx,
            y = p.y + dy,
            key = `${x},${y}`;
          if (!seen.has(key) && !blocked(x, y, 25, g.walls)) {
            seen.add(key);
            queue.push({ x, y });
          }
        }
      }
      for (const target of [...g.players, ...g.pickups]) {
        expect(blocked(target.x, target.y, 20, g.walls)).toBe(false);
        expect(
          queue.some((p) => Math.hypot(p.x - target.x, p.y - target.y) < 40),
        ).toBe(true);
      }
      for (const wall of g.walls) {
        expect(wall.x).toBeGreaterThan(0);
        expect(wall.y).toBeGreaterThan(0);
        expect(wall.x + wall.w).toBeLessThan(WIDTH);
        expect(wall.y + wall.h).toBeLessThan(HEIGHT);
      }
    }
  });
  it("shares map data in snapshots and regenerates it only for the next match", () => {
    const { g } = arena();
    const oldMap = g.walls;
    expect(g.snapshot().walls).toEqual(g.walls);
    g.tick(50);
    expect(g.walls).toBe(oldMap);
    g.phase = "finished";
    g.rematch();
    expect(g.walls).not.toBe(oldMap);
    expect(g.pickups.every((p) => p.readyAt === 0)).toBe(true);
  });
});

describe("supply pickups", () => {
  it("grants double shot for exactly three seconds and respawns the pickup after ten seconds", () => {
    const { g, p } = arena();
    g.pickups = [{ id: 1, x: p.x, y: p.y, kind: "double", readyAt: 0 }];
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: true });
    g.tick(50);
    expect(p.power).toBe("double");
    expect(p.powerUntil - g.now).toBe(POWER_MS);
    expect(g.bullets.filter((b) => b.owner === p.id)).toHaveLength(2);
    expect(g.pickups[0].readyAt - g.now).toBe(10_000);
    const until = p.powerUntil;
    g.now = until - 50;
    g.bullets = [];
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: true });
    g.tick(50);
    expect(p.power).toBeNull();
    expect(g.bullets.filter((b) => b.owner === p.id)).toHaveLength(1);
    g.now = g.pickups[0].readyAt - 50;
    g.tick(50);
    expect(p.power).toBeNull();
    expect(g.pickups[0].readyAt).toBe(0);
    expect(
      Math.hypot(g.pickups[0].x - p.x, g.pickups[0].y - p.y),
    ).toBeGreaterThanOrEqual(200);
    p.x = g.pickups[0].x;
    p.y = g.pickups[0].y;
    g.tick(50);
    expect(p.power).not.toBeNull();
  });
  it("starts with all five types and places supplies at varying safe, separated locations", () => {
    const first = new Game(() => 0.2),
      second = new Game(() => 0.8);
    expect(new Set(first.pickups.map((p) => p.kind)).size).toBe(5);
    expect(first.pickups.map((p) => [p.x, p.y])).not.toEqual(
      second.pickups.map((p) => [p.x, p.y]),
    );
    for (const pickup of first.pickups) {
      expect(blocked(pickup.x, pickup.y, 48, first.walls)).toBe(false);
      expect(
        first.players.every(
          (p) => Math.hypot(p.x - pickup.x, p.y - pickup.y) > 200,
        ),
      ).toBe(true);
      for (const other of first.pickups)
        if (other.id !== pickup.id)
          expect(
            Math.hypot(pickup.x - other.x, pickup.y - other.y),
          ).toBeGreaterThanOrEqual(200);
    }
  });
  it("rapid fire doubles the firing rate and returns to the standard rate on expiry", () => {
    const { g, p } = arena();
    p.power = "rapid";
    p.powerUntil = g.now + POWER_MS;
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: true });
    g.tick(10);
    expect(p.nextShot - g.now).toBe(110);
    g.now = p.nextShot - 10;
    g.tick(10);
    expect(g.bullets.filter((b) => b.owner === p.id)).toHaveLength(2);
    g.now = p.powerUntil - 10;
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: true });
    g.tick(10);
    expect(p.nextShot - g.now).toBe(220);
  });
  it("speed boost increases movement by 50 percent without bypassing walls", () => {
    const { g, p } = arena();
    p.power = "speed";
    p.powerUntil = g.now + POWER_MS;
    g.setInput(p.id, { x: 1, y: 0, aim: 0, fire: false });
    g.tick(100);
    expect(p.x).toBe(236);
    g.walls = [{ x: 270, y: 400, w: 50, h: 100 }];
    g.tick(100);
    expect(p.x).toBe(236);
    g.walls = [];
    g.now = p.powerUntil - 100;
    g.setInput(p.id, { x: 1, y: 0, aim: 0, fire: false });
    g.tick(100);
    expect(p.x).toBe(260);
  });
  it("shield blocks damage for three seconds, then expires; a new pickup replaces it", () => {
    const { g, p } = arena();
    p.power = "shield";
    p.powerUntil = g.now + POWER_MS;
    g.hit(p, { owner: "enemy", team: 1, bot: false });
    expect(p.hp).toBe(100);
    g.now = p.powerUntil;
    g.hit(p, { owner: "enemy", team: 1, bot: false });
    expect(p.hp).toBe(75);
    p.power = "shield";
    p.powerUntil = g.now + POWER_MS;
    g.pickups = [{ id: 0, x: p.x, y: p.y, kind: "rapid", readyAt: 0 }];
    g.tick(50);
    expect(p.power).toBe("rapid");
    expect(p.powerUntil - g.now).toBe(POWER_MS);
    g.hit(p, { owner: "enemy", team: 1, bot: false });
    expect(p.hp).toBe(50);
  });
  it("reflects laser off walls, limits bounces, and damages each enemy only once", () => {
    const { g, p } = arena();
    g.walls = [
      { x: 50, y: 300, w: 20, h: 300 },
      { x: 300, y: 300, w: 20, h: 300 },
    ];
    const enemy = g.addHuman("b", "Bravo", 1);
    enemy.x = 100;
    enemy.y = 450;
    enemy.shieldUntil = 0;
    const ally = g.addHuman("c", "Charlie", 0);
    ally.x = 150;
    ally.y = 450;
    ally.shieldUntil = 0;
    const behindWall = g.addHuman("d", "Delta", 2);
    behindWall.x = 350;
    behindWall.y = 450;
    behindWall.shieldUntil = 0;
    p.power = "laser";
    p.powerUntil = g.now + POWER_MS;
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: true });
    g.tick(50);
    expect(g.beams).toHaveLength(4);
    expect(g.beams[0].endX).toBeGreaterThan(g.beams[0].x);
    expect(g.beams[1].endX).toBeLessThan(g.beams[1].x);
    expect(enemy.hp).toBe(75);
    expect(ally.hp).toBe(100);
    expect(p.hp).toBe(100);
    expect(behindWall.hp).toBe(100);
    expect(g.bullets.filter((b) => b.owner === p.id)).toHaveLength(0);
  });
  it("reflects from the arena boundary and removes expired beam visuals", () => {
    const { g, p } = arena();
    p.x = WIDTH - 60;
    p.power = "laser";
    p.powerUntil = g.now + POWER_MS;
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: true });
    g.tick(50);
    expect(g.beams.length).toBeGreaterThan(1);
    expect(g.beams[1].endX).toBeLessThan(g.beams[1].x);
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: false });
    g.tick(100);
    g.tick(100);
    expect(g.beams).toHaveLength(0);
  });
});
