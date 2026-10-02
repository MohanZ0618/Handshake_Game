export const TEAMS = [
  { name: "EMBER", color: "#ff765e", letter: "E" },
  { name: "TIDAL", color: "#5bbaff", letter: "T" },
  { name: "JADE", color: "#70e1b0", letter: "J" },
  { name: "VOLT", color: "#e6cb66", letter: "V" },
] as const;
export const WIDTH = 2400,
  HEIGHT = 1600,
  RADIUS = 17;
export const ROUND_MS = 90_000,
  BREAK_MS = 5_000,
  RESPAWN_MS = 3_000;
export const SPEED = 240,
  BULLET_SPEED = 820,
  FIRE_MS = 220;
export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const POWER_TYPES = [
  "double",
  "laser",
  "rapid",
  "speed",
  "shield",
] as const;
export type Power = (typeof POWER_TYPES)[number];
export const POWER_INFO: Record<
  Power,
  { label: string; icon: string; color: string }
> = {
  double: { label: "DOUBLE SHOT", icon: "2X", color: "#ffc76b" },
  laser: { label: "RICOCHET LASER", icon: "LASER", color: "#bb8cff" },
  rapid: { label: "RAPID FIRE", icon: "RAPID", color: "#ff809d" },
  speed: { label: "SPEED BOOST", icon: "FAST", color: "#70e1b0" },
  shield: { label: "SHIELD", icon: "SHIELD", color: "#69cfff" },
};
export function movementSpeed(p: Player, now: number) {
  return SPEED * (p.power === "speed" && p.powerUntil > now ? 1.5 : 1);
}
export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: Power;
  readyAt: number;
}
export interface Beam {
  id: number;
  team: number;
  x: number;
  y: number;
  endX: number;
  endY: number;
  until: number;
}
export const POWER_MS = 3000;
export function generateMap(random: () => number): Wall[] {
  const walls: Wall[] = [];
  // Mirrored cover keeps all four team starts fair. Cell borders stay open.
  for (let col = 0; col < 3; col++)
    for (let row = 0; row < 2; row++) {
      if (col === 0 && row === 0) continue;
      const horizontal = random() > 0.5;
      const w = horizontal ? 150 + random() * 75 : 65 + random() * 35;
      const h = horizontal ? 65 + random() * 35 : 150 + random() * 75;
      const x = col * 400 + 70 + random() * (260 - w);
      const y = row * 400 + 70 + random() * (260 - h);
      for (const mx of [false, true])
        for (const my of [false, true])
          walls.push({
            x: mx ? WIDTH - x - w : x,
            y: my ? HEIGHT - y - h : y,
            w,
            h,
          });
    }
  return walls;
}
const SPAWNS = [
  { x: 100, y: 100 },
  { x: WIDTH - 100, y: 100 },
  { x: 100, y: HEIGHT - 100 },
  { x: WIDTH - 100, y: HEIGHT - 100 },
];
export interface Input {
  x: number;
  y: number;
  aim: number;
  fire: boolean;
}
export interface Player {
  id: string;
  name: string;
  team: number;
  slot: number;
  bot: boolean;
  x: number;
  y: number;
  aim: number;
  hp: number;
  score: number;
  kills: number;
  deaths: number;
  respawnAt: number;
  shieldUntil: number;
  nextShot: number;
  power: Power | null;
  powerUntil: number;
}
export interface Bullet {
  id: number;
  owner: string;
  team: number;
  bot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
}
export interface Feed {
  id: number;
  killer: string;
  victim: string;
  team: number;
  points: number;
  time: number;
}
export type Phase = "playing" | "intermission" | "finished";
export interface Snapshot {
  walls: Wall[];
  pickups: Pickup[];
  beams: Beam[];
  now: number;
  round: number;
  phase: Phase;
  endsAt: number;
  players: Player[];
  bullets: Bullet[];
  scores: number[];
  feed: Feed[];
}
export interface RoomInfo {
  code: string;
  humans: number;
  teams: number[];
  members: { name: string; team: number }[];
  round: number;
  phase: Phase;
  scores: number[];
  updatedAt: number;
}
export type ClientMessage =
  | { type: "join"; name: string; team: number }
  | { type: "input"; input: Input }
  | { type: "rematch" };
