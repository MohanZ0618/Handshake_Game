import { WEAPONS, fullAmmo, validWeapon, type WeaponId } from "./weapons";
import { createArena, type Arena, type Vec3 } from "./arena";
import {
  BODY_HEIGHT,
  EYE_HEIGHT,
  RADIUS,
  SPEED,
  moveBody,
  distance,
  direction,
  rayBox,
  rayWorld,
  visible,
  bodyBlocked,
  supportHeight,
  type Body,
} from "./physics";
import { Navigation, type Waypoint } from "./navigation";
export { WIDTH, DEPTH } from "./arena";
export { RADIUS, SPEED } from "./physics";
export const PROTOCOL = 3;
export const TEAMS = [
  { name: "EMBER", color: "#ff765e", letter: "E" },
  { name: "TIDAL", color: "#5bbaff", letter: "T" },
  { name: "JADE", color: "#70e1b0", letter: "J" },
  { name: "VOLT", color: "#e6cb66", letter: "V" },
] as const;
export const ROUND_MS = 90_000,
  BREAK_MS = 5000,
  RESPAWN_MS = 3000,
  BULLET_SPEED = 820,
  FIRE_MS = 150;
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
  { label: string; icon: string; color: string; duration: number }
> = {
  double: {
    label: "DOUBLE SHOT",
    icon: "2X",
    color: "#ffc76b",
    duration: 4000,
  },
  laser: {
    label: "RICOCHET LASER",
    icon: "LASER",
    color: "#bb8cff",
    duration: 3000,
  },
  rapid: {
    label: "RAPID FIRE",
    icon: "RAPID",
    color: "#ff809d",
    duration: 4000,
  },
  speed: {
    label: "SPEED BOOST",
    icon: "FAST",
    color: "#70e1b0",
    duration: 5000,
  },
  shield: { label: "SHIELD", icon: "SHIELD", color: "#69cfff", duration: 2000 },
};
export interface Input {
  seq: number;
  x: number;
  z: number;
  aim: number;
  pitch: number;
  fire: boolean;
  jump: number;
  dash: number;
  use: number;
  swap: number;
  reload: number;
  weapon: WeaponId;
}
export const idleInput = (): Input => ({
  seq: 0,
  x: 0,
  z: 0,
  aim: 0,
  pitch: 0,
  fire: false,
  jump: 0,
  dash: 0,
  use: 0,
  swap: 0,
  reload: 0,
  weapon: "rifle",
});
export interface Player extends Body {
  id: string;
  name: string;
  team: number;
  slot: number;
  bot: boolean;
  aim: number;
  pitch: number;
  hp: number;
  score: number;
  kills: number;
  deaths: number;
  respawnAt: number;
  shieldUntil: number;
  nextShot: number;
  power: Power | null;
  powerUntil: number;
  storedPower: Power | null;
  ack: number;
  actions: {
    jump: number;
    dash: number;
    use: number;
    swap: number;
    reload: number;
  };
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  reloadUntil: number;
  switchUntil: number;
  life: number;
}
export interface Pickup extends Vec3 {
  id: number;
  kind: Power;
  readyAt: number;
}
export interface Bullet extends Vec3 {
  id: number;
  owner: string;
  team: number;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
  damage: number;
  weapon: WeaponId;
  shotId: number;
}
export interface Beam {
  id: number;
  owner: string;
  shotId: number;
  segment: number;
  team: number;
  start: Vec3;
  end: Vec3;
  until: number;
}
export interface Feed {
  id: number;
  killer: string;
  victim: string;
  team: number;
  points: number;
  time: number;
}
export type EventKind =
  | "shot"
  | "laser"
  | "hit"
  | "kill"
  | "pickup"
  | "use"
  | "dash"
  | "jump"
  | "land"
  | "step"
  | "round"
  | "reload"
  | "empty"
  | "block"
  | "switch";
