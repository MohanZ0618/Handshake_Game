import type { MatchResult, MatchProgress } from "./game";

export const SHOP = [
  {
    id: "skin-cinder",
    type: "skin",
    label: "Cinder Steel",
    color: "#f52242",
    price: 0,
  },
  {
    id: "skin-cinder-graphite",
    type: "skin",
    label: "Cinder Graphite",
    color: "#272b39",
    price: 0,
  },
  {
    id: "skin-cinder-teal",
    type: "skin",
    label: "Cinder Teal",
    color: "#00ddba",
    price: 0,
  },
  {
    id: "skin-oxide",
    type: "skin",
    label: "Oxide Blue",
    color: "#0075ff",
    price: 10,
  },
  {
    id: "skin-sand",
    type: "skin",
    label: "Desert Alloy",
    color: "#ffc400",
    price: 20,
  },
  {
    id: "tracer-ember",
    type: "tracer",
    label: "Ember Trail",
    color: "#ff7048",
    price: 35,
  },
  {
    id: "tracer-ion",
    type: "tracer",
    label: "Ion Trail",
    color: "#70baff",
    price: 60,
  },
  {
    id: "tracer-gold",
    type: "tracer",
    label: "Gold Trail",
    color: "#f4d27e",
    price: 90,
  },
] as const;
export const STARTER_SKIN_IDS = [
  "skin-cinder",
  "skin-cinder-graphite",
  "skin-cinder-teal",
] as const;
export type ShopItemId = (typeof SHOP)[number]["id"];
export type GoalId = "kills" | "matches" | "wins" | "charges";
export const GOALS: {
  id: GoalId;
  label: string;
  unit: string;
  step: number;
  reward: number;
}[] = [
  {
    id: "kills",
    label: "Hunter",
    unit: "human or robot eliminations",
    step: 1,
    reward: 50,
  },
  {
    id: "matches",
    label: "Field Veteran",
    unit: "completed matches",
    step: 1,
    reward: 40,
  },
  { id: "wins", label: "Squad Victor", unit: "match wins", step: 1, reward: 80 },
  {
    id: "charges",
    label: "Power Surge",
    unit: "shield cells used",
    step: 1,
    reward: 30,
  },
];
export const goalTarget = (id: GoalId, level: number) =>
  GOALS.find((g) => g.id === id)!.step * level;
