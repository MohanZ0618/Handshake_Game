import { type Arena, type Vec3, rampHeight } from "./arena";
import { bodyBlocked, distance, supportHeight } from "./physics";
interface Node extends Vec3 {
  links: { to: number; cost: number; jump: boolean }[];
}
export interface Waypoint extends Vec3 {
  jump: boolean;
}
export class Navigation {
  readonly nodes: Node[] = [];
  constructor(readonly arena: Arena) {
    const add = (p: Vec3) => {
      if (
        !bodyBlocked(arena, p.x, p.y, p.z) &&
        Math.abs(supportHeight(arena, p.x, p.z, p.y + 0.1) - p.y) < 1
      )
        this.nodes.push({ ...p, links: [] });
    };
    for (let x = 100; x < 2400; x += 100)
      for (let z = 100; z < 1600; z += 100) add({ x, y: 0, z });
    for (let x = 750; x <= 1650; x += 100)
      for (let z = 500; z <= 1100; z += 100) add({ x, y: 140, z });
    for (const r of arena.ramps)
      for (let step = 0; step <= 10; step++) {
        const t = step / 10,
          x = r.x + (r.axis === "x" ? r.w * t : r.w / 2),
          z = r.z + (r.axis === "z" ? r.d * t : r.d / 2);
        add({ x, y: rampHeight(r, x, z) ?? 0, z });
      }
    for (let i = 0; i < this.nodes.length; i++)
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i],
          b = this.nodes[j],
          len = distance(a, b);
        if (len > 155 || len < 1 || Math.abs(a.y - b.y) > 62) continue;
        const check = this.walkable(a, b);
        if (!check.ok) continue;
        a.links.push({
          to: j,
          cost: len + (check.jump ? 80 : 0),
          jump: check.jump,
        });
        b.links.push({
          to: i,
          cost: len + (check.jump ? 80 : 0),
          jump: check.jump,
        });
      }
  }
  private walkable(a: Vec3, b: Vec3) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 8));
    let jump = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t;
      const floor = supportHeight(this.arena, x, z, y + 8, 17);
      if (floor < y - 0.5 || floor > y + 8) return { ok: false, jump };
      if (bodyBlocked(this.arena, x, Math.max(y, floor), z)) {
        if (Math.abs(a.y - b.y) < 1 && !bodyBlocked(this.arena, x, y + 38, z))
          jump = true;
        else return { ok: false, jump };
      }
    }
    return { ok: true, jump };
  }
  nearest(p: Vec3) {
    let best = -1,
      cost = Infinity;
    this.nodes.forEach((n, i) => {
      const d = distance(n, p);
      if (d < cost && Math.abs(n.y - p.y) < 65 && this.walkable(p, n).ok) {
        cost = d;
        best = i;
      }
    });
    return best;
  }
  path(from: Vec3, to: Vec3): Waypoint[] {
    const start = this.nearest(from),
      end = this.nearest(to);
    if (start < 0 || end < 0) return [];
    const open = new Set([start]),
      g = new Map([[start, 0]]),
      prev = new Map<number, { id: number; jump: boolean }>();
    while (open.size) {
      let current = -1,
        best = Infinity;
      for (const id of open) {
        const f = g.get(id)! + distance(this.nodes[id], this.nodes[end]);
        if (f < best) {
          best = f;
          current = id;
        }
      }
      if (current === end) {
        const out: Waypoint[] = [];
        let n = end;
        while (n !== start) {
          const edge = prev.get(n)!;
          out.unshift({ ...this.nodes[n], jump: edge.jump });
          n = edge.id;
        }
        out.unshift({ ...this.nodes[start], jump: false });
        const finalLeg = this.walkable(this.nodes[end], to);
        if (finalLeg.ok && distance(this.nodes[end], to) > 1)
          out.push({ ...to, jump: finalLeg.jump });
        return out;
      }
      open.delete(current);
      for (const edge of this.nodes[current].links) {
        const cost = g.get(current)! + edge.cost;
        if (cost < (g.get(edge.to) ?? Infinity)) {
          g.set(edge.to, cost);
          prev.set(edge.to, { id: current, jump: edge.jump });
          open.add(edge.to);
        }
      }
    }
    return [];
  }
}