export interface GameEvent extends Vec3 {
  id: number;
  kind: EventKind;
  time: number;
  actor: string;
  target?: string;
  team: number;
  power?: Power;
  source?: Vec3;
  weapon?: WeaponId;
  mode?: "normal" | "double" | "laser";
  shotId?: number;
}
export type Phase = "playing" | "intermission" | "finished";
export interface Snapshot {
  protocol: number;
  now: number;
  round: number;
  phase: Phase;
  endsAt: number;
  players: Player[];
  pickups: Pickup[];
  bullets: Bullet[];
  beams: Beam[];
  scores: number[];
  feed: Feed[];
  events: GameEvent[];
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
  | { type: "join"; name: string; team: number; protocol: number }
  | { type: "input"; input: Input }
  | { type: "rematch" };
export type ServerMessage =
  | {
      type: "welcome";
      id: string;
      code: string;
      protocol: number;
      arena: Arena;
    }
  | { type: "state"; state: Snapshot }
  | { type: "error"; message: string };
export function validName(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9 _-]{1,16}$/.test(v.trim());
}
export function validInput(v: unknown): v is Input {
  if (!v || typeof v !== "object") return false;
  const i = v as Input;
  return (
    [i.x, i.z, i.aim, i.pitch].every(Number.isFinite) &&
    Math.abs(i.x) <= 1 &&
    Math.abs(i.z) <= 1 &&
    Math.abs(i.aim) <= Math.PI * 4 &&
    Math.abs(i.pitch) <= Math.PI / 2 &&
    typeof i.fire === "boolean" &&
    validWeapon(i.weapon) &&
    [i.seq, i.jump, i.dash, i.use, i.swap, i.reload].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  );
}
export function movementSpeed(p: Player, now: number) {
  return SPEED * (p.power === "speed" && p.powerUntil > now ? 1.5 : 1);
}
let defaultNavigation: Navigation | undefined;
export class Game {
  arena = createArena();
  navigation: Navigation;
  players: Player[] = [];
  pickups: Pickup[] = [];
  bullets: Bullet[] = [];
  beams: Beam[] = [];
  events: GameEvent[] = [];
  scores = [0, 0, 0, 0];
  feed: Feed[] = [];
  round = 1;
  phase: Phase = "playing";
  now = 0;
  endsAt = ROUND_MS;
  private serial = 0;
  private inputs = new Map<string, { input: Input; at: number }>();
  private shotPresses = new Set<string>();
  private bots = new Map<
    string,
    { path: Waypoint[]; nextPath: number; seq: number }
  >();
  private steps = new Map<string, number>();
  constructor(private random: () => number = Math.random) {
    this.navigation = defaultNavigation ??= new Navigation(this.arena);
    for (let i = 0; i < 8; i++) this.players.push(this.makeBot(i));
    this.resetPickups();
  }
  private emit(
    kind: EventKind,
    p: Player,
    target?: string,
    power?: Power,
    source?: Vec3,
  ) {
    this.events.push({
      id: ++this.serial,
      kind,
      time: this.now,
      actor: p.id,
      target,
      team: p.team,
      x: p.x,
      y: p.y + EYE_HEIGHT,
      z: p.z,
      power,
      source,
      weapon: p.weapon,
    });
    return this.events[this.events.length - 1];
  }
  private spawn(p: Player) {
    const s = this.arena.spawns[p.team];
    Object.assign(p, {
      ...s,
      x: s.x + (p.slot % 2 ? (p.team % 2 ? -48 : 48) : 0),
      vy: 0,
      grounded: true,
      hp: 100,
      respawnAt: 0,
      shieldUntil: this.now + 1000,
      nextShot: this.now + 350,
      weapon: "rifle",
      ammo: fullAmmo(),
      reloadUntil: 0,
      switchUntil: 0,
      life: p.life + 1,
      power: null,
      powerUntil: 0,
      storedPower: null,
      dashUntil: 0,
      dashReadyAt: 0,
      dashX: 0,
      dashZ: 0,
    });
    this.inputs.delete(p.id);
    this.shotPresses.delete(p.id);
    this.bots.delete(p.id);
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
      z: 0,
      vy: 0,
      grounded: true,
      aim: 0,
      pitch: 0,
      hp: 100,
      score: 0,
      kills: 0,
      deaths: 0,
      respawnAt: 0,
      shieldUntil: 0,
      nextShot: 0,
      power: null,
      powerUntil: 0,
      storedPower: null,
      dashUntil: 0,
      dashReadyAt: 0,
      dashX: 0,
      dashZ: 0,
      ack: 0,
      actions: { jump: 0, dash: 0, use: 0, swap: 0, reload: 0 },
      weapon: "rifle",
      ammo: fullAmmo(),
      reloadUntil: 0,
      switchUntil: 0,
      life: 0,
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
    this.bullets = this.bullets.filter((b) => b.owner !== p.id);
    p.id = id;
    p.name = name.trim();
    p.bot = false;
    p.aim = Math.atan2(800 - p.z, 1200 - p.x);
    this.players[index] = p;
    return p;
  }
  removeHuman(id: string) {
    const i = this.players.findIndex((p) => p.id === id && !p.bot);
    if (i >= 0) this.players[i] = this.makeBot(i);
    this.inputs.delete(id);
    this.shotPresses.delete(id);
    this.bullets = this.bullets.filter((b) => b.owner !== id);
  }
  setInput(id: string, input: Input) {
    const p = this.players.find((p) => p.id === id && !p.bot);
    if (
      !p ||
      !validInput(input) ||
      input.seq <= Math.max(p.ack, this.inputs.get(id)?.input.seq ?? -1)
    )
      return;
    const old = this.inputs.get(id)?.input;
    if (input.fire && !old?.fire && p.hp > 0 && this.phase === "playing")
      this.shotPresses.add(id);
    this.inputs.set(id, { input: { ...input }, at: this.now });
  }
  get humans() {
    return this.players.filter((p) => !p.bot).length;
  }
  info(code: string): RoomInfo {
    return {
      code,
      humans: this.humans,
      teams: TEAMS.map(
        (_, t) => this.players.filter((p) => !p.bot && p.team === t).length,
      ),
      members: this.players
        .filter((p) => !p.bot)
        .map((p) => ({ name: p.name, team: p.team })),
      round: this.round,
      phase: this.phase,
      scores: [...this.scores],
      updatedAt: Date.now(),
    };
  }
  snapshot(): Snapshot {
    return {
      protocol: PROTOCOL,
      now: this.now,
      round: this.round,
      phase: this.phase,
      endsAt: this.endsAt,
      players: this.players.map((p) => ({
        ...p,
        actions: { ...p.actions },
        ammo: { ...p.ammo },
      })),
      pickups: this.pickups.map((p) => ({ ...p })),
      bullets: this.bullets.map((b) => ({ ...b })),
      beams: this.beams.map((b) => ({ ...b })),
      scores: [...this.scores],
      feed: [...this.feed],
      events: [...this.events],
    };
  }
  private randomPower() {
    return POWER_TYPES[Math.floor(this.random() * POWER_TYPES.length)];
  }
  private placePickup(p: Pickup) {
    const spots = this.arena.supplies.filter(
      (s) =>
        !bodyBlocked(this.arena, s.x, s.y, s.z, 36) &&
        this.arena.spawns.every((v) => distance(v, s) > 250) &&
        this.pickups.every(
          (v) => v.id === p.id || v.readyAt !== 0 || distance(v, s) >= 130,
        ) &&
        this.players.every((v) => v.hp <= 0 || distance(v, s) > 90) &&
        distance(p, s) > 100,
    );
    if (!spots.length) {
      p.readyAt = this.now + 1000;
      return;
    }
    Object.assign(p, spots[Math.floor(this.random() * spots.length)]);
    p.readyAt = 0;
  }
  private resetPickups() {
    this.pickups = [];
    const kinds = [...POWER_TYPES];
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    for (let id = 0; id < 7; id++) {
      const p: Pickup = {
        id,
        x: -1000,
        y: 0,
        z: -1000,
        kind: kinds[id] ?? this.randomPower(),
        readyAt: 0,
      };
      this.placePickup(p);
      this.pickups.push(p);
    }
    this.beams = [];
  }
  rematch() {
    if (this.phase !== "finished") return;
    this.round = 1;
    this.phase = "playing";
    this.endsAt = this.now + ROUND_MS;
    this.scores = [0, 0, 0, 0];
    this.feed = [];
    this.bullets = [];
    this.events = [];
    this.resetPickups();
    for (const p of this.players) {
      p.score = p.kills = p.deaths = 0;
      this.spawn(p);
    }
    this.emit("round", this.players[0]);
  }
  private botInput(p: Player): Input {
    let brain = this.bots.get(p.id);
    if (!brain) {
      brain = { path: [], nextPath: 0, seq: p.ack };
      this.bots.set(p.id, brain);
    }
    const eye = { x: p.x, y: p.y + EYE_HEIGHT, z: p.z };
    const enemies = this.players
      .filter((q) => q.team !== p.team && q.hp > 0)
      .sort((a, b) => distance(a, p) - distance(b, p));
    const target =
      enemies.find((q) =>
        visible(this.arena, eye, { x: q.x, y: q.y + 35, z: q.z }),
      ) ?? enemies[0];
    const i: Input = {
      ...idleInput(),
      ...p.actions,
      seq: ++brain.seq,
      aim: p.aim,
      pitch: p.pitch,
      weapon: p.weapon,
    };
    if (!target) return i;
    const clear = visible(this.arena, eye, {
      x: target.x,
      y: target.y + 35,
      z: target.z,
    });
    const d = distance(target, p);
    if (clear && this.now >= p.switchUntil && !p.reloadUntil) {
      i.weapon = d < 150 ? "shotgun" : d < 450 ? "smg" : "rifle";
      if (p.ammo[i.weapon] === 0) i.reload++;
    }
    if (this.now >= brain.nextPath || !brain.path.length) {
      brain.nextPath = this.now + 1200;
      let goal: Vec3 = target;
      if (!p.storedPower) {
        const supply = this.pickups
          .filter((q) => !q.readyAt)
          .sort((a, b) => distance(a, p) - distance(b, p))[0];
        if (supply) goal = supply;
      }
      if (p.hp <= 25 && clear) goal = this.arena.spawns[p.team];
      brain.path = this.navigation.path(p, goal);
    }
    while (brain.path.length && distance(p, brain.path[0]) < 10)
      brain.path.shift();
    const next = brain.path[0];
    if (next) {
      const len = Math.hypot(next.x - p.x, next.z - p.z);
      i.x = ((next.x - p.x) / Math.max(1, len)) * 0.8;
      i.z = ((next.z - p.z) / Math.max(1, len)) * 0.8;
      if (next.jump && p.grounded) i.jump++;
    }
    if (clear && d < 300 && Math.abs(p.y - target.y) < 5) {
      const angle =
        Math.atan2(target.z - p.z, target.x - p.x) +
        ((p.slot % 2 ? 1 : -1) * Math.PI) / 2;
      const x = p.x + Math.cos(angle) * 45,
        z = p.z + Math.sin(angle) * 45;
      if (
        !bodyBlocked(this.arena, x, p.y, z) &&
        Math.abs(supportHeight(this.arena, x, z, p.y + 8, RADIUS) - p.y) <= 8
      ) {
        i.x = Math.cos(angle) * 0.65;
        i.z = Math.sin(angle) * 0.65;
      }
    }
    i.aim =
      Math.atan2(target.z - p.z, target.x - p.x) +
      Math.sin(this.now / 300 + p.slot) * 0.06;
    i.pitch = Math.atan2(
      target.y + 35 - eye.y,
      Math.hypot(target.x - p.x, target.z - p.z),
    );
    i.fire = clear && d < 680 && this.random() > 0.18;
    if (
      p.storedPower &&
      !p.power &&
      ((p.storedPower === "shield" && p.hp < 65) ||
        (p.storedPower === "speed" && !!next) ||
        (clear && d < 650))
    )
      i.use++;
    if (
      p.grounded &&
      this.now >= p.dashReadyAt &&
      ((p.hp < 50 && clear) || (!clear && next && distance(p, next) > 150))
    )
      i.dash++;
    return i;
  }
  hit(
    victim: Player,
    shot: { owner: string; team: number; damage?: number },
    source?: Vec3,
  ) {
    if (victim.hp <= 0 || victim.team === shot.team || this.phase !== "playing")
      return false;
    if (
      this.now < victim.shieldUntil ||
      (victim.power === "shield" && this.now < victim.powerUntil)
    ) {
      this.emit("block", victim, shot.owner, victim.power ?? undefined, source);
      return false;
    }
    const killer = this.players.find((p) => p.id === shot.owner);
    victim.hp = Math.max(0, victim.hp - (shot.damage ?? 25));
    if (killer)
      this.emit(
        "hit",
        victim,
        killer.id,
        undefined,
        source ?? { x: killer.x, y: killer.y + EYE_HEIGHT, z: killer.z },
      );
    if (victim.hp > 0) return true;
    victim.deaths++;
    victim.respawnAt = this.now + RESPAWN_MS;
    victim.power = null;
    victim.storedPower = null;
    victim.powerUntil = 0;
    victim.dashUntil = 0;
    victim.reloadUntil = victim.switchUntil = 0;
    this.shotPresses.delete(victim.id);
    if (killer) {
      killer.kills++;
      killer.score++;
      this.scores[killer.team]++;
      this.emit("kill", victim, killer.id);
    }
    this.feed.unshift({
      id: ++this.serial,
      killer: killer?.name ?? "ROBOT",
      victim: victim.name,
      team: shot.team,
      points: killer ? 1 : 0,
      time: this.now,
    });
    this.feed = this.feed.slice(0, 5);
    return true;
  }
  private nearestVictim(
    o: Vec3,
    d: Vec3,
    limit: number,
    team: number,
    ignore = new Set<string>(),
  ) {
    let result: { p: Player; distance: number } | undefined;
    for (const p of this.players) {
      if (p.hp <= 0 || p.team === team || ignore.has(p.id)) continue;
      const hit = rayBox(
        o,
        d,
        {
          x: p.x - RADIUS,
          y: p.y,
          z: p.z - RADIUS,
          w: RADIUS * 2,
          h: BODY_HEIGHT,
          d: RADIUS * 2,
        },
        limit,
      );
      if (hit && (!result || hit.distance < result.distance))
        result = { p, distance: hit.distance };
    }
    return result;
  }
  private reload(p: Player) {
    if (
      p.reloadUntil ||
      this.now < p.switchUntil ||
      p.ammo[p.weapon] >= WEAPONS[p.weapon].magazine
    )
      return;
    p.reloadUntil = this.now + WEAPONS[p.weapon].reload;
    this.emit("reload", p);
  }
  private fire(p: Player) {
    const config = WEAPONS[p.weapon];
    const eye = { x: p.x, y: p.y + EYE_HEIGHT, z: p.z };
    p.ammo[p.weapon]--;
    const event = this.emit(p.power === "laser" ? "laser" : "shot", p);
    event.shotId = event.id;
    event.mode =
      p.power === "laser"
        ? "laser"
        : p.power === "double"
          ? "double"
          : "normal";
    if (p.power === "laser") {
      this.fireLaser(p, eye, direction(p.aim, p.pitch), event.id);
      return;
    }
    for (const offset of p.power === "double" ? [-8, 8] : [0]) {
      for (let pellet = 0; pellet < config.pellets; pellet++) {
        const center = direction(p.aim, p.pitch);
        const spread =
          config.pellets === 1
            ? 0
            : Math.tan(Math.PI / 30) * Math.sqrt(this.random());
        const theta = this.random() * Math.PI * 2;
        const right = { x: -Math.sin(p.aim), y: 0, z: Math.cos(p.aim) };
        const up = {
          x: -Math.cos(p.aim) * Math.sin(p.pitch),
          y: Math.cos(p.pitch),
          z: -Math.sin(p.aim) * Math.sin(p.pitch),
        };
        const dir = {
          x:
            center.x +
            spread * (Math.cos(theta) * right.x + Math.sin(theta) * up.x),
          y: center.y + spread * Math.sin(theta) * up.y,
          z:
            center.z +
            spread * (Math.cos(theta) * right.z + Math.sin(theta) * up.z),
        };
        const length = Math.hypot(dir.x, dir.y, dir.z);
        const origin = {
          x: eye.x + right.x * offset,
          y: eye.y,
          z: eye.z + right.z * offset,
        };
        if (offset && !visible(this.arena, eye, origin)) continue;
        this.bullets.push({
          id: ++this.serial,
          owner: p.id,
          team: p.team,
          ...origin,
          vx: (dir.x / length) * BULLET_SPEED,
          vy: (dir.y / length) * BULLET_SPEED,
          vz: (dir.z / length) * BULLET_SPEED,
          ttl: (config.range / BULLET_SPEED) * 1000,
          damage: config.damage,
          weapon: p.weapon,
          shotId: event.id,
        });
      }
    }
  }
  private fireLaser(p: Player, origin: Vec3, dir: Vec3, shotId: number) {
    let remaining = 1600;
    const hitIds = new Set<string>();
    for (let bounce = 0; bounce <= 3 && remaining > 0; bounce++) {
      const wall = rayWorld(this.arena, origin, dir, remaining),
        range = wall?.distance ?? remaining;
      let victim = this.nearestVictim(origin, dir, range, p.team, hitIds);
      while (victim) {
        hitIds.add(victim.p.id);
        this.hit(victim.p, { owner: p.id, team: p.team }, origin);
        victim = this.nearestVictim(origin, dir, range, p.team, hitIds);
      }
      const end = {
        x: origin.x + dir.x * range,
        y: origin.y + dir.y * range,
        z: origin.z + dir.z * range,
      };
      this.beams.push({
        id: ++this.serial,
        team: p.team,
        owner: p.id,
        shotId,
        segment: bounce,
        start: { ...origin },
        end,
        until: this.now + 170,
      });
      remaining -= range;
      if (!wall) break;
      const dot =
        dir.x * wall.normal.x + dir.y * wall.normal.y + dir.z * wall.normal.z;
      dir = {
        x: dir.x - 2 * dot * wall.normal.x,
        y: dir.y - 2 * dot * wall.normal.y,
        z: dir.z - 2 * dot * wall.normal.z,
      };
      origin = {
        x: end.x + dir.x * 0.1,
        y: end.y + dir.y * 0.1,
        z: end.z + dir.z * 0.1,
      };
      remaining -= 0.1;
    }
  }
  tick(ms: number) {
    const dt = Math.min(100, Math.max(0, ms)),
      start = this.now;
    this.now += dt;
    this.events = this.events
      .filter((e) => this.now - e.time < 1200)
      .slice(-256);
    this.beams = this.beams.filter((b) => b.until > this.now);
    if (this.phase === "finished") return;
    if (this.now >= this.endsAt) {
      this.bullets = [];
      this.beams = [];
      this.events = [];
      if (this.phase === "intermission") {
        this.round++;
        this.phase = "playing";
        this.endsAt = this.now + ROUND_MS;
        this.resetPickups();
        for (const p of this.players) this.spawn(p);
      } else {
        this.phase = this.round === 3 ? "finished" : "intermission";
        this.endsAt = this.now + (this.phase === "finished" ? 0 : BREAK_MS);
        for (const p of this.players) {
          p.dashUntil = 0;
          p.power = null;
          p.storedPower = null;
        }
      }
      this.inputs.clear();
      this.shotPresses.clear();
      this.emit("round", this.players[0]);
      return;
    }
    for (const p of this.players) {
      const stored = this.inputs.get(p.id);
      if (stored) {
        p.ack = stored.input.seq;
        if (p.hp <= 0 || this.phase !== "playing")
          for (const key of ["jump", "dash", "use", "swap", "reload"] as const)
            p.actions[key] = Math.max(p.actions[key], stored.input[key]);
      }
    }
    if (this.phase !== "playing") return;
    for (const pickup of this.pickups)
      if (pickup.readyAt > 0 && pickup.readyAt <= this.now) {
        pickup.kind = this.randomPower();
        this.placePickup(pickup);
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
        : stored && this.now - stored.at <= 300
          ? stored.input
          : { ...idleInput(), aim: p.aim, pitch: p.pitch, weapon: p.weapon };
      const actions = {
        jump: false,
        dash: false,
        use: false,
        swap: false,
        reload: false,
      };
      for (const key of ["jump", "dash", "use", "swap", "reload"] as const) {
        actions[key] = i[key] > p.actions[key];
        p.actions[key] = Math.max(p.actions[key], i[key]);
      }
      p.ack = Math.max(p.ack, i.seq);
      p.aim = i.aim;
      p.pitch = i.pitch;
      if (p.powerUntil <= this.now) p.power = null;
      if (actions.use && p.storedPower && !p.power) {
        p.power = p.storedPower;
        p.storedPower = null;
        p.powerUntil = this.now + POWER_INFO[p.power].duration;
        this.emit("use", p, undefined, p.power);
      }
      if (p.reloadUntil && this.now >= p.reloadUntil) {
        p.ammo[p.weapon] = WEAPONS[p.weapon].magazine;
        p.reloadUntil = 0;
      }
      if (i.weapon !== p.weapon) {
        p.reloadUntil = 0;
        p.weapon = i.weapon;
        p.switchUntil = this.now + 250;
        this.emit("switch", p);
      }
      if (actions.reload) this.reload(p);
      const previous = { x: p.x, y: p.y, z: p.z };
      const motion = moveBody(
        p,
        { ...i, jump: actions.jump, dash: actions.dash },
        this.arena,
        dt,
        start,
        movementSpeed(p, this.now),
      );
      for (const kind of ["jump", "dash", "land"] as const)
        if (motion[kind]) this.emit(kind, p);
      if (
        p.grounded &&
        distance(previous, p) > 2 &&
        this.now - (this.steps.get(p.id) ?? 0) > 350
      ) {
        this.emit("step", p);
        this.steps.set(p.id, this.now);
      }
      for (const pickup of this.pickups)
        if (
          !pickup.readyAt &&
          distance(p, pickup) < 40 &&
          (!p.storedPower || actions.swap)
        ) {
          p.storedPower = pickup.kind;
          pickup.readyAt = this.now + 10000;
          this.emit("pickup", p, undefined, pickup.kind);
          break;
        }
      const pressed = this.shotPresses.delete(p.id);
      if (
        (i.fire || pressed) &&
        this.now >= p.nextShot &&
        this.now >= p.switchUntil &&
        !p.reloadUntil
      ) {
        if (p.ammo[p.weapon] <= 0) {
          this.emit("empty", p);
          this.reload(p);
        } else {
          const interval =
            WEAPONS[p.weapon].interval * (p.power === "rapid" ? 0.5 : 1);
          p.nextShot = (p.nextShot < start ? this.now : p.nextShot) + interval;
          this.fire(p);
          if (p.ammo[p.weapon] === 0) this.reload(p);
        }
      }
    }
    for (let a = 0; a < this.players.length; a++)
      for (let b = a + 1; b < this.players.length; b++) {
        const p = this.players[a],
          q = this.players[b];
        if (
          p.hp <= 0 ||
          q.hp <= 0 ||
          p.y + BODY_HEIGHT <= q.y ||
          q.y + BODY_HEIGHT <= p.y
        )
          continue;
        const dx = q.x - p.x,
          dz = q.z - p.z,
          len = Math.hypot(dx, dz);
        if (len >= RADIUS * 2) continue;
        const nx = len ? dx / len : 1,
          nz = len ? dz / len : 0,
          push = (RADIUS * 2 - len) / 2;
        for (const [body, sign] of [
          [p, -1],
          [q, 1],
        ] as const) {
          const x = body.x + nx * push * sign,
            z = body.z + nz * push * sign;
          if (!bodyBlocked(this.arena, x, body.y, z)) {
            body.x = x;
            body.z = z;
          }
        }
      }
    this.bullets = this.bullets.filter((b) => {
      const travel = (BULLET_SPEED * Math.min(dt, b.ttl)) / 1000,
        dir = {
          x: b.vx / BULLET_SPEED,
          y: b.vy / BULLET_SPEED,
          z: b.vz / BULLET_SPEED,
        };
      const wall = rayWorld(this.arena, b, dir, travel);
      const victim = this.nearestVictim(
        b,
        dir,
        wall ? Math.max(0, wall.distance - 0.01) : travel,
        b.team,
      );
      if (victim) {
        this.hit(victim.p, b, { x: b.x, y: b.y, z: b.z });
        return false;
      }
      if (wall) return false;
      b.x += dir.x * travel;
      b.y += dir.y * travel;
      b.z += dir.z * travel;
      b.ttl -= dt;
      return b.ttl > 0;
    });
  }
}
