import { afterEach, describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { startLocalServer } from "../server/local";
import type { ServerMessage, Snapshot } from "../shared/game";
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
function join(base: string, code: string, team: number, name: string) {
  return new Promise<{ ws: WebSocket; message: ServerMessage }>((resolve) => {
    const ws = new WebSocket(
      `${base.replace("http", "ws")}/api/rooms/${code}/socket`,
    );
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", name, team })));
    ws.once("message", (d) =>
      resolve({ ws, message: JSON.parse(d.toString()) }),
    );
  });
}
describe("HTTP and real WebSocket integration", () => {
  it("broadcasts the same random map and supplies to different players", async () => {
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
    expect(sa.walls).toEqual(sb.walls);
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
