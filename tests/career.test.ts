import { describe, expect, it } from "vitest";
import {
  applyProgress,
  buyItem,
  claimGoal,
  createCareer,
  emptyCareer,
  equipItem,
  rankings,
  settleCareer,
  goalTarget,
  SHOP,
  migrateCareer,
} from "../shared/career";
import { CareerStore } from "../server/career";
import { Game } from "../shared/game";

describe("authoritative career settlement", () => {
  it("persists unfinished points immediately, ignores retries, and survives a store restart", async () => {
    let disk = emptyCareer();
    const alpha = createCareer(disk, "alpha-hash", "Alpha");
    const save = async (value: typeof disk) => { disk = structuredClone(value); };
    const store = new CareerStore(async () => disk, save);
    const update = { id: "match-a", careerId: alpha.id, points: 2, humanKills: 1, botKills: 1, charges: 0 };
    expect(await store.progress(update)).toBe(true);
    expect(await store.progress(update)).toBe(false);
    expect((await store.handle(new Request("https://game.test/api/career/rankings"))).status).toBe(200);
    const reopened = new CareerStore(async () => disk, save);
    const data = await (await reopened.handle(new Request("https://game.test/api/career/rankings"))).json() as { totalPoints: { totalPoints: number }[] };
    expect(data.totalPoints[0].totalPoints).toBe(2);
    expect(disk.profiles[alpha.id]).toMatchObject({ totalPoints: 2, humanKills: 1, botKills: 1, matches: 0 });
    await reopened.settle({ id: "match-a", players: [{ ...update, name: "Alpha", won: true, qualified: false }] });
    expect(disk.profiles[alpha.id]).toMatchObject({ totalPoints: 2, goalMatches: 1, goalWins: 1, matches: 0 });
    expect(goalTarget("wins", 3)).toBe(3);
    expect(SHOP.find((i) => i.id === "skin-oxide")?.price).toBe(10);
    expect(SHOP.find((i) => i.id === "skin-sand")?.price).toBe(20);
  });
  it("applies only the new cumulative progress from a match", () => {
    const data = emptyCareer();
    const p = createCareer(data, "hash", "Alpha");
    applyProgress(data, { id: "m", careerId: p.id, points: 1, humanKills: 0, botKills: 1, charges: 0 });
    applyProgress(data, { id: "m", careerId: p.id, points: 3, humanKills: 1, botKills: 2, charges: 1 });
    expect(p).toMatchObject({ totalPoints: 3, humanKills: 1, botKills: 2, charges: 1 });
  });
  it("migrates older profiles without losing ownership or match totals", () => {
    const data = emptyCareer();
    const p = createCareer(data, "old", "Original");
    p.matches = 3;
    p.wins = 1;
    p.humanKills = 4;
    p.owned.push("skin-oxide");
    delete (p as Partial<typeof p>).totalPoints;
    delete (p as Partial<typeof p>).goalMatches;
    delete (p as Partial<typeof p>).goalWins;
    delete (data as Partial<typeof data>).progress;
    migrateCareer(data);
    expect(p).toMatchObject({ totalPoints: 4, goalMatches: 3, goalWins: 1, owned: ["skin-oxide"] });
  });
  it("pays a PvP match once, separates bot practice, and guards purchases", () => {
    const data = emptyCareer();
    const alpha = createCareer(data, "alpha-hash", "Alpha");
    const bravo = createCareer(data, "bravo-hash", "Bravo");
    const result = {
      id: "match-1",
      players: [
        {
          careerId: alpha.id,
          name: "Alpha",
          humanKills: 3,
          botKills: 2,
          charges: 2,
          won: true,
          qualified: true,
        },
        {
          careerId: bravo.id,
          name: "Bravo",
          humanKills: 1,
          botKills: 4,
          charges: 0,
          won: false,
          qualified: true,
        },
      ],
    };
    expect(settleCareer(data, result)).toBe(true);
    expect(settleCareer(data, result)).toBe(false);
    expect([alpha.matches, alpha.wins, alpha.humanKills, alpha.coins]).toEqual([
      1, 1, 3, 115,
    ]);
    expect([bravo.botKills, bravo.coins]).toEqual([4, 55]);
    claimGoal(alpha, "kills");
    expect(alpha.coins).toBe(165);
    buyItem(alpha, "tracer-ember");
    equipItem(alpha, "tracer-ember", "tracer");
    expect(alpha.coins).toBe(130);
    expect(() => buyItem(alpha, "tracer-ember")).toThrow("Already owned");
    buyItem(alpha, "skin-cinder");
    equipItem(alpha, "skin-cinder", "skin");
    buyItem(alpha, "skin-cinder-teal");
    equipItem(alpha, "skin-cinder-teal", "skin");
    expect(alpha.coins).toBe(130);
    expect(() => equipItem(alpha, "skin-oxide", "skin")).toThrow("not owned");
    expect(rankings(data).bestHumanKills[0].name).toBe("Alpha");
    settleCareer(data, {
      id: "practice",
      players: [
        {
          careerId: alpha.id,
          name: "Alpha",
          humanKills: 0,
          botKills: 8,
          charges: 8,
          won: true,
          qualified: false,
        },
      ],
    });
    expect([alpha.matches, alpha.wins, alpha.charges, alpha.coins]).toEqual([
      1, 1, 10, 190,
    ]);
    expect(alpha.botKills).toBe(10);
    claimGoal(alpha, "charges");
    expect(alpha.coins).toBe(220);
  });
  it("issues an anonymous token and rejects unauthenticated currency changes", async () => {
    let disk = emptyCareer();
    const store = new CareerStore(
      async () => disk,
      async (value) => {
        disk = structuredClone(value);
      },
    );
    const create = await store.handle(
      new Request("https://game.test/api/career/new", {
        method: "POST",
        body: JSON.stringify({ name: "Alpha" }),
      }),
    );
    const { token, profile } = (await create.json()) as {
      token: string;
      profile: { id: string };
    };
    expect(token).toHaveLength(72);
    expect(disk.tokens[token]).toBeUndefined();
    expect((await store.resolve(token))?.id).toBe(profile.id);
    const forged = await store.handle(
      new Request("https://game.test/api/career/buy", {
        method: "POST",
        body: JSON.stringify({ id: "skin-cinder" }),
      }),
    );
    expect(forged.status).toBe(401);
  });
  it("counts only human victims and requires opposing human play time", () => {
    const game = new Game(() => 0.5);
    const alpha = game.addHuman("a", "Alpha", 0, "career-a");
    const bravo = game.addHuman("b", "Bravo", 1, "career-b");
    for (const bot of game.players.filter((p) => p.bot)) {
      bot.hp = 0;
      bot.respawnAt = 1e9;
    }
    alpha.shieldUntil = bravo.shieldUntil = 0;
    bravo.armor = 0;
    for (let n = 0; n < 4; n++)
      game.hit(bravo, { owner: alpha.id, team: alpha.team });
    expect(alpha.humanKills).toBe(1);
    for (let n = 0; n < 1200; n++) game.tick(50);
    const result = game.matchResult("room:1");
    expect(result.players.find((p) => p.careerId === "career-a")).toMatchObject(
      { humanKills: 1, qualified: true },
    );
    expect(
      result.players.find((p) => p.careerId === "career-b")?.qualified,
    ).toBe(true);
  });
  it("records robot eliminations for every human player's match reward", () => {
    const game = new Game(() => 0.5);
    const alpha = game.addHuman("a", "Alpha", 0, "career-a");
    const bot = game.players.find((p) => p.bot && p.team !== alpha.team)!;
    bot.shieldUntil = 0;
    bot.armor = 0;
    bot.hp = 10;
    game.hit(bot, { owner: alpha.id, team: alpha.team });
    expect(game.matchResult("robot-match").players[0]).toMatchObject({
      botKills: 1,
      humanKills: 0,
      qualified: false,
    });
  });
});
