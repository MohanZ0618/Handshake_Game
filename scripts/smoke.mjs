import assert from "node:assert/strict";
import { WebSocket } from "ws";
const base = process.argv[2] ?? "http://127.0.0.1:8788";
const clients = [];
const result = await fetch(`${base}/api/rooms`, { method: "POST" });
assert.equal(result.status, 200);
const { code } = await result.json();
try {
  for (let i = 0; i < 8; i++) {
    const ws = new WebSocket(
      `${base.replace(/^http/, "ws")}/api/rooms/${code}/socket`,
    );
    clients.push(ws);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Join timed out")),
        8000,
      );
      ws.on("error", reject);
      ws.on("open", () =>
        ws.send(
          JSON.stringify({
            type: "join",
            protocol: 3,
            name: `Smoke${i}`,
            team: Math.floor(i / 2),
          }),
        ),
      );
      ws.once("message", (raw) => {
        clearTimeout(timeout);
        const m = JSON.parse(raw);
        assert.equal(m.type, "welcome");
        resolve();
      });
    });
  }
  const room = await fetch(`${base}/api/rooms/${code}`).then((r) => r.json());
  assert.equal(room.humans, 8);
  assert.deepEqual(room.teams, [2, 2, 2, 2]);
  const snapshot = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("No state")), 3000);
    const listener = (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "state") {
        clearTimeout(timer);
        clients[0].off("message", listener);
        resolve(m.state);
      }
    };
    clients[0].on("message", listener);
  });
  assert.equal(snapshot.players.length, 8);
  assert.equal(snapshot.players.filter((p) => p.bot).length, 0);
  clients[0].close();
  await new Promise((r) => setTimeout(r, 200));
  const after = await fetch(`${base}/api/rooms/${code}`).then((r) => r.json());
  assert.equal(after.humans, 7);
  console.log(
    JSON.stringify(
      {
        backend: base,
        room: code,
        checks: [
          "8 WebSocket players",
          "team capacity",
          "state snapshots",
          "disconnect bot replacement",
        ],
        passed: true,
      },
      null,
      2,
    ),
  );
} finally {
  for (const ws of clients) ws.close();
}
