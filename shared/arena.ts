export const WIDTH = 2400,
  DEPTH = 1600,
  UPPER_Y = 140;
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Box extends Vec3 {
  w: number;
  h: number;
  d: number;
  kind: "cover" | "floor" | "rail" | "boundary";
}
export interface Ramp {
  x: number;
  z: number;
  w: number;
  d: number;
  axis: "x" | "z";
  reverse: boolean;
  height: number;
}
export interface Arena {
  id: string;
  boxes: Box[];
  ramps: Ramp[];
  spawns: Vec3[];
  supplies: Vec3[];
}
export function rampHeight(r: Ramp, x: number, z: number): number | undefined {
  if (x < r.x || x > r.x + r.w || z < r.z || z > r.z + r.d) return;
  const t = r.axis === "x" ? (x - r.x) / r.w : (z - r.z) / r.d;
  return (r.reverse ? 1 - t : t) * r.height;
}
export function createArena(): Arena {
  const boxes: Box[] = [];
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    kind: Box["kind"] = "cover",
  ) => boxes.push({ x, y, z, w, h, d, kind });
  box(700, 124, 450, 1000, 16, 180, "floor");
  box(700, 124, 970, 1000, 16, 180, "floor");
  box(700, 124, 630, 180, 16, 340, "floor");
  box(1520, 124, 630, 180, 16, 340, "floor");
  for (const z of [440, 1150]) {
    box(690, 140, z, 430, 65, 10, "rail");
    box(1280, 140, z, 430, 65, 10, "rail");
  }
  for (const x of [690, 1700]) {
    box(x, 140, 450, 10, 65, 270, "rail");
    box(x, 140, 880, 10, 65, 270, "rail");
  }
  for (const mx of [false, true])
    for (const mz of [false, true]) {
      const mirrored = (
        x: number,
        z: number,
        w: number,
        d: number,
        h: number,
        y = 0,
      ) => box(mx ? WIDTH - x - w : x, y, mz ? DEPTH - z - d : z, w, h, d);
      mirrored(350, 320, 180, 70, 90);
      mirrored(520, 550, 80, 160, 90);
      mirrored(980, 730, 100, 70, 32);
      mirrored(910, 480, 110, 60, 60, 140);
    }
  box(-20, 0, -20, 2440, 260, 20, "boundary");
  box(-20, 0, 1600, 2440, 260, 20, "boundary");
  box(-20, 0, 0, 20, 260, 1600, "boundary");
  box(2400, 0, 0, 20, 260, 1600, "boundary");
  const ramps: Ramp[] = [
    { x: 1120, z: 100, w: 160, d: 350, axis: "z", reverse: false, height: 140 },
    { x: 1120, z: 1150, w: 160, d: 350, axis: "z", reverse: true, height: 140 },
    { x: 200, z: 720, w: 500, d: 160, axis: "x", reverse: false, height: 140 },
    { x: 1700, z: 720, w: 500, d: 160, axis: "x", reverse: true, height: 140 },
  ];
  const supplies: Vec3[] = [];
  for (const x of [250, 750, 1050])
    for (const z of [250, 650])
      for (const mx of [false, true])
        for (const mz of [false, true]) {
          supplies.push({ x: mx ? WIDTH - x : x, y: 0, z: mz ? DEPTH - z : z });
        }
  for (const p of [
    { x: 800, z: 550 },
    { x: 1200, z: 550 },
    { x: 1600, z: 550 },
    { x: 800, z: 800 },
    { x: 1600, z: 800 },
    { x: 800, z: 1050 },
    { x: 1200, z: 1050 },
    { x: 1600, z: 1050 },
  ])
    supplies.push({ ...p, y: 140 });
  return {
    id: "skybridge-v1",
    boxes,
    ramps,
    supplies,
    spawns: [
      { x: 120, y: 0, z: 120 },
      { x: 2280, y: 0, z: 120 },
      { x: 120, y: 0, z: 1480 },
      { x: 2280, y: 0, z: 1480 },
    ],
  };
}