export type ServerMessage =
  | { type: "welcome"; id: string; code: string }
  | { type: "state"; state: Snapshot }
  | { type: "error"; message: string };
export function validName(value: unknown): value is string {
  return (
    typeof value === "string" && /^[A-Za-z0-9 _-]{1,16}$/.test(value.trim())
  );
}
export function validInput(i: unknown): i is Input {
  if (!i || typeof i !== "object") return false;
  const v = i as Input;
  return (
    [v.x, v.y, v.aim].every(Number.isFinite) &&
    Math.abs(v.x) <= 1 &&
    Math.abs(v.y) <= 1 &&
    Math.abs(v.aim) <= Math.PI * 4 &&
    typeof v.fire === "boolean"
  );
}
export function blocked(
  x: number,
  y: number,
  radius = RADIUS,
  walls: Wall[] = [],
) {
  return (
    x < radius ||
    y < radius ||
    x > WIDTH - radius ||
    y > HEIGHT - radius ||
    walls.some(
      (w) =>
        x + radius > w.x &&
        x - radius < w.x + w.w &&
        y + radius > w.y &&
        y - radius < w.y + w.h,
    )
  );
}
export function lineBlocked(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  walls: Wall[] = [],
) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 8);
  for (let s = 0; s <= n; s++)
    if (
      blocked(
        ax + ((bx - ax) * s) / Math.max(1, n),
        ay + ((by - ay) * s) / Math.max(1, n),
        2,
        walls,
      )
    )
      return true;
  return false;
}
export class Game {
  walls: Wall[];
  pickups: Pickup[] = [];
  beams: Beam[] = [];
  players: Player[] = [];
  bullets: Bullet[] = [];
  scores = [0, 0, 0, 0];
  feed: Feed[] = [];
  round = 1;
  phase: Phase = "playing";
  now = 0;
  endsAt = ROUND_MS;
  private inputs = new Map<string, { input: Input; at: number }>();
  private shotPresses = new Set<string>();
  private serial = 0;
  constructor(private random: () => number = Math.random) {
    this.walls = generateMap(random);
    this.resetPickups();
    for (let i = 0; i < 8; i++) this.players.push(this.makeBot(i));
  }
  private resetPickups() {
    this.pickups = [];
    const kinds: Power[] = [...POWER_TYPES];
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    for (let id = 0; id < 7; id++) {
      const pickup: Pickup = {
        id,
        x: -1000,
        y: -1000,
        kind: kinds[id] ?? this.randomPower(),
        readyAt: 0,
      };
      this.placePickup(pickup);
      this.pickups.push(pickup);
    }
    this.beams = [];
  }
  private randomPower(): Power {
    return POWER_TYPES[Math.floor(this.random() * POWER_TYPES.length)];
  }
  private placePickup(pickup: Pickup) {
    const spots: { x: number; y: number }[] = [];
    for (let x = 200; x <= WIDTH - 200; x += 100)
      for (let y = 200; y <= HEIGHT - 200; y += 100) {
        if (blocked(x, y, 48, this.walls)) continue;
        if (SPAWNS.some((s) => Math.hypot(s.x - x, s.y - y) < 250)) continue;
        if (Math.hypot(pickup.x - x, pickup.y - y) < 200) continue;
        if (
          this.pickups.some(
            (p) =>
              p.id !== pickup.id &&
              p.readyAt === 0 &&
              Math.hypot(p.x - x, p.y - y) < 200,
          )
        )
          continue;
        if (
          this.players.some(
            (p) => p.hp > 0 && Math.hypot(p.x - x, p.y - y) < 90,
          )
        )
          continue;
        spots.push({ x, y });
      }
    if (!spots.length) {
      pickup.readyAt = this.now + 1000;
      return;
    }
    const spot = spots[Math.floor(this.random() * spots.length)];
    pickup.x = spot.x;
    pickup.y = spot.y;
    pickup.readyAt = 0;
  }
  private spawn(p: Player) {
    const s = SPAWNS[p.team];
    p.x = s.x + (p.slot % 2 ? (s.x < WIDTH / 2 ? 48 : -48) : 0);
    p.y = s.y;
    p.hp = 100;
    p.respawnAt = 0;
    p.shieldUntil = this.now + 1000;
    p.nextShot = this.now + 350;
    p.power = null;
    p.powerUntil = 0;
  }
  private makeBot(slot: number): Player {
    const p: Player = {
      id: `bot-${slot}`,
      name: "ROBOT",
      team: Math.floor(slot / 2),
      slot,
      bot: true,
      x: 0,
      y: 0,
      aim: 0,
      hp: 100,
      score: 0,
      kills: 0,
      deaths: 0,
      respawnAt: 0,
      shieldUntil: 0,
      nextShot: 0,
      power: null,
      powerUntil: 0,
    };
    this.spawn(p);
    return p;
  }
  addHuman(id: string, name: string, team: number) {
    if (!validName(name))
      throw new Error(
        "Use 1-16 English letters, numbers, spaces, hyphens or underscores.",
      );
    if (!Number.isInteger(team) || team < 0 || team > 3)
      throw new Error("Choose a valid team.");
    if (this.players.some((p) => p.id === id))
      throw new Error("Already in this room.");
    const index = this.players.findIndex((p) => p.team === team && p.bot);
    if (index < 0) throw new Error("This team is full. Choose another team.");
    const p = this.makeBot(index);
    p.id = id;
    p.name = name.trim();
    p.bot = false;
    this.players[index] = p;
    this.bullets = this.bullets.filter((b) => b.owner !== `bot-${index}`);
    return p;
  }
  removeHuman(id: string) {
    const index = this.players.findIndex((p) => p.id === id && !p.bot);
    if (index >= 0) this.players[index] = this.makeBot(index);
    this.inputs.delete(id);
    this.shotPresses.delete(id);
    this.bullets = this.bullets.filter((b) => b.owner !== id);
  }
  setInput(id: string, input: Input) {
    if (validInput(input)) {
      // Preserve a short click that starts and ends between simulation ticks.
      if (input.fire && !this.inputs.get(id)?.input.fire)
        this.shotPresses.add(id);
      this.inputs.set(id, { input, at: this.now });
    }
  }
  get humans() {
    return this.players.filter((p) => !p.bot).length;
  }
  info(code: string): RoomInfo {
    return {
      code,
      humans: this.humans,
      members: this.players
        .filter((p) => !p.bot)
        .map((p) => ({ name: p.name, team: p.team })),
      teams: TEAMS.map(
        (_, t) => this.players.filter((p) => !p.bot && p.team === t).length,
      ),
      round: this.round,
      phase: this.phase,
      scores: [...this.scores],
      updatedAt: Date.now(),
    };
  }
  snapshot(): Snapshot {
    return {
      walls: this.walls.map((w) => ({ ...w })),
      pickups: this.pickups.map((p) => ({ ...p })),
      beams: this.beams.map((b) => ({ ...b })),
      now: this.now,
      round: this.round,
      phase: this.phase,
      endsAt: this.endsAt,
      players: this.players.map((p) => ({ ...p })),
      bullets: this.bullets.map((b) => ({ ...b })),
      scores: [...this.scores],
      feed: this.feed.map((f) => ({ ...f })),
    };
  }
  rematch() {
    if (this.phase !== "finished") return;
    this.round = 1;
    this.phase = "playing";
    this.endsAt = this.now + ROUND_MS;
    this.scores = [0, 0, 0, 0];
    this.feed = [];
    this.bullets = [];
    this.walls = generateMap(this.random);
    this.resetPickups();
    this.inputs.clear();
    this.shotPresses.clear();
    for (const p of this.players) {
      p.score = 0;
      p.kills = 0;
      p.deaths = 0;
      this.spawn(p);
    }
  }
  private botInput(p: Player): Input {
    const enemies = this.players
      .filter((q) => q.team !== p.team && q.hp > 0)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
      );
    const target =
      enemies.find((q) => !lineBlocked(p.x, p.y, q.x, q.y, this.walls)) ??
      enemies[0];
    if (!target) return { x: 0, y: 0, aim: p.aim, fire: false };
    const dx = target.x - p.x,
      dy = target.y - p.y,
      d = Math.hypot(dx, dy),
      angle = Math.atan2(dy, dx);
    const clear = !lineBlocked(p.x, p.y, target.x, target.y, this.walls);
    let move = angle;
    if (clear && d < 380) move += (Math.PI / 2) * (p.slot % 2 ? 1 : -1);
    const offsets = [
      0,
      0.6,
      -0.6,
      1.2,
      -1.2,
      Math.PI / 2,
      -Math.PI / 2,
      Math.PI,
    ];
    const chosen = offsets.find(
      (a) =>
        !blocked(
          p.x + Math.cos(move + a) * 65,
          p.y + Math.sin(move + a) * 65,
          RADIUS,
          this.walls,
        ),
    );
    move += chosen ?? Math.PI;
    return {
      x: Math.cos(move) * 0.72,
      y: Math.sin(move) * 0.72,
      aim: angle + Math.sin(this.now / 240 + p.slot) * 0.16,
      fire: clear && d < 650 && this.random() > 0.18,
    };
  }
  // The server owns this check, so clients cannot award points or damage teammates.
  hit(victim: Player, bullet: Pick<Bullet, "owner" | "team" | "bot">) {
    if (
      victim.hp <= 0 ||
      victim.team === bullet.team ||
      this.now < victim.shieldUntil ||
      (victim.power === "shield" && this.now < victim.powerUntil) ||
      this.phase !== "playing"
    )
      return;
    victim.hp = Math.max(0, victim.hp - 25);
    if (victim.hp > 0) return;
    victim.deaths++;
    victim.respawnAt = this.now + RESPAWN_MS;
    const killer = this.players.find((p) => p.id === bullet.owner);
    const points = bullet.bot ? 0 : victim.bot ? 1 : 4;
    if (killer) {
      killer.kills++;
      killer.score += points;
      this.scores[killer.team] += points;
    }
    this.feed.unshift({
      id: ++this.serial,
      killer: killer?.name ?? "ROBOT",
      victim: victim.name,
      team: bullet.team,
      points,
      time: this.now,
    });
    this.feed = this.feed.slice(0, 5);
  }
  tick(ms: number) {
    const dt = Math.min(Math.max(ms, 0), 100);
    this.now += dt;
    this.beams = this.beams.filter((b) => b.until > this.now);
    if (this.phase === "finished") return;
    if (this.now >= this.endsAt) {
      this.bullets = [];
      if (this.phase === "intermission") {
        this.round++;
        this.phase = "playing";
        this.endsAt = this.now + ROUND_MS;
        this.resetPickups();
        for (const p of this.players) this.spawn(p);
      } else {
        this.phase = this.round === 3 ? "finished" : "intermission";
        this.endsAt = this.now + (this.phase === "finished" ? 0 : BREAK_MS);
      }
      this.inputs.clear();
      this.shotPresses.clear();
      return;
    }
    if (this.phase !== "playing") return;
    for (const pickup of this.pickups) {
      if (pickup.readyAt > 0 && pickup.readyAt <= this.now) {
        pickup.kind = this.randomPower();
        this.placePickup(pickup);
      }
    }
    for (const p of this.players) {
      if (p.hp <= 0) {
        this.shotPresses.delete(p.id);
        if (this.now >= p.respawnAt) this.spawn(p);
        continue;
      }
      const stored = this.inputs.get(p.id);
      const i = p.bot
        ? this.botInput(p)
        : stored && this.now - stored.at < 300
          ? stored.input
          : { x: 0, y: 0, aim: p.aim, fire: false };
      const length = Math.max(1, Math.hypot(i.x, i.y));
      const speed = movementSpeed(p, this.now);
      const nx = p.x + ((i.x / length) * speed * dt) / 1000,
        ny = p.y + ((i.y / length) * speed * dt) / 1000;
      if (!blocked(nx, p.y, RADIUS, this.walls)) p.x = nx;
      if (!blocked(p.x, ny, RADIUS, this.walls)) p.y = ny;
      if (this.now >= p.powerUntil) p.power = null;
      for (const pickup of this.pickups) {
        if (
          pickup.readyAt === 0 &&
          Math.hypot(p.x - pickup.x, p.y - pickup.y) < 36
        ) {
          p.power = pickup.kind;
          p.powerUntil = this.now + POWER_MS;
          pickup.readyAt = this.now + 10_000;
        }
      }
      p.aim = i.aim;
      const pressed = this.shotPresses.delete(p.id);
      if ((i.fire || pressed) && this.now >= p.nextShot) {
        p.nextShot =
          this.now + (p.bot ? 520 : FIRE_MS) * (p.power === "rapid" ? 0.5 : 1);
        if (p.power === "laser") {
          this.fireLaser(p);
          continue;
        }
        for (const offset of p.power === "double" ? [-8, 8] : [0])
          this.bullets.push({
            id: ++this.serial,
            owner: p.id,
            team: p.team,
            bot: p.bot,
            x: p.x - Math.sin(i.aim) * offset,
            y: p.y + Math.cos(i.aim) * offset,
            vx: Math.cos(i.aim) * BULLET_SPEED,
            vy: Math.sin(i.aim) * BULLET_SPEED,
            ttl: 850,
          });
      }
    }
    this.bullets = this.bullets.filter((b) => {
      b.ttl -= dt;
      if (b.ttl <= 0) return false;
      const steps = Math.ceil((BULLET_SPEED * dt) / 1000 / 7);
      for (let j = 0; j < steps; j++) {
        b.x += (b.vx * dt) / 1000 / steps;
        b.y += (b.vy * dt) / 1000 / steps;
        if (blocked(b.x, b.y, 2, this.walls)) return false;
        const victim = this.players.find(
          (p) =>
            p.hp > 0 &&
            p.team !== b.team &&
            Math.hypot(p.x - b.x, p.y - b.y) < RADIUS + 3,
        );
        if (victim) {
          this.hit(victim, b);
          return false;
        }
      }
      return true;
    });
  }
  private fireLaser(p: Player) {
    let x = p.x,
      y = p.y;
    let vx = Math.cos(p.aim),
      vy = Math.sin(p.aim),
      bounces = 0;
    let startX = x,
      startY = y;
    const segment = () =>
      this.beams.push({
        id: ++this.serial,
        team: p.team,
        x: startX,
        y: startY,
        endX: x,
        endY: y,
        until: this.now + 170,
      });
    const hit = new Set<string>();
    for (let distance = 0; distance < 1600; distance += 5) {
      let nx = x + vx * 5,
        ny = y + vy * 5;
      if (blocked(nx, ny, 2, this.walls)) {
        segment();
        if (bounces++ >= 3) return;
        const blockedX = blocked(nx, y, 2, this.walls);
        const blockedY = blocked(x, ny, 2, this.walls);
        if (blockedX || !blockedY) vx = -vx;
        if (blockedY || !blockedX) vy = -vy;
        startX = x;
        startY = y;
        nx = x + vx * 5;
        ny = y + vy * 5;
        if (blocked(nx, ny, 2, this.walls)) return;
      }
      x = nx;
      y = ny;
      for (const target of this.players) {
        if (
          target.team !== p.team &&
          target.hp > 0 &&
          !hit.has(target.id) &&
          Math.hypot(target.x - x, target.y - y) < RADIUS + 3
        ) {
          hit.add(target.id);
          this.hit(target, { owner: p.id, team: p.team, bot: p.bot });
        }
      }
    }
    segment();
  }
}
