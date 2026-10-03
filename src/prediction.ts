import {
  movementSpeed,
  type Player,
  type Input,
  type Snapshot,
} from "../shared/game";
import { moveBody, distance, bodyBlocked, EYE_HEIGHT } from "../shared/physics";
import type { Arena, Vec3 } from "../shared/arena";
const clone = (p: Player): Player => ({
  ...p,
  actions: { ...p.actions },
  ammo: { ...p.ammo },
});
type Slice = { input: Input; ms: number };
export class Prediction {
  body?: Player;
  private history: Slice[] = [];
  private now = 0;
  private phase = "";
  private offset = { x: 0, y: 0, z: 0 };
  correction = 0;
  constructor(private arena: Arena) {}
  accept(p: Player, s: Snapshot) {
    const phase = `${s.round}/${s.phase}`;
    const reset =
      !this.body ||
      this.body.life !== p.life ||
      this.body.hp <= 0 !== p.hp <= 0 ||
      this.phase !== phase;
    const old = this.body && this.display();
    this.history = reset ? [] : this.history.filter((h) => h.input.seq > p.ack);
    this.body = clone(p);
    this.now = s.now;
    this.phase = phase;
    if (p.hp > 0 && s.phase === "playing")
      for (const h of this.history) this.advance(h.input, h.ms);
    this.correction = old ? distance(old, this.body) : 0;
    this.offset =
      old && !reset && this.correction <= 24
        ? {
            x: old.x - this.body.x,
            y: old.y - this.body.y,
            z: old.z - this.body.z,
          }
        : { x: 0, y: 0, z: 0 };
  }
  private advance(input: Input, ms: number) {
    const p = this.body!;
    moveBody(
      p,
      {
        ...input,
        jump: input.jump > p.actions.jump,
        dash: input.dash > p.actions.dash,
      },
      this.arena,
      ms,
      this.now,
      movementSpeed(p, this.now),
    );
    p.actions.jump = Math.max(p.actions.jump, input.jump);
    p.actions.dash = Math.max(p.actions.dash, input.dash);
    this.now += ms;
  }
  step(input: Input, ms: number, active = true) {
    if (!this.body) return;
    if (active && this.body.hp > 0) {
      // The next outgoing sequence owns the actual time simulated before it is sent.
      const recorded = { ...input, seq: input.seq + 1 };
      this.history.push({ input: recorded, ms });
      if (this.history.length > 300) this.history.shift();
      this.advance(recorded, ms);
    }
    const factor = Math.exp(-ms / 33);
    this.offset.x *= factor;
    this.offset.y *= factor;
    this.offset.z *= factor;
  }
  display(): Vec3 {
    const p = this.body!;
    const target = {
      x: p.x + this.offset.x,
      y: p.y + EYE_HEIGHT + this.offset.y,
      z: p.z + this.offset.z,
    };
    const eye = { x: p.x, y: p.y + EYE_HEIGHT, z: p.z };
    const safe = constrainCamera(this.arena, eye, target);
    return { x: safe.x, y: safe.y - EYE_HEIGHT, z: safe.z };
  }
}
export function constrainCamera(arena: Arena, from: Vec3, to: Vec3): Vec3 {
  const length = distance(from, to);
  const steps = Math.max(1, Math.ceil(length / 1.5));
  let safe = from;
  for (let n = 1; n <= steps; n++) {
    const t = n / steps;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    };
    if (bodyBlocked(arena, point.x, point.y - 2, point.z, 2, 4)) break;
    safe = point;
  }
  return safe;
}
export class Interpolation {
  private frames: { now: number; players: Player[] }[] = [];
  push(s: Snapshot) {
    if (this.frames.some((f) => f.now === s.now)) return;
    this.frames.push({ now: s.now, players: s.players });
    this.frames.sort((a, b) => a.now - b.now);
    if (this.frames.length > 12) this.frames.shift();
  }
  sample(id: string, serverNow: number): Player | undefined {
    const target = serverNow - 100;
    let left = this.frames[0],
      right = left;
    if (!left) return;
    for (const f of this.frames) {
      if (f.now <= target) left = f;
      if (f.now >= target) {
        right = f;
        break;
      }
      right = f;
    }
    const a = left.players.find((p) => p.id === id),
      b = right.players.find((p) => p.id === id);
    if (!a || !b) return b ?? a;
    if (a.life !== b.life || a.hp <= 0 !== b.hp <= 0 || distance(a, b) > 180)
      return b;
    let t =
      right.now === left.now ? 0 : (target - left.now) / (right.now - left.now);
    if (target > right.now && this.frames.length > 1) {
      const previous = this.frames[this.frames.length - 2];
      const before = previous.players.find((p) => p.id === id);
      if (before && before.life === b.life && b.hp > 0) {
        t =
          Math.min(50, target - right.now) /
          Math.max(1, right.now - previous.now);
        return {
          ...b,
          x: b.x + (b.x - before.x) * t,
          y: b.y + (b.y - before.y) * t,
          z: b.z + (b.z - before.z) * t,
        };
      }
    }
    t = Math.max(0, Math.min(1, t));
    const angle = Math.atan2(Math.sin(b.aim - a.aim), Math.cos(b.aim - a.aim));
    return {
      ...b,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      aim: a.aim + angle * t,
      pitch: a.pitch + (b.pitch - a.pitch) * t,
    };
  }
  clear() {
    this.frames = [];
  }
}
