// Isolated local acceptance server. Never imported by the production server or frontend.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createInterface } from "node:readline";
import { WebSocketServer } from "ws";
import { RoomSession } from "../server/session";
import { POWER_TYPES, type Power } from "../shared/game";
const session = new RoomSession("TEST3D");
const root = resolve("dist");
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/api/rooms") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.method === "POST"
          ? { code: session.code }
          : {
              rooms: [session.game.info(session.code)],
              online: session.game.humans,
            },
      ),
    );
    return;
  }
  if (path === "/api/rooms/TEST3D") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(session.game.info(session.code)));
    return;
  }
  if (path === "/config.json") {
    res.setHeader("Content-Type", "application/json");
    res.end('{"serverUrl":""}');
    return;
  }
  const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
  if (!file.startsWith(root + "\\") && !file.startsWith(root + "/")) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".glb": "model/gltf-binary",
    };
    res.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/api/rooms/TEST3D/socket") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.on("message", (raw) => session.receive(ws, raw.toString()));
    ws.on("close", () => session.leave(ws));
  });
});
const timer = setInterval(() => {
  session.tick();
  session.broadcast();
}, 50);
createInterface({ input: process.stdin }).on("line", (line) => {
  const [command, value] = line.trim().split(" ");
  const p = session.game.players.find((p) => !p.bot);
  if (command === "status")
    console.log(
      JSON.stringify({
        now: session.game.now,
        phase: session.game.phase,
        players: session.game.players.filter((p) => !p.bot),
        shots: session.game.events.filter(
          (e) => e.kind === "shot" || e.kind === "laser",
        ),
      }),
    );
  else if (p && command === "power" && POWER_TYPES.includes(value as Power)) {
    p.power = null;
    p.storedPower = value as Power;
    p.hp = 100;
    p.shieldUntil = session.game.now + 60_000;
    console.log(`Stored ${value}; activate with E in the browser.`);
  } else if (p && command === "wall") {
    const b = session.game.arena.boxes.find(
      (b) => b.kind === "cover" && b.y === 0 && b.h > 60,
    )!;
    Object.assign(p, {
      x: b.x - 18,
      y: 0,
      z: b.z + b.d / 2,
      vy: 0,
      grounded: true,
      life: p.life + 1,
      aim: 0,
      pitch: 0,
    });
    console.log(
      "Placed beside real map cover; turn/aim/fire to inspect the camera and muzzle.",
    );
  } else if (command === "finish") {
    session.game.phase = "finished";
    session.game.round = 3;
    session.broadcast();
  } else if (command === "quit") {
    clearInterval(timer);
    for (const peer of wss.clients) peer.terminate();
    wss.close();
    server.close();
    process.exit(0);
  }
});
server.listen(5180, "127.0.0.1", () =>
  console.log(
    "Browser fixture http://127.0.0.1:5180 — room TEST3D. Commands: power <type>, wall, status, finish, quit.",
  ),
);
