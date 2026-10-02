import { describe, it, expect } from "vitest";
import { Game, ROUND_MS, BREAK_MS, blocked, validInput } from "../shared/game";
function ready() {
  const g = new Game(() => 0.5);
  g.walls = [
    { x: 280, y: 180, w: 190, h: 45 },
    { x: 280, y: 345, w: 55, h: 210 },
  ];
  g.addHuman("a", "Alpha", 0);
  g.addHuman("b", "Bravo", 1);
  g.now = 2000;
  return g;
}
describe("authoritative game rules", () => {
  it("keeps the full spawn protection period when firing", () => {
    const g = new Game();
    const p = g.addHuman("a", "Alpha", 0);
    g.setInput(p.id, { x: 0, y: 0, aim: 0, fire: true });
    g.tick(50);
    expect(p.shieldUntil).toBe(1000);
    g.hit(p, { owner: "enemy", team: 1, bot: false });
    expect(p.hp).toBe(100);
  });
  it("fills eight slots, admits two humans per team, and rejects a ninth", () => {
    const g = new Game();
    expect(g.players.filter((p) => p.bot)).toHaveLength(8);
    for (let n = 0; n < 8; n++)
      g.addHuman(`p${n}`, `Player${n}`, Math.floor(n / 2));
    expect(g.humans).toBe(8);
    expect(g.players).toHaveLength(8);
    expect(() => g.addHuman("ninth", "Ninth", 0)).toThrow("full");
  });
  it("replaces only the selected team bot and preserves team points after departure", () => {
    const g = ready();
    g.scores[0] = 12;
    g.removeHuman("a");
    expect(g.humans).toBe(1);
    expect(g.players[0].bot).toBe(true);
    expect(g.scores[0]).toBe(12);
    const p = g.addHuman("new", "Newcomer", 0);
    expect(p.hp).toBe(100);
    expect(p.score).toBe(0);
    expect(g.players).toHaveLength(8);
  });
  it("awards +1 for a bot, +4 for a human, and nothing for bot kills", () => {
    const g = ready(),
      a = g.players[0],
      b = g.players[2],
      bot = g.players[4];
    for (let i = 0; i < 4; i++)
      g.hit(bot, { owner: a.id, team: 0, bot: false });
    expect(a.score).toBe(1);
    expect(g.scores[0]).toBe(1);
    for (let i = 0; i < 4; i++) g.hit(b, { owner: a.id, team: 0, bot: false });
    expect(a.score).toBe(5);
    expect(g.scores[0]).toBe(5);
    for (let i = 0; i < 4; i++)
      g.hit(a, { owner: g.players[6].id, team: 3, bot: true });
    expect(g.scores[3]).toBe(0);
    expect(a.hp).toBe(0);
    g.hit(b, { owner: a.id, team: 0, bot: false });
    expect(g.scores[0]).toBe(5);
  });
  it("blocks friendly damage and spawn damage, then respawns after three seconds", () => {
    const g = ready(),
      p = g.players[0];
    g.hit(p, { owner: "mate", team: 0, bot: false });
    expect(p.hp).toBe(100);
    p.shieldUntil = g.now + 1000;
    g.hit(p, { owner: "b", team: 1, bot: false });
    expect(p.hp).toBe(100);
    p.shieldUntil = 0;
    for (let i = 0; i < 4; i++) g.hit(p, { owner: "b", team: 1, bot: false });
    const deadAt = g.now;
    for (let i = 0; i < 29; i++) g.tick(100);
    expect(p.hp).toBe(0);
    g.tick(100);
    expect(p.hp).toBe(100);
    expect(g.now - deadAt).toBe(3000);
    expect(p.shieldUntil - g.now).toBe(1000);
  });
  it("rejects malformed inputs and diagonal speed exploits", () => {
    expect(validInput({ x: Infinity, y: 0, aim: 0, fire: false })).toBe(false);
    expect(validInput({ x: 2, y: 0, aim: 0, fire: false })).toBe(false);
    const g = ready(),
      p = g.players[0],
      x = p.x,
      y = p.y;
    g.setInput("a", { x: 1, y: 1, aim: 0, fire: false });
    g.tick(100);
    expect(Math.hypot(p.x - x, p.y - y)).toBeCloseTo(24);
  });
  it("prevents walking through cover and stops stale input", () => {
    const g = ready(),
      p = g.players[0];
    p.x = 250;
    p.y = 200;
    g.setInput("a", { x: 1, y: 0, aim: 0, fire: false });
    g.tick(100);
    expect(p.x).toBe(250);
    expect(blocked(300, 200, undefined, g.walls)).toBe(true);
    p.x = 100;
    p.y = 100;
    g.setInput("a", { x: 1, y: 0, aim: 0, fire: false });
    for (let i = 0; i < 10; i++) g.tick(100);
    expect(p.x).toBe(148);
  });
  it("bullets hit enemies once and cannot pass through cover", () => {
    const g = ready(),
      p = g.players[0],
      target = g.players[2];
    p.x = 150;
    p.y = 450;
    target.x = 400;
    target.y = 450;
    g.setInput("a", { x: 0, y: 0, aim: 0, fire: true });
    for (let i = 0; i < 5; i++) g.tick(100);
    expect(target.hp).toBe(100);
    p.x = 400;
    p.y = 100;
    target.x = 500;
    target.y = 100;
    g.setInput("a", { x: 0, y: 0, aim: 0, fire: true });
    g.tick(100);
    g.tick(100);
    expect(target.hp).toBeLessThan(100);
  });
  it("runs every tick of three full rounds and resets only on rematch", () => {
    const g = ready();
    g.now = 0;
    g.endsAt = ROUND_MS;
    g.scores = [4, 1, 4, 0];
    for (const p of g.players) {
      p.hp = 0;
      p.respawnAt = 1e9;
    }
    // Accelerated simulation uses the same fixed 50 ms step as both deployed servers.
    for (let n = 0; n < (ROUND_MS * 3 + BREAK_MS * 2) / 50; n++) g.tick(50);
    expect(g.phase).toBe("finished");
    expect(g.round).toBe(3);
    expect(g.scores[0]).toBe(g.scores[2]);
    g.rematch();
    expect(g.round).toBe(1);
    expect(g.phase).toBe("playing");
    expect(g.scores).toEqual([0, 0, 0, 0]);
    expect(g.humans).toBe(2);
  });
});
