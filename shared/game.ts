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
export const PROTOCOL = 6;
export const TEAMS = [
  { name: "EMBER", color: "#ff765e", letter: "E" },
  { name: "TIDAL", color: "#5bbaff", letter: "T" },
  { name: "JADE", color: "#70e1b0", letter: "J" },
  { name: "VOLT", color: "#e6cb66", letter: "V" },
] as const;
export const ROUND_MS = 90_000,
  BREAK_MS = 5000,
  RESPAWN_MS = 3000,
  BULLET_SPEED = 1640,
  FIRE_MS = 150;
export const SYNC_WINDOW_MS = 3000,
  SYNC_DURATION_MS = 3000,
  SYNC_COOLDOWN_MS = 12_000,
  SYNC_SHIELD = 15;
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
  ads: boolean;
  charge: boolean;
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
  ads: false,
  charge: false,
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
  careerId?: string;
  skin: string | null;
  tracer: string | null;
  aim: number;
  pitch: number;
  ads: boolean;
  hp: number;
  armor: number;
  battery: boolean;
  chargeStart: number;
  chargeLocked: boolean;
  chargesCompleted: number;
  score: number;
  kills: number;
  humanKills: number;
  deaths: number;
  respawnAt: number;
  shieldUntil: number;
  syncUntil: number;
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
export interface BatteryPickup extends Vec3 {
  id: number;
  readyAt: number;
}
export interface SniperPickup extends Vec3 {
  available: boolean;
  ammo: number;
  readyAt: number;
  expiresAt: number;
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
  tracer: string | null;
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
  weapon?: WeaponId;
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
  | "switch"
  | "impact"
  | "charge"
  | "battery"
  | "sniper-spawn"
  | "sniper-pickup"
  | "sync";
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
  normal?: Vec3;
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
  batteries: BatteryPickup[];
  sniper: SniperPickup;
  bullets: Bullet[];
  beams: Beam[];
  scores: number[];
  syncReadyAt: number[];
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
export interface MatchResult {
  id: string;
  players: {
    careerId: string;
    name: string;
    humanKills: number;
    botKills: number;
    charges: number;
    points?: number;
    won: boolean;
    qualified: boolean;
  }[];
}
export interface MatchProgress {
  id: string;
  careerId: string;
  points: number;
  humanKills: number;
  botKills: number;
  charges: number;
}
export type ClientMessage =
  | {
      type: "join";
      name: string;
      team: number;
      protocol: number;
      token?: string;
    }
  | { type: "input"; input: Input }
  | { type: "leave" }
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
  | { type: "left" }
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
    typeof i.ads === "boolean" &&
    typeof i.charge === "boolean" &&
    validWeapon(i.weapon) &&
    [i.seq, i.jump, i.dash, i.use, i.swap, i.reload].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  );
}
export function movementSpeed(p: Player, now: number) {
  return SPEED * Math.max(
    p.power === "speed" && p.powerUntil > now ? 1.5 : 1,
    p.syncUntil > now ? 1.1 : 1,
  );
}
let defaultNavigation: Navigation | undefined;
export class Game {
  arena = createArena();
  navigation: Navigation;
  players: Player[] = [];
  pickups: Pickup[] = [];
  batteries: BatteryPickup[] = [];
  sniper: SniperPickup = { x: 1200, y: 0, z: 800, available: true, ammo: 5, readyAt: 0, expiresAt: 0 };
  bullets: Bullet[] = [];
  beams: Beam[] = [];
  events: GameEvent[] = [];
  scores = [0, 0, 0, 0];
  syncReadyAt = [0, 0, 0, 0];
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
  private syncMarks = new Map<string, { victim: string; attacker: string; at: number }>();
  private impactsThisTick = 0;
  private careerUpdates = new Set<string>();
  private careerStats = new Map<
    string,
    {
      name: string;
      points: number;
      humanKills: number;
      botKills: number;
      charges: number;
      pvpMs: number;
    }
  >();
  constructor(private random: () => number = Math.random) {
    this.navigation = defaultNavigation ??= new Navigation(this.arena);
    for (let i = 0; i < 8; i++) this.players.push(this.makeBot(i));
    this.resetPickups();
    this.resetBatteries();
    this.spawnSniper();
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
  private impact(p: Vec3, normal: Vec3, owner: string, team: number) {
    if (this.impactsThisTick++ >= 12) return;
    this.events.push({
      id: ++this.serial,
      kind: "impact",
      time: this.now,
      actor: owner,
      team,
      ...p,
      normal,
    });
  }
  private spawn(p: Player) {
    this.clearSyncMarks(p.id);
    const s = this.arena.spawns[p.team];
    Object.assign(p, {
      ...s,
      x: s.x + (p.slot % 2 ? (p.team % 2 ? -48 : 48) : 0),
      vy: 0,
      grounded: true,
      hp: 100,
      ads: false,
      armor: 100,
      battery: false,
      chargeStart: -1,
      chargeLocked: false,
      respawnAt: 0,
      shieldUntil: this.now + 1000,
      syncUntil: 0,
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
      skin: null,
      tracer: null,
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      grounded: true,
      aim: 0,
      pitch: 0,
      ads: false,
      hp: 100,
      armor: 100,
      battery: false,
      chargeStart: -1,
      chargeLocked: false,
      chargesCompleted: 0,
      score: 0,
      kills: 0,
      humanKills: 0,
      deaths: 0,
      respawnAt: 0,
      shieldUntil: 0,
      syncUntil: 0,
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
  addHuman(
    id: string,
    name: string,
    team: number,
    careerId?: string,
    equipped?: { skin: string | null; tracer: string | null },
  ) {
    if (!validName(name))
      throw new Error(
        "Use 1-16 English letters, numbers, spaces, hyphens or underscores.",
      );
    if (!Number.isInteger(team) || team < 0 || team > 3)
      throw new Error("Choose a valid team.");
    if (this.players.some((p) => p.id === id))
      throw new Error("Already in this room.");
    if (careerId && this.players.some((p) => !p.bot && p.careerId === careerId))
      throw new Error("This career is already in the room.");
    const index = this.players.findIndex((p) => p.team === team && p.bot);
    if (index < 0) throw new Error("This team is full. Choose another team.");
    const p = this.makeBot(index);
    this.clearSyncMarks(p.id);
    this.bullets = this.bullets.filter((b) => b.owner !== p.id);
    p.id = id;
    p.name = name.trim();
    p.bot = false;
    p.careerId = careerId;
    p.skin = equipped?.skin ?? null;
    p.tracer = equipped?.tracer ?? null;
    if (careerId && !this.careerStats.has(careerId))
      this.careerStats.set(careerId, {
        name: p.name,
        points: 0,
        humanKills: 0,
        botKills: 0,
        charges: 0,
        pvpMs: 0,
      });
    p.aim = Math.atan2(800 - p.z, 1200 - p.x);
    this.players[index] = p;
    return p;
  }
  removeHuman(id: string) {
    const i = this.players.findIndex((p) => p.id === id && !p.bot);
    if (i >= 0) {
      this.clearSyncMarks(id);
      this.dropSniper(this.players[i]);
      this.players[i] = this.makeBot(i);
    }
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
      batteries: this.batteries.map((p) => ({ ...p })),
      sniper: { ...this.sniper },
      bullets: this.bullets.map((b) => ({ ...b })),
      beams: this.beams.map((b) => ({ ...b })),
      scores: [...this.scores],
      syncReadyAt: [...this.syncReadyAt],
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
  private resetBatteries() {
    this.batteries = this.arena.batteries.map((site, id) => ({
      ...site,
      id,
      readyAt: 0,
    }));
  }
  private spawnSniper() {
    this.sniper = { x: 1200, y: 0, z: 800, available: true, ammo: 5, readyAt: 0, expiresAt: 0 };
    this.events.push({ id: ++this.serial, kind: "sniper-spawn", time: this.now,
      actor: "arena", team: 0, x: 1200, y: 0, z: 800 });
  }
  private dropSniper(p: Player) {
    if (p.ammo.sniper <= 0) return;
    this.sniper = { x: p.x, y: p.y, z: p.z, available: true,
      ammo: p.ammo.sniper, readyAt: 0, expiresAt: this.now + 20_000 };
    p.ammo.sniper = 0;
    if (p.weapon === "sniper") p.weapon = "rifle";
  }
  drainCareerProgress(id: string): MatchProgress[] {
    const updates = [...this.careerUpdates].map((careerId) => {
      const stats = this.careerStats.get(careerId)!;
      return { id, careerId, points: stats.points, humanKills: stats.humanKills,
        botKills: stats.botKills, charges: stats.charges };
    });
    this.careerUpdates.clear();
    return updates;
  }
  rematch() {
    if (this.phase !== "finished") return;
    this.careerStats.clear();
    this.careerUpdates.clear();
    for (const p of this.players)
      if (!p.bot && p.careerId)
        this.careerStats.set(p.careerId, {
          name: p.name,
          points: 0,
          humanKills: 0,
          botKills: 0,
          charges: 0,
          pvpMs: 0,
        });
    this.round = 1;
    this.phase = "playing";
    this.endsAt = this.now + ROUND_MS;
    this.scores = [0, 0, 0, 0];
    this.syncReadyAt = [0, 0, 0, 0];
    this.syncMarks.clear();
    this.feed = [];
    this.bullets = [];
    this.events = [];
    this.resetPickups();
    this.resetBatteries();
    this.spawnSniper();
    for (const p of this.players) {
      p.score = p.kills = p.humanKills = p.deaths = p.chargesCompleted = 0;
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
      if (!p.battery && p.armor < 60) {
        const battery = this.batteries
          .filter((q) => !q.readyAt)
          .sort((a, b) => distance(a, p) - distance(b, p))[0];
        if (battery) goal = battery;
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
    i.charge = p.battery && (p.armor < 40 || p.hp < 50) && !clear;
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
  private clearSyncMarks(id: string) {
    for (const [key, mark] of this.syncMarks)
      if (mark.victim === id || mark.attacker === id) this.syncMarks.delete(key);
  }
  private syncHit(victim: Player, attacker: Player) {
    const key = `${victim.id}:${attacker.team}`;
    const mark = this.syncMarks.get(key);
    const partner = mark && this.players.find((p) => p.id === mark.attacker);
    if (
      mark && partner && partner.hp > 0 && partner.id !== attacker.id &&
      this.now - mark.at <= SYNC_WINDOW_MS &&
      this.syncReadyAt[attacker.team] <= this.now
    ) {
      for (const p of [partner, attacker]) {
        p.armor = Math.min(100, p.armor + SYNC_SHIELD);
        p.syncUntil = this.now + SYNC_DURATION_MS;
      }
      this.syncReadyAt[attacker.team] = this.now + SYNC_COOLDOWN_MS;
      this.syncMarks.delete(key);
      this.emit("sync", attacker, victim.id, undefined, {
        x: partner.x, y: partner.y + EYE_HEIGHT, z: partner.z,
      });
    } else {
      this.syncMarks.set(key, {
        victim: victim.id, attacker: attacker.id, at: this.now,
      });
    }
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
    const damage = shot.damage ?? 25;
    const absorbed = Math.min(victim.armor, damage);
    victim.armor -= absorbed;
    victim.hp = Math.max(0, victim.hp - (damage - absorbed));
    if (victim.chargeStart >= 0) {
      victim.chargeStart = -1;
      victim.chargeLocked = true;
    }
    if (killer)
      this.emit(
        "hit",
        victim,
        killer.id,
        undefined,
        source ?? { x: killer.x, y: killer.y + EYE_HEIGHT, z: killer.z },
      );
    if (killer && killer.hp > 0 && damage > 0) this.syncHit(victim, killer);
    if (victim.hp > 0) return true;
    this.clearSyncMarks(victim.id);
    victim.deaths++;
    victim.respawnAt = this.now + RESPAWN_MS;
    victim.power = null;
    this.dropSniper(victim);
    victim.storedPower = null;
    victim.battery = false;
    victim.chargeStart = -1;
    victim.powerUntil = 0;
    victim.syncUntil = 0;
    victim.dashUntil = 0;
    victim.reloadUntil = victim.switchUntil = 0;
    this.shotPresses.delete(victim.id);
    if (killer) {
      killer.kills++;
      if (!killer.bot) {
        const stats = killer.careerId && this.careerStats.get(killer.careerId);
        if (victim.bot) {
          if (stats) stats.botKills++;
        } else {
          killer.humanKills++;
          if (stats) stats.humanKills++;
        }
        if (stats) {
          stats.points++;
          this.careerUpdates.add(killer.careerId!);
        }
      }
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
      p.weapon === "sniper" ||
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
    if (p.weapon === "sniper") {
      const event = this.emit("laser", p);
      this.fireSniper(p, eye, event.id);
      if (p.ammo.sniper === 0) {
        p.weapon = "rifle";
        this.sniper.readyAt = this.now + 30_000;
      }
      return;
    }
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
          tracer: p.tracer,
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
      this.impact(wall.point, wall.normal, p.id, p.team);
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
  private fireSniper(p: Player, origin: Vec3, shotId: number) {
    const aim = p.ads ? p.aim : p.aim + (this.random() - 0.5) * 0.12;
    const pitch = p.ads ? p.pitch : p.pitch + (this.random() - 0.5) * 0.12;
    const dir = direction(aim, pitch);
    const wall = rayWorld(this.arena, origin, dir, WEAPONS.sniper.range);
    const range = wall?.distance ?? WEAPONS.sniper.range;
    const hitIds = new Set<string>();
    let victim = this.nearestVictim(origin, dir, range, p.team, hitIds);
    while (victim) {
      hitIds.add(victim.p.id);
      this.hit(victim.p, { owner: p.id, team: p.team, damage: 200 }, origin);
      victim = this.nearestVictim(origin, dir, range, p.team, hitIds);
    }
    const end = { x: origin.x + dir.x * range, y: origin.y + dir.y * range,
      z: origin.z + dir.z * range };
    this.beams.push({ id: ++this.serial, owner: p.id, team: p.team,
      shotId, segment: 0, start: origin, end, until: this.now + 300, weapon: "sniper" });
    if (wall) this.impact(wall.point, wall.normal, p.id, p.team);
  }
  tick(ms: number) {
    const dt = Math.min(100, Math.max(0, ms)),
      start = this.now;
    this.now += dt;
    this.impactsThisTick = 0;
    this.events = this.events
      .filter((e) => this.now - e.time < 1200)
      .slice(-256);
    this.beams = this.beams.filter((b) => b.until > this.now);
    if (this.phase === "finished") return;
    if (this.now >= this.endsAt) {
      this.bullets = [];
      this.beams = [];
      this.events = [];
      this.syncMarks.clear();
      this.syncReadyAt = [0, 0, 0, 0];
      if (this.phase === "intermission") {
        this.round++;
        this.phase = "playing";
        this.endsAt = this.now + ROUND_MS;
        this.resetPickups();
        this.resetBatteries();
        for (const p of this.players) this.spawn(p);
        this.spawnSniper();
      } else {
        this.phase = this.round === 3 ? "finished" : "intermission";
        this.endsAt = this.now + (this.phase === "finished" ? 0 : BREAK_MS);
        for (const p of this.players) {
          p.dashUntil = 0;
          p.power = null;
          p.storedPower = null;
          p.battery = false;
          p.chargeStart = -1;
          p.syncUntil = 0;
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
    if (this.sniper.available && this.sniper.expiresAt && this.now >= this.sniper.expiresAt) {
      this.sniper.available = false;
      this.sniper.expiresAt = 0;
      this.sniper.readyAt = this.now + 30_000;
    } else if (!this.sniper.available && this.sniper.readyAt && this.now >= this.sniper.readyAt) {
      this.spawnSniper();
    }
    for (const p of this.players)
      if (
        !p.bot &&
        p.careerId &&
        this.players.some((q) => !q.bot && q.team !== p.team)
      )
        this.careerStats.get(p.careerId)!.pvpMs += dt;
    for (const pickup of this.pickups)
      if (pickup.readyAt > 0 && pickup.readyAt <= this.now) {
        pickup.kind = this.randomPower();
        this.placePickup(pickup);
      }
    for (const battery of this.batteries)
      if (battery.readyAt > 0 && battery.readyAt <= this.now) {
        battery.readyAt = 0;
        this.events.push({
          id: ++this.serial,
          kind: "battery",
          time: this.now,
          actor: "arena",
          team: 0,
          x: battery.x,
          y: battery.y + 25,
          z: battery.z,
        });
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
      p.ads = i.ads;
      if (!i.charge) {
        p.chargeStart = -1;
        p.chargeLocked = false;
      } else if (
        p.battery &&
        !p.chargeLocked &&
        (p.hp < 100 || p.armor < 100)
      ) {
        if (p.chargeStart < 0) p.chargeStart = this.now;
        if (this.now - p.chargeStart >= 1500) {
          p.hp = p.armor = 100;
          p.battery = false;
          p.chargeStart = -1;
          p.chargeLocked = true;
          p.chargesCompleted++;
          const stats = p.careerId && this.careerStats.get(p.careerId);
          if (stats) {
            stats.charges++;
            this.careerUpdates.add(p.careerId!);
          }
          this.emit("charge", p);
        }
      }
      const charging = p.chargeStart >= 0;
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
      if (i.weapon !== p.weapon && (i.weapon !== "sniper" || p.ammo.sniper > 0)) {
        p.reloadUntil = 0;
        p.weapon = i.weapon;
        p.switchUntil = this.now + 250;
        this.emit("switch", p);
      }
      if (actions.reload) this.reload(p);
      const previous = { x: p.x, y: p.y, z: p.z };
      const motion = moveBody(
        p,
        {
          ...i,
          jump: charging ? false : actions.jump,
          dash: charging ? false : actions.dash,
        },
        this.arena,
        dt,
        start,
        movementSpeed(p, this.now) * (charging ? 0.35 : 1),
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
      for (const battery of this.batteries)
        if (!battery.readyAt && !p.battery && distance(p, battery) < 40) {
          p.battery = true;
          battery.readyAt = this.now + 20_000;
          this.emit("pickup", p);
          break;
        }
      if (!p.bot && this.sniper.available && p.ammo.sniper === 0 &&
          distance(p, this.sniper) < 45) {
        p.ammo.sniper = this.sniper.ammo;
        p.weapon = "sniper";
        p.switchUntil = this.now + 250;
        this.sniper.available = false;
        this.sniper.readyAt = 0;
        this.sniper.expiresAt = 0;
        this.emit("sniper-pickup", p);
      }
      const pressed = this.shotPresses.delete(p.id);
      if (
        !charging &&
        (i.fire || pressed) &&
        this.now >= p.nextShot &&
        this.now >= p.switchUntil &&
        !p.reloadUntil
      ) {
        if (p.ammo[p.weapon] <= 0) {
          this.emit("empty", p);
          if (p.weapon !== "sniper") this.reload(p);
        } else {
          const interval = WEAPONS[p.weapon].interval *
            (p.weapon !== "sniper" && p.power === "rapid" ? 0.5 : 1);
          p.nextShot = (p.nextShot < start ? this.now : p.nextShot) + interval;
          this.fire(p);
          if (p.weapon !== "sniper" && p.ammo[p.weapon] === 0) this.reload(p);
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
      if (wall) {
        this.impact(wall.point, wall.normal, b.owner, b.team);
        return false;
      }
      b.x += dir.x * travel;
      b.y += dir.y * travel;
      b.z += dir.z * travel;
      b.ttl -= dt;
      return b.ttl > 0;
    });
  }
  matchResult(id: string): MatchResult {
    const max = Math.max(...this.scores);
    return {
      id,
      players: this.players
        .filter((p) => !p.bot && p.careerId)
        .map((p) => {
          const stats = this.careerStats.get(p.careerId!)!;
          return {
            careerId: p.careerId!,
            name: p.name,
            points: stats.points,
            humanKills: stats.humanKills,
            botKills: stats.botKills,
            charges: stats.charges,
            won: this.scores[p.team] === max,
            qualified: stats.pvpMs >= 60_000,
          };
        }),
    };
  }
}
