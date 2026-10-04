import { describe, expect, it } from "vitest";
import { movementSpeed, SYNC_COOLDOWN_MS, SYNC_DURATION_MS, SYNC_SHIELD, SYNC_WINDOW_MS } from "../shared/game";
import { SPEED } from "../shared/physics";
import { ready } from "./helpers";

describe("Sync Strike", () => {
  it("rewards two distinct teammates hitting one target without changing score", () => {
    const { g, p, q } = ready();
    const partner = g.players.find((player) => player.team === p.team && player.id !== p.id)!;
    expect(partner.bot).toBe(true);
    partner.hp = 100;
    partner.armor = 90;
    p.armor = 90;
    q.hp = 100;
    g.hit(q, { owner: p.id, team: p.team, damage: 5 });
    g.now += SYNC_WINDOW_MS;
    g.hit(q, { owner: partner.id, team: partner.team, damage: 5 });
    expect(p.armor).toBe(Math.min(100, 90 + SYNC_SHIELD));
    expect(partner.armor).toBe(Math.min(100, 90 + SYNC_SHIELD));
    expect(p.syncUntil).toBe(g.now + SYNC_DURATION_MS);
    expect(g.syncReadyAt[p.team]).toBe(g.now + SYNC_COOLDOWN_MS);
    expect(g.events.filter((e) => e.kind === "sync")).toHaveLength(1);
    expect(g.scores).toEqual([0, 0, 0, 0]);
    expect(movementSpeed(p, g.now)).toBeCloseTo(SPEED * 1.1);
    p.power = "speed";
    p.powerUntil = g.now + 1000;
    expect(movementSpeed(p, g.now)).toBeCloseTo(SPEED * 1.5);
  });

  it("ignores blocked and expired hits, and enforces team cooldown", () => {
    const { g, p, q } = ready();
    const partner = g.players.find((player) => player.team === p.team && player.id !== p.id)!;
    partner.hp = 100;
    q.hp = 100;
    q.shieldUntil = g.now + 100;
    g.hit(q, { owner: p.id, team: p.team, damage: 1 });
    q.shieldUntil = 0;
    g.hit(q, { owner: partner.id, team: partner.team, damage: 1 });
    expect(g.events.some((e) => e.kind === "sync")).toBe(false);
    g.now += SYNC_WINDOW_MS + 1;
    g.hit(q, { owner: p.id, team: p.team, damage: 1 });
    expect(g.events.some((e) => e.kind === "sync")).toBe(false);
    g.hit(q, { owner: partner.id, team: partner.team, damage: 1 });
    expect(g.events.filter((e) => e.kind === "sync")).toHaveLength(1);
    g.hit(q, { owner: p.id, team: p.team, damage: 1 });
    g.hit(q, { owner: partner.id, team: partner.team, damage: 1 });
    expect(g.events.filter((e) => e.kind === "sync")).toHaveLength(1);
    g.now += SYNC_COOLDOWN_MS;
    g.hit(q, { owner: p.id, team: p.team, damage: 1 });
    g.hit(q, { owner: partner.id, team: partner.team, damage: 1 });
    expect(g.events.filter((e) => e.kind === "sync")).toHaveLength(2);
  });

  it("clears marks on death and when a player leaves", () => {
    const { g, p, q } = ready();
    const partner = g.players.find((player) => player.team === p.team && player.id !== p.id)!;
    partner.hp = 100;
    q.hp = 100;
    g.hit(q, { owner: p.id, team: p.team, damage: 1 });
    g.hit(p, { owner: q.id, team: q.team, damage: 200 });
    g.hit(q, { owner: partner.id, team: partner.team, damage: 1 });
    expect(g.events.some((e) => e.kind === "sync")).toBe(false);
    const { g: leaving, p: departing, q: target } = ready();
    const teammate = leaving.players.find((player) => player.team === departing.team && player.id !== departing.id)!;
    teammate.hp = target.hp = 100;
    leaving.hit(target, { owner: departing.id, team: departing.team, damage: 1 });
    leaving.removeHuman(departing.id);
    leaving.hit(target, { owner: teammate.id, team: teammate.team, damage: 1 });
    expect(leaving.events.some((e) => e.kind === "sync")).toBe(false);
    expect(leaving.players.find((player) => player.team === 0 && player.bot)).toBeDefined();
  });

  it("keeps team hit windows independent and allows a lethal second hit", () => {
    const { g, p, q } = ready();
    const partner = g.players.find((player) => player.team === p.team && player.id !== p.id)!;
    const other = g.players.find((player) => player.team === 2)!;
    partner.hp = other.hp = 100;
    q.hp = 3;
    g.hit(q, { owner: p.id, team: p.team, damage: 1 });
    g.hit(q, { owner: other.id, team: other.team, damage: 1 });
    g.hit(q, { owner: partner.id, team: partner.team, damage: 1 });
    expect(q.hp).toBe(0);
    expect(g.events.filter((e) => e.kind === "sync")).toHaveLength(1);
    expect(g.scores[p.team]).toBe(1);
    g.hit(p, { owner: other.id, team: other.team, damage: 200 });
    expect(p.syncUntil).toBe(0);
  });

  it("resets team cooldown and personal bonus between rounds", () => {
    const { g, p, q } = ready();
    const partner = g.players.find((player) => player.team === p.team && player.id !== p.id)!;
    partner.hp = q.hp = 100;
    g.hit(q, { owner: p.id, team: p.team, damage: 1 });
    g.hit(q, { owner: partner.id, team: partner.team, damage: 1 });
    g.endsAt = g.now;
    g.tick(50);
    expect(g.syncReadyAt).toEqual([0, 0, 0, 0]);
    expect(p.syncUntil).toBe(0);
    expect(partner.syncUntil).toBe(0);
  });
});
