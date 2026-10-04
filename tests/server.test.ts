import { afterEach, describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { startLocalServer } from "../server/local";
import { idleInput, PROTOCOL, type ServerMessage, type Snapshot } from "../shared/game";
let server: ReturnType<typeof startLocalServer> | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});
async function setup() {
  server = startLocalServer(0);
  await new Promise<void>((resolve) => server!.server.on("listening", resolve));
  const a = server.server.address();
  if (!a || typeof a === "string") throw new Error("No port");
  return `http://127.0.0.1:${a.port}`;
}
function join(base: string, code: string, team: number, name: string, token?: string) {
  return new Promise<{ ws: WebSocket; message: ServerMessage }>((resolve) => {
    const ws = new WebSocket(
      `${base.replace("http", "ws")}/api/rooms/${code}/socket`,
    );
    ws.on("open", () =>
      ws.send(JSON.stringify({ type: "join", protocol: PROTOCOL, name, team, token })),
    );
    ws.once("message", (d) =>
      resolve({ ws, message: JSON.parse(d.toString()) }),
    );
  });
}
describe("HTTP and real WebSocket integration", () => {
  it("keeps unfinished points after leaving and restarting the local server", async () => {
    const dir = await mkdtemp(pathJoin(tmpdir(), "blockfire-career-"));
    const careerPath = pathJoin(dir, "career.json");
    try {
      server = startLocalServer(0, careerPath);
      await new Promise<void>((resolve) => server!.server.on("listening", resolve));
      const address = server.server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const base = `http://127.0.0.1:${address.port}`;
      const created = await fetch(`${base}/api/career/new`, {
        method: "POST", body: JSON.stringify({ name: "Persisted" }),
      }).then((response) => response.json()) as { token: string; profile: { id: string } };
      const { code } = await fetch(`${base}/api/rooms`, { method: "POST" })
        .then((response) => response.json()) as { code: string };
      const player = await join(base, code, 0, "Persisted", created.token);
      expect(player.message.type).toBe("welcome");
      const game = server.rooms.get(code)!.session.game;
      const human = game.players.find((p) => p.careerId === created.profile.id)!;
      const bot = game.players.find((p) => p.bot && p.team !== human.team)!;
      Object.assign(bot, { hp: 10, armor: 0, shieldUntil: 0 });
      game.hit(bot, { owner: human.id, team: human.team });
      const left = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Leave acknowledgement timeout")), 2000);
        player.ws.on("message", (raw) => {
          if ((JSON.parse(raw.toString()) as ServerMessage).type === "left") {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      player.ws.send(JSON.stringify({ type: "leave" }));
      await left;
      player.ws.close();
      await new Promise<void>((resolve) => player.ws.once("close", resolve));
      const current = await fetch(`${base}/api/career/rankings`)
        .then((response) => response.json()) as { totalPoints: { totalPoints: number }[] };
      expect(current.totalPoints[0]?.totalPoints).toBe(1);
      await server.close();
      server = undefined;
      server = startLocalServer(0, careerPath);
      await new Promise<void>((resolve) => server!.server.on("listening", resolve));
      const nextAddress = server.server.address();
      if (!nextAddress || typeof nextAddress === "string") throw new Error("No port");
      const reopened = `http://127.0.0.1:${nextAddress.port}`;
      const profile = await fetch(`${reopened}/api/career/profile`, {
        headers: { Authorization: `Bearer ${created.token}` },
      }).then((response) => response.json()) as { profile: { totalPoints: number; botKills: number; matches: number } };
      expect(profile.profile).toMatchObject({ totalPoints: 1, botKills: 1, matches: 0 });
    } finally {
      await server?.close();
      server = undefined;
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("broadcasts acknowledged 3D jump and dash state to both clients without repeating actions", async () => {
    const base = await setup();
    const { code } = (await fetch(`${base}/api/rooms`, { method: "POST" }).then(
      (r) => r.json(),
    )) as { code: string };
    const a = await join(base, code, 0, "Alpha"),
      b = await join(base, code, 1, "Bravo");
    if (a.message.type !== "welcome") throw new Error("Join failed");
    const id = a.message.id;
    const stateAfter = (ws: WebSocket, seq: number) =>
      new Promise<Snapshot>((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off("message", listener);
          reject(new Error("Action state timeout"));
        }, 2000);
        const listener = (raw: Buffer) => {
          const m = JSON.parse(raw.toString()) as ServerMessage;
          if (
            m.type === "state" &&
            m.state.players.some((p) => p.id === id && p.ack >= seq)
          ) {
            clearTimeout(timer);
            ws.off("message", listener);
            resolve(m.state);
          }
        };
        ws.on("message", listener);
      });
    const first = Promise.all([stateAfter(a.ws, 1), stateAfter(b.ws, 1)]);
    a.ws.send(
      JSON.stringify({
        type: "input",
        input: { ...idleInput(), seq: 1, x: 1, jump: 1, dash: 1 },
      }),
    );
    const [sa, sb] = await first;
    const pa = sa.players.find((p) => p.id === id)!,
      pb = sb.players.find((p) => p.id === id)!;
    expect(pa.y).toBeGreaterThan(0);
    expect(pa.x).toBeGreaterThan(120);
    expect(pa).toEqual(pb);
    expect(pa.dashReadyAt).toBeGreaterThan(sa.now);
    const second = stateAfter(a.ws, 2);
    a.ws.send(
      JSON.stringify({
        type: "input",
        input: { ...idleInput(), seq: 2, jump: 1, dash: 1 },
      }),
    );
    expect((await second).players.find((p) => p.id === id)!.dashReadyAt).toBe(
      pa.dashReadyAt,
    );
  });
  it("broadcasts the same 3D map and supplies to different players", async () => {
    const base = await setup();
    const { code } = (await fetch(`${base}/api/rooms`, { method: "POST" }).then(
      (r) => r.json(),
    )) as { code: string };
    const a = await join(base, code, 0, "Alpha");
    const b = await join(base, code, 1, "Bravo");
    const nextState = (ws: WebSocket) =>
      new Promise<Snapshot>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("State timeout")),
          2000,
        );
        const listener = (raw: Buffer) => {
          const msg = JSON.parse(raw.toString()) as ServerMessage;
          if (msg.type === "state") {
            clearTimeout(timer);
            ws.off("message", listener);
            resolve(msg.state);
          }
        };
        ws.on("message", listener);
      });
    const [sa, sb] = await Promise.all([nextState(a.ws), nextState(b.ws)]);
    expect(a.message.type === "welcome" && a.message.arena).toEqual(
      b.message.type === "welcome" && b.message.arena,
    );
    expect(sa).not.toHaveProperty("arena");
    expect(sa.pickups).toEqual(sb.pickups);
    expect(sa.pickups).toHaveLength(7);
  });
  it("lists rooms, admits 8 clients, rejects overflow and replaces a departed player", async () => {
    const base = await setup();
    const { code } = (await fetch(`${base}/api/rooms`, { method: "POST" }).then(
      (r) => r.json(),
    )) as { code: string };
    const players = [];
    for (let n = 0; n < 8; n++) {
      const p = await join(base, code, Math.floor(n / 2), `Player${n}`);
      expect(p.message.type).toBe("welcome");
      players.push(p);
    }
    const denied = await join(base, code, 0, "Ninth");
    expect(denied.message.type).toBe("error");
    denied.ws.close();
    const lobby = (await fetch(`${base}/api/rooms`).then((r) => r.json())) as {
      online: number;
      rooms: { teams: number[] }[];
    };
    expect(lobby.online).toBe(8);
    expect(lobby.rooms[0].teams).toEqual([2, 2, 2, 2]);
    const first = players[0].ws;
    const closed = new Promise<void>((r) => first.once("close", () => r()));
    first.close();
    await closed;
    await new Promise((r) => setTimeout(r, 30));
    expect(server!.rooms.get(code)!.session.game.humans).toBe(7);
    const replacement = await join(base, code, 0, "Replacement");
    expect(replacement.message.type).toBe("welcome");
    expect(server!.rooms.get(code)!.session.game.players).toHaveLength(8);
  });
  it("rejects bad names, spoofed scoring, and nonexistent rooms", async () => {
    const base = await setup();
    expect((await fetch(`${base}/api/rooms/ZZZZZZ`)).status).toBe(404);
    const { code } = (await fetch(`${base}/api/rooms`, { method: "POST" }).then(
      (r) => r.json(),
    )) as { code: string };
    const bad = await join(base, code, 0, "<script>");
    expect(bad.message.type).toBe("error");
    bad.ws.close();
    const good = await join(base, code, 0, "Alpha");
    good.ws.send(JSON.stringify({ type: "score", points: 999 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(server!.rooms.get(code)!.session.game.scores).toEqual([0, 0, 0, 0]);
  });
});
