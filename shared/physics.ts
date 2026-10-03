import { WIDTH, DEPTH, rampHeight, type Arena, type Vec3 } from "./arena";
export const RADIUS = 17,
  BODY_HEIGHT = 60,
  EYE_HEIGHT = 52,
  SPEED = 240,
  GRAVITY = 900,
  JUMP_SPEED = 300;
export interface Body extends Vec3 {
  vy: number;
  grounded: boolean;
  dashUntil: number;
  dashReadyAt: number;
  dashX: number;
  dashZ: number;
}
export interface Motion {
  x: number;
  z: number;
  aim: number;
  jump: boolean;
  dash: boolean;
}
export function bodyBlocked(
  a: Arena,
  x: number,
  y: number,
  z: number,
  r = RADIUS,
  h = BODY_HEIGHT,
): boolean {
  if (x < r || z < r || x > WIDTH - r || z > DEPTH - r || y < -0.01)
    return true;
  if (
    a.boxes.some(
      (b) =>
        x + r > b.x &&
        x - r < b.x + b.w &&
        z + r > b.z &&
        z - r < b.z + b.d &&
        y + h > b.y + 0.01 &&
        y < b.y + b.h - 0.01,
    )
  )
    return true;
  return a.ramps.some((ramp) => {
    const top = rampHeight(ramp, x, z);
    return top !== undefined && y < top - 0.5 && y + h > 0;
  });
}
export function supportHeight(
  a: Arena,
  x: number,
  z: number,
  maxY: number,
  radius = 0,
): number {
  let y = 0;
  for (const b of a.boxes)
    if (
      x + radius >= b.x &&
      x - radius <= b.x + b.w &&
      z + radius >= b.z &&
      z - radius <= b.z + b.d &&
      b.y + b.h <= maxY + 0.01
    )
      y = Math.max(y, b.y + b.h);
  for (const r of a.ramps) {
    const h = rampHeight(r, x, z);
    if (h !== undefined && h <= maxY + 0.01) y = Math.max(y, h);
  }
  return y;
}
export function moveBody(
  p: Body,
  i: Motion,
  a: Arena,
  ms: number,
  now: number,
  speed = SPEED,
) {
  const events: { jump: boolean; dash: boolean; land: boolean } = {
    jump: false,
    dash: false,
    land: false,
  };
  if (i.jump && p.grounded) {
    p.vy = JUMP_SPEED;
    p.grounded = false;
    events.jump = true;
  }
  if (i.dash && now >= p.dashReadyAt) {
    const len = Math.hypot(i.x, i.z);
    p.dashX = len ? i.x / len : Math.cos(i.aim);
    p.dashZ = len ? i.z / len : Math.sin(i.aim);
    p.dashUntil = now + 150;
    p.dashReadyAt = now + 4000;
    events.dash = true;
  }
  const n = Math.max(1, Math.ceil(ms / 5));
  const dt = ms / n / 1000;
  for (let s = 0; s < n; s++) {
    const t = now + s * dt * 1000,
      dashing = t < p.dashUntil;
    const len = Math.max(1, Math.hypot(i.x, i.z));
    const dx = (dashing ? p.dashX * 1000 : (i.x / len) * speed) * dt,
      dz = (dashing ? p.dashZ * 1000 : (i.z / len) * speed) * dt;
    for (const axis of ["x", "z"] as const) {
      const next = p[axis] + (axis === "x" ? dx : dz);
      const x = axis === "x" ? next : p.x,
        z = axis === "z" ? next : p.z;
      const floor = supportHeight(a, x, z, p.y + (p.grounded ? 8 : 0), RADIUS);
      const y = p.grounded && Math.abs(floor - p.y) <= 8 ? floor : p.y;
      if (!bodyBlocked(a, x, y, z)) {
        p[axis] = next;
        p.y = y;
      } else if (dashing) p.dashUntil = t;
    }
    const floor = supportHeight(a, p.x, p.z, p.y + 0.5, RADIUS);
    if (p.grounded && p.y > floor + 0.6) p.grounded = false;
    if (!p.grounded) {
      p.vy -= GRAVITY * dt;
      const next = p.y + p.vy * dt;
      if (next <= floor && p.vy <= 0) {
        p.y = floor;
        p.vy = 0;
        p.grounded = true;
        events.land = true;
      } else if (p.vy > 0 && bodyBlocked(a, p.x, next, p.z)) {
        p.vy = 0;
      } else p.y = next;
    }
  }
  return events;
}
export interface RayHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
}
export function rayBox(
  origin: Vec3,
  dir: Vec3,
  b: { x: number; y: number; z: number; w: number; h: number; d: number },
  limit: number,
): RayHit | undefined {
  let enter = 0,
    exit = limit;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (const [axis, size] of [
    ["x", "w"],
    ["y", "h"],
    ["z", "d"],
  ] as const) {
    if (Math.abs(dir[axis]) < 1e-9) {
      if (origin[axis] < b[axis] || origin[axis] > b[axis] + b[size]) return;
      continue;
    }
    const t1 = (b[axis] - origin[axis]) / dir[axis],
      t2 = (b[axis] + b[size] - origin[axis]) / dir[axis];
    const lo = Math.min(t1, t2),
      hi = Math.max(t1, t2);
    if (lo >= enter) {
      enter = lo;
      normal = { x: 0, y: 0, z: 0 };
      normal[axis] = dir[axis] > 0 ? -1 : 1;
    }
    exit = Math.min(exit, hi);
    if (enter > exit) return;
  }
  if (exit < 0 || enter > limit) return;
  return {
    distance: enter,
    point: {
      x: origin.x + dir.x * enter,
      y: origin.y + dir.y * enter,
      z: origin.z + dir.z * enter,
    },
    normal,
  };
}
export function rayWorld(
  a: Arena,
  o: Vec3,
  d: Vec3,
  limit: number,
): RayHit | undefined {
  let hit: RayHit | undefined;
  const accept = (h: RayHit | undefined) => {
    if (
      h &&
      h.distance >= 0 &&
      h.distance <= limit &&
      (!hit || h.distance < hit.distance)
    )
      hit = h;
  };
  for (const b of a.boxes) accept(rayBox(o, d, b, limit));
  if (d.y < 0) {
    const t = -o.y / d.y;
    if (t >= 0 && t <= limit)
      accept({
        distance: t,
        point: { x: o.x + d.x * t, y: 0, z: o.z + d.z * t },
        normal: { x: 0, y: 1, z: 0 },
      });
  }
  // A ramp is a convex wedge; clip the ray against its six half spaces.
  for (const r of a.ramps) {
    const slope =
      ((r.reverse ? -1 : 1) * r.height) / (r.axis === "x" ? r.w : r.d);
    const intercept = (r.reverse ? r.height : 0) - slope * r[r.axis];
    const planes: [Vec3, number][] = [
      [{ x: -1, y: 0, z: 0 }, -r.x],
      [{ x: 1, y: 0, z: 0 }, r.x + r.w],
      [{ x: 0, y: 0, z: -1 }, -r.z],
      [{ x: 0, y: 0, z: 1 }, r.z + r.d],
      [{ x: 0, y: -1, z: 0 }, 0],
      [
        {
          x: r.axis === "x" ? -slope : 0,
          y: 1,
          z: r.axis === "z" ? -slope : 0,
        },
        intercept,
      ],
    ];
    let lo = 0,
      hi = limit,
      norm: Vec3 = { x: 0, y: 1, z: 0 },
      valid = true;
    for (const [n, c] of planes) {
      const dist = c - n.x * o.x - n.y * o.y - n.z * o.z,
        den = n.x * d.x + n.y * d.y + n.z * d.z;
      if (Math.abs(den) < 1e-9) {
        if (dist < 0) {
          valid = false;
          break;
        }
        continue;
      }
      const t = dist / den;
      if (den < 0 && t >= lo) {
        lo = t;
        const len = Math.hypot(n.x, n.y, n.z);
        norm = { x: n.x / len, y: n.y / len, z: n.z / len };
      } else if (den > 0) hi = Math.min(hi, t);
      if (lo > hi) {
        valid = false;
        break;
      }
    }
    if (valid && lo <= hi)
      accept({
        distance: lo,
        point: { x: o.x + d.x * lo, y: o.y + d.y * lo, z: o.z + d.z * lo },
        normal: norm,
      });
  }
  return hit;
}
export function direction(aim: number, pitch: number): Vec3 {
  return {
    x: Math.cos(aim) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: Math.sin(aim) * Math.cos(pitch),
  };
}
export function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function visible(a: Arena, from: Vec3, to: Vec3) {
  const len = distance(from, to);
  if (len < 0.01) return true;
  return !rayWorld(
    a,
    from,
    {
      x: (to.x - from.x) / len,
      y: (to.y - from.y) / len,
      z: (to.z - from.z) / len,
    },
    Math.max(0, len - 1),
  );
}
