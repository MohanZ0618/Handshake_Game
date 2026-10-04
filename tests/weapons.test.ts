import { describe, it, expect } from "vitest";
import { WEAPONS, WEAPON_IDS, fullAmmo } from "../shared/weapons";
import { BULLET_SPEED, validInput, idleInput } from "../shared/game";
import { ready, input, run } from "./helpers";
const STANDARD_WEAPON_IDS = WEAPON_IDS.filter((id) => id !== "sniper");
describe("authoritative weapons and magazines", () => {
  it("doubles projectile speed while preserving configured range", () => {
    expect(BULLET_SPEED).toBe(1640);
    for (const weapon of STANDARD_WEAPON_IDS) {
      const { g, p } = ready();
      p.weapon = weapon;
      input(g, p, { weapon, fire: true });
      g.tick(50);
      for (const bullet of g.bullets) {
        expect(Math.hypot(bullet.vx, bullet.vy, bullet.vz)).toBeCloseTo(BULLET_SPEED);
        expect((bullet.ttl * BULLET_SPEED) / 1000).toBeCloseTo(WEAPONS[weapon].range - BULLET_SPEED * 0.05);
      }
    }
  });
  it("enforces cadence under repeated inputs and preserves rapid fire's average interval", () => {
    for (const weapon of STANDARD_WEAPON_IDS) {
      const { g, p } = ready();
      p.weapon = weapon;
      p.shieldUntil = 1e9;
      const start = g.now;
      for (let n = 0; n < 20; n++) {
        input(g, p, { weapon, fire: true, reload: 1 });
        g.tick(50);
      }
      const shots = g.events.filter(
        (e) => e.kind === "shot" && e.actor === p.id,
      );
      // Repeating the same action counter cannot retrigger the ignored full-magazine reload.
      expect(shots.length).toBe(Math.ceil(1000 / WEAPONS[weapon].interval));
      expect(p.nextShot).toBeGreaterThanOrEqual(start);
    }
    const { g, p } = ready();
    p.power = "rapid";
    p.powerUntil = 1e9;
    for (let n = 0; n < 20; n++) {
      input(g, p, { fire: true });
      g.tick(50);
    }
    expect(30 - p.ammo.rifle).toBe(13);
    expect(
      g.events
        .filter((e) => e.actor === p.id && e.kind === "shot")
        .map((e) => e.time),
    ).toEqual([
      2050, 2150, 2200, 2300, 2350, 2450, 2500, 2600, 2650, 2750, 2800, 2900,
      2950,
    ]);
  });
  for (const weapon of STANDARD_WEAPON_IDS) {
    it(`${weapon} applies actual projectile damage to an enemy`, () => {
      const { g, p, q } = ready();
      p.weapon = weapon;
      Object.assign(q, { x: p.x + 100, y: 0, z: p.z });
      input(g, p, { weapon, fire: true });
      g.tick(50);
      input(g, p, { weapon, fire: false });
      run(g, 100);
      expect(q.hp).toBe(100 - WEAPONS[weapon].damage * WEAPONS[weapon].pellets);
    });
    it(`${weapon} consumes one round and emits the configured projectiles`, () => {
      const { g, p } = ready();
      p.weapon = weapon;
      input(g, p, { weapon, fire: true });
      g.tick(50);
      expect(p.ammo[weapon]).toBe(WEAPONS[weapon].magazine - 1);
      expect(g.bullets).toHaveLength(WEAPONS[weapon].pellets);
      expect(
        g.bullets.every(
          (b) => b.damage === WEAPONS[weapon].damage && b.weapon === weapon,
        ),
      ).toBe(true);
      expect(new Set(g.bullets.map((b) => b.shotId)).size).toBe(1);
      expect(p.nextShot - g.now).toBe(WEAPONS[weapon].interval);
      for (const b of g.bullets) {
        expect(
          Math.acos(b.vx / Math.hypot(b.vx, b.vy, b.vz)),
        ).toBeLessThanOrEqual(Math.PI / 30 + 1e-6);
        expect((b.ttl * BULLET_SPEED) / 1000).toBeCloseTo(WEAPONS[weapon].range - BULLET_SPEED * 0.05);
      }
    });
  }
  it("reloads automatically at zero, deduplicates R, and allows movement during reload", () => {
    const { g, p } = ready();
    p.ammo.rifle = 1;
    input(g, p, { fire: true });
    g.tick(50);
    expect(p.ammo.rifle).toBe(0);
    expect(p.reloadUntil - g.now).toBe(1500);
    const until = p.reloadUntil,
      x = p.x;
    input(g, p, { fire: true, reload: 1, x: 1, jump: 1, dash: 1 });
    g.tick(50);
    expect(p.x).toBeGreaterThan(x);
    expect(p.y).toBeGreaterThan(0);
    expect(p.reloadUntil).toBe(until);
    expect(g.events.filter((e) => e.kind === "shot")).toHaveLength(1);
    input(g, p, { fire: false, reload: 1 });
    run(g, 1450);
    expect(p.ammo.rifle).toBe(30);
    expect(p.reloadUntil).toBe(0);
  });
  it("switching cancels reload, retains all ammo and preserves the previous shot cooldown", () => {
    const { g, p } = ready();
    p.weapon = "shotgun";
    input(g, p, { weapon: "shotgun", fire: true });
    g.tick(50);
    const cooldown = p.nextShot;
    input(g, p, { weapon: "shotgun", reload: 1 });
    g.tick(50);
    expect(p.reloadUntil).toBeGreaterThan(g.now);
    input(g, p, { weapon: "smg", fire: true });
    g.tick(50);
    expect(p.reloadUntil).toBe(0);
    expect(p.ammo.shotgun).toBe(5);
    expect(p.nextShot).toBe(cooldown);
    expect(p.switchUntil - g.now).toBe(250);
    run(g, 250);
    expect(p.ammo.smg).toBe(40);
    input(g, p, { weapon: "smg", fire: true });
    run(g, 300);
    expect(p.ammo.smg).toBeLessThan(40);
  });
  it("full magazines ignore R, invalid weapons and reload counters are rejected", () => {
    const { g, p } = ready();
    input(g, p, { reload: 1 });
    g.tick(50);
    expect(p.reloadUntil).toBe(0);
    expect(validInput({ ...idleInput(), weapon: "rocket" })).toBe(false);
    expect(validInput({ ...idleInput(), reload: -1 })).toBe(false);
  });
  it("laser and double consume one round; powers survive switching and work during reload", () => {
    for (const power of ["laser", "double"] as const) {
      const { g, p } = ready();
      p.weapon = "shotgun";
      p.storedPower = power;
      input(g, p, { weapon: "shotgun", use: 1, fire: true });
      g.tick(50);
      expect(p.ammo.shotgun).toBe(5);
      if (power === "laser") {
        expect(g.bullets).toHaveLength(0);
        expect(g.beams[0].owner).toBe(p.id);
      } else expect(g.bullets).toHaveLength(16);
      input(g, p, { weapon: "smg" });
      g.tick(50);
      expect(p.power).toBe(power);
    }
    const { g, p } = ready();
    p.ammo.rifle = 10;
    p.storedPower = "shield";
    input(g, p, { reload: 1, use: 1 });
    g.tick(50);
    expect(p.power).toBe("shield");
    expect(p.reloadUntil).toBeGreaterThan(g.now);
  });
  it("death and the next round restore all magazines and rifle", () => {
    const { g, p, q } = ready();
    p.ammo = { rifle: 0, smg: 2, shotgun: 1, sniper: 0 };
    p.weapon = "smg";
    p.hp = 25;
    p.reloadUntil = g.now + 1000;
    g.hit(p, { owner: q.id, team: q.team });
    expect(p.reloadUntil).toBe(0);
    run(g, 3000);
    expect(p.ammo).toEqual(fullAmmo());
    expect(p.weapon).toBe("rifle");
    p.ammo.rifle = 1;
    g.now = g.endsAt - 50;
    g.tick(50);
    g.now = g.endsAt - 50;
    g.tick(50);
    expect(p.ammo).toEqual(fullAmmo());
    expect(p.weapon).toBe("rifle");
  });
});
