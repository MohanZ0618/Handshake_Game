import { RoomSession } from "./session";
import type { RoomInfo } from "../shared/game";
interface Env {
  ROOMS: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json(null);
    if (url.pathname === "/api/health") return json({ ok: true });
    const lobby = env.LOBBY.get(env.LOBBY.idFromName("public"));
    if (
      url.pathname === "/api/rooms" &&
      ["GET", "POST"].includes(request.method)
    )
      return lobby.fetch(request);
    const match = url.pathname.match(
      /^\/api\/rooms\/([A-Z0-9]{6})(\/socket)?$/,
    );
    if (!match) return json({ error: "Not found." }, 404);
    const exists = await lobby.fetch(
      new Request(`https://internal/exists/${match[1]}`),
    );
    if (exists.status !== 200)
      return json({ error: "Room not found. Check the code." }, 404);
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  },
};
export class Lobby {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request) {
    const url = new URL(request.url),
      now = Date.now();
    if (url.pathname === "/update" && request.method === "POST") {
      const info = await request.json<RoomInfo>();
      await this.state.storage.put(info.code, info);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/exists/")) {
      const info = await this.state.storage.get<RoomInfo>(
        url.pathname.split("/").pop()!,
      );
      return json(
        { ok: !!info },
        info && now - info.updatedAt < 65_000 ? 200 : 404,
      );
    }
    const stored = await this.state.storage.list<RoomInfo>();
    const rooms = [...stored.values()].filter(
      (r) => now - r.updatedAt < 65_000,
    );
    const stale = [...stored]
      .filter(([, r]) => now - r.updatedAt >= 65_000)
      .map(([k]) => k);
    if (stale.length) await this.state.storage.delete(stale);
    if (request.method === "GET")
      return json({ rooms, online: rooms.reduce((n, r) => n + r.humans, 0) });
    if (rooms.length >= 50)
      return json({ error: "All rooms are busy. Try again soon." }, 503);
    let code: string;
    do {
      code = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    } while (stored.has(code));
    await this.state.storage.put(code, {
      code,
      humans: 0,
      teams: [0, 0, 0, 0],
      members: [],
      round: 1,
      phase: "playing",
      scores: [0, 0, 0, 0],
      updatedAt: now,
    } satisfies RoomInfo);
    return json({ code });
  }
}
export class GameRoom {
  private session?: RoomSession;
  private timer?: ReturnType<typeof setInterval>;
  private ticks = 0;
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}
  private publish() {
    if (!this.session) return;
    const info = this.session.game.info(this.session.code);
    this.state.waitUntil(
      this.env.LOBBY.get(this.env.LOBBY.idFromName("public"))
        .fetch(
          new Request("https://internal/update", {
            method: "POST",
            body: JSON.stringify(info),
          }),
        )
        .then(() => {}),
    );
  }
  async fetch(request: Request): Promise<Response> {
    const code = new URL(request.url).pathname.split("/")[3];
    this.session ??= new RoomSession(code, () => this.publish());
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return json(this.session.game.info(code));
    const pair = new WebSocketPair(),
      client = pair[0],
      server = pair[1];
    server.accept();
    const timeout = setTimeout(() => {
      if (!this.session?.peers.has(server))
        server.close(1008, "Join timed out.");
    }, 5000);
    server.addEventListener("message", (event) => {
      if (typeof event.data === "string")
        this.session!.receive(server, event.data);
      else server.close(1003, "Text messages only.");
    });
    const leave = () => {
      clearTimeout(timeout);
      this.session!.leave(server);
      if (!this.session!.game.humans && this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
    server.addEventListener("close", leave);
    server.addEventListener("error", leave);
    this.timer ??= setInterval(() => {
      if (this.session!.game.humans) {
        this.session!.tick();
        this.session!.broadcast();
        if (++this.ticks % 100 === 0) this.publish();
      }
    }, 50);
    return new Response(null, { status: 101, webSocket: client });
  }
}
