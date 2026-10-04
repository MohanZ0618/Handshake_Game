import { Game, idleInput, type Input, type Player } from "../shared/game";
export function ready(empty = true) {
  const g = new Game(() => 0.5);
  g.now = 2000;
  const p = g.addHuman("a", "Alpha", 0);
  const q = g.addHuman("b", "Bravo", 1);
  for (const b of g.players) {
    b.shieldUntil = 0;
    b.armor = 0;
    if (b.bot) {
      b.hp = 0;
      b.respawnAt = 1e9;
    }
  }
  g.pickups = [];
  if (empty) {
    g.arena = { ...g.arena, boxes: [], ramps: [] };
  }
  Object.assign(p, { x: 200, y: 0, z: 200, nextShot: 0, shieldUntil: 0 });
  Object.assign(q, { x: 1200, y: 0, z: 1000, nextShot: 0, shieldUntil: 0 });
  return { g, p, q };
}
export function input(g: Game, p: Player, patch: Partial<Input> = {}) {
  const i = { ...idleInput(), ...p.actions, seq: p.ack + 1, ...patch };
  g.setInput(p.id, i);
  return i;
}
export function run(g: Game, ms: number) {
  for (let n = 0; n < ms; n += 50) g.tick(Math.min(50, ms - n));
}