export interface CareerProfile {
  id: string;
  name: string;
  coins: number;
  totalPoints: number;
  matches: number;
  wins: number;
  goalMatches: number;
  goalWins: number;
  humanKills: number;
  botKills: number;
  bestHumanKills: number;
  charges: number;
  claimed: Record<GoalId, number>;
  owned: ShopItemId[];
  equipped: { skin: ShopItemId | null; tracer: ShopItemId | null };
}
export interface CareerData {
  profiles: Record<string, CareerProfile>;
  tokens: Record<string, string>;
  settled: Record<string, true>;
  progress: Record<string, { points: number; humanKills: number; botKills: number; charges: number }>;
  latestPredator: { name: string; kills: number; matchId: string } | null;
}
export const emptyCareer = (): CareerData => ({
  profiles: {},
  tokens: {},
  settled: {},
  progress: {},
  latestPredator: null,
});
export function createCareer(data: CareerData, hash: string, name: string) {
  const id = crypto.randomUUID();
  const profile: CareerProfile = {
    id,
    name: name.trim(),
    coins: 0,
    totalPoints: 0,
    matches: 0,
    wins: 0,
    goalMatches: 0,
    goalWins: 0,
    humanKills: 0,
    botKills: 0,
    bestHumanKills: 0,
    charges: 0,
    claimed: { kills: 0, matches: 0, wins: 0, charges: 0 },
    owned: [],
    equipped: { skin: null, tracer: null },
  };
  data.profiles[id] = profile;
  data.tokens[hash] = id;
  return profile;
}
export function migrateCareer(data: CareerData): CareerData {
  data.progress ??= {};
  for (const profile of Object.values(data.profiles)) {
    profile.botKills ??= 0;
    profile.totalPoints ??= profile.humanKills + profile.botKills;
    profile.goalMatches ??= profile.matches;
    profile.goalWins ??= profile.wins;
  }
  return data;
}
export function applyProgress(data: CareerData, update: MatchProgress) {
  const profile = data.profiles[update.careerId];
  if (!profile) return false;
  const key = `${update.id}:${update.careerId}`;
  const old = data.progress[key] ?? { points: 0, humanKills: 0, botKills: 0, charges: 0 };
  if (
    update.points < old.points || update.humanKills < old.humanKills ||
    update.botKills < old.botKills || update.charges < old.charges
  ) return false;
  if (update.points === old.points && update.humanKills === old.humanKills &&
      update.botKills === old.botKills && update.charges === old.charges) return false;
  profile.totalPoints += update.points - old.points;
  profile.humanKills += update.humanKills - old.humanKills;
  profile.botKills += update.botKills - old.botKills;
  profile.charges += update.charges - old.charges;
  data.progress[key] = {
    points: update.points, humanKills: update.humanKills,
    botKills: update.botKills, charges: update.charges,
  };
  return true;
}
export function settleCareer(data: CareerData, result: MatchResult) {
  if (data.settled[result.id]) return false;
  data.settled[result.id] = true;
  const eligible = result.players.filter((p) => p.qualified);
  if (eligible.length) {
    const predator = [...eligible].sort(
      (a, b) => b.humanKills - a.humanKills || a.name.localeCompare(b.name),
    )[0];
    data.latestPredator = {
      name: predator.name,
      kills: predator.humanKills,
      matchId: result.id,
    };
  }
  for (const p of result.players) {
    const profile = data.profiles[p.careerId];
    if (!profile) continue;
    applyProgress(data, { ...p, id: result.id, points: p.points ?? p.humanKills + p.botKills });
    profile.coins += 20 + Math.min(p.botKills, 20) * 5;
    profile.goalMatches++;
    profile.goalWins += Number(p.won);
    if (!p.qualified) {
      continue;
    }
    profile.matches++;
    profile.wins += Number(p.won);
    profile.bestHumanKills = Math.max(profile.bestHumanKills, p.humanKills);
    profile.coins += p.humanKills * 15 + (p.won ? 40 : 0);
  }
  return true;
}
export function claimGoal(profile: CareerProfile, id: GoalId) {
  const goal = GOALS.find((g) => g.id === id);
  if (!goal) throw new Error("Unknown objective.");
  const level = profile.claimed[id] + 1;
  const progress =
    id === "kills" ? profile.humanKills + profile.botKills
      : id === "matches" ? profile.goalMatches
      : id === "wins" ? profile.goalWins : profile.charges;
  if (progress < goalTarget(id, level))
    throw new Error("Objective is not complete yet.");
  profile.claimed[id] = level;
  profile.coins += goal.reward * level;
}
export function buyItem(profile: CareerProfile, id: ShopItemId) {
  const item = SHOP.find((i) => i.id === id);
  if (!item) throw new Error("Unknown item.");
  if (profile.owned.includes(id)) throw new Error("Already owned.");
  if (profile.coins < item.price) throw new Error("Not enough credits.");
  profile.coins -= item.price;
  profile.owned.push(id);
}
export function equipItem(
  profile: CareerProfile,
  id: ShopItemId | null,
  type: "skin" | "tracer",
) {
  if (id !== null) {
    const item = SHOP.find((i) => i.id === id);
    if (!item || item.type !== type || !profile.owned.includes(id))
      throw new Error("Item is not owned.");
  }
  profile.equipped[type] = id;
}
export function rankings(data: CareerData) {
  const profiles = Object.values(data.profiles);
  const row = (p: CareerProfile) => ({
    id: p.id,
    name: p.name,
    wins: p.wins,
    totalPoints: p.totalPoints,
    botKills: p.botKills,
    humanKills: p.humanKills,
    bestHumanKills: p.bestHumanKills,
    matches: p.matches,
  });
  const order = (key: "wins" | "humanKills" | "bestHumanKills" | "totalPoints") =>
    [...profiles]
      .filter((p) => key === "wins" || key === "bestHumanKills" ? p.matches > 0 : p.totalPoints > 0)
      .sort(
        (a, b) =>
          b[key] - a[key] ||
          b.humanKills - a.humanKills ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 100)
      .map(row);
  return {
    totalPoints: order("totalPoints"),
    wins: order("wins"),
    humanKills: order("humanKills"),
    bestHumanKills: order("bestHumanKills"),
    latestPredator: data.latestPredator,
  };
}
