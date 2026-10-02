import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { RoomSession } from "./session";
export function startLocalServer(port = 8787) {
  const rooms = new Map<string, { session: RoomSession; touched: number }>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  function createRoom() {
    let code: string;
    do {
      code = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (rooms.has(code));
    const room = { session: new RoomSession(code), touched: Date.now() };
    rooms.set(code, room);
    return code;
  }
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/health") {
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/api/rooms" && req.method === "GET") {
      const list = [...rooms.values()].map((r) =>
        r.session.game.info(r.session.code),
      );
      res.end(
        JSON.stringify({
          rooms: list,
          online: list.reduce((s, r) => s + r.humans, 0),
        }),
      );
      return;
    }
    if (url.pathname === "/api/rooms" && req.method === "POST") {
      if (rooms.size >= 50) {
        res.statusCode = 503;
        res.end(
          JSON.stringify({ error: "All rooms are busy. Try again soon." }),
        );
        return;
      }
      res.end(JSON.stringify({ code: createRoom() }));
      return;
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})$/);
    if (match && req.method === "GET") {
      const r = rooms.get(match[1]);
      res.statusCode = r ? 200 : 404;
      res.end(
        JSON.stringify(
          r
            ? r.session.game.info(match[1])
            : { error: "Room not found. Check the code." },
        ),
      );
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found." }));
  });
  server.on("upgrade", (req, socket, head) => {
    const match = new URL(req.url ?? "/", "http://localhost").pathname.match(
      /^\/api\/rooms\/([A-Z0-9]{6})\/socket$/,
    );
    const room = match ? rooms.get(match[1]) : undefined;
    if (!room) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const timeout = setTimeout(() => {
        if (!room.session.peers.has(ws)) ws.close(1008, "Join timed out.");
      }, 5000);
      ws.on("message", (data) => room.session.receive(ws, data.toString()));
      ws.on("close", () => {
        clearTimeout(timeout);
        room.session.leave(ws);
      });
      ws.on("error", () => room.session.leave(ws));
    });
  });
  const timer = setInterval(() => {
    for (const [code, r] of rooms) {
      if (r.session.game.humans) {
        r.touched = Date.now();
        r.session.tick();
        r.session.broadcast();
      } else if (Date.now() - r.touched > 60_000) rooms.delete(code);
    }
  }, 50);
  server.listen(port, "0.0.0.0");
  return {
    server,
    rooms,
    close: () => {
      clearInterval(timer);
      for (const c of wss.clients) c.terminate();
      wss.close();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startLocalServer();
  console.log("Game server listening on http://localhost:8787");
}
