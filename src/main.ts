import { loadWeaponModels, type WeaponModels } from "./weapon-models";
import "./style.css";
import {
  TEAMS,
  POWER_INFO,
  PROTOCOL,
  type RoomInfo,
  type ServerMessage,
} from "../shared/game";
import { createArena, WIDTH, DEPTH } from "../shared/arena";
import { GameUI } from "./game-ui";
const app = document.querySelector<HTMLDivElement>("#app")!;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let base = "",
  rooms: RoomInfo[] = [],
  socket: WebSocket | undefined,
  myId = "",
  roomCode = "",
  name = "",
  scene = "lobby",
  selectedRoom: RoomInfo | undefined,
  lobbyOffline = false,
  game: GameUI | undefined;
const teamStyle = (i: number) => "--team:" + TEAMS[i].color;
async function api<T>(path: string, method = "GET"): Promise<T> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    signal: AbortSignal.timeout(8000),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Game server is unavailable. Please try again later.");
  }
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error ?? "Unable to reach the game server.",
    );
  return data as T;
}
function error(message: string) {
  const e = document.querySelector<HTMLElement>("#error");
  if (e) {
    e.textContent = message;
    e.classList.remove("hidden");
  }
}
function lobby(message = "") {
  game?.dispose();
  game = undefined;
  scene = "lobby";
  if (socket) {
    socket.onclose = null;
    socket.onmessage = null;
    socket.onopen = null;
    socket.close();
    socket = undefined;
  }
  app.innerHTML = `<div class="shell"><header><div class="brand"><div class="mark">B</div><div>BLOCKFIRE<small>ARENA</small></div></div><div class="status"><i></i> MULTIPLAYER / ONLINE</div></header>
    <section class="intro"><div><div class="eyebrow">Four teams. One arena.</div><h1>Find your squad.</h1><p class="muted">Join the fight. Bring a friend. Make every shot count.</p></div><div class="stats"><div class="stat"><strong id="online">—</strong><span>Players online</span></div><div class="stat"><strong id="room-count">—</strong><span>Live rooms</span></div></div></section>
    <div id="error" role="alert" class="error ${message ? "" : "hidden"}">${escape(message)}</div>
    <div class="lobby-layout"><section class="panel"><div class="panel-title"><h2>Room browser</h2><span>LIVE ARENAS</span></div><div class="arena-art"><canvas id="preview" width="900" height="240" aria-label="Arena map preview"></canvas><span class="art-label">SKYBRIDGE 3D / 1–8 PLAYERS</span></div><div id="rooms" class="rooms"><div class="empty">Connecting to the lobby...</div></div></section>
    <aside class="panel side"><div class="eyebrow">Ready to play?</div><h2>Enter the arena</h2><p class="muted">Pick a callsign and join your team.</p><label for="callsign">YOUR CALLSIGN</label><input id="callsign" maxlength="16" placeholder="e.g. Maverick" value="${escape(name)}" autocomplete="off"><div style="height:18px"></div><button class="primary" id="create">Create a room</button><div class="divider">HAVE A CODE?</div><label for="room-code">ROOM CODE</label><form id="code-form" class="code-row"><input id="room-code" maxlength="6" placeholder="ABC123" aria-label="Room code" autocomplete="off"><button type="submit">Join</button></form><p class="muted" style="font-size:12px;margin:18px 0 0">No waiting around. Robots fill empty spots until your friends arrive.</p><p class="notice desktop-note">Use a keyboard and mouse to play.</p></aside></div>
    <section class="rules"><div class="rule"><span class="number">01 / SQUAD UP</span><h3>Four teams of two</h3><p>Choose your team. Share the room code. Teammates cannot hurt each other.</p></div><div class="rule"><span class="number">02 / SCORE POINTS</span><h3>Every elimination counts</h3><p>Every elimination earns 1 point. Humans and robots compete for their team.</p></div><div class="rule"><span class="number">03 / TAKE THE WIN</span><h3>Three rounds. 90 seconds each.</h3><p>Team scores carry across rounds. Highest total wins. Tied teams share victory.</p></div></section>
    <div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp; · &nbsp; Mouse to aim &nbsp; · &nbsp; Hold click to fire</span><span>100 HP &nbsp; / &nbsp; 3s respawn &nbsp; / &nbsp; No friendly fire</span></div><section class="supply-guide" aria-label="Power-up guide">${Object.values(
      POWER_INFO,
    )
      .map(
        (p) =>
          `<div style="--power:${p.color}"><b>${p.icon}</b><span>${p.label}</span></div>`,
      )
      .join(
        "",
      )}</section><p class="muted">Walk over a supply to store it. E activates it; F swaps a stored supply. Double shot and rapid fire last 4s, laser 3s, speed 5s, shield 2s. Supplies return after 10s. Space jumps, Shift dashes (4s cooldown). 1/2/3 select rifle, SMG or shotgun. R reloads; empty magazines reload automatically.</p><footer>BLOCKFIRE ARENA — PLAY TOGETHER, FROM ANYWHERE.</footer></div>
    <dialog id="team-dialog"><div class="eyebrow">Choose your side</div><h2 id="team-title"></h2><p class="muted">Two spots per team. Join a friend or start a new squad.</p><div id="team-options" class="teams"></div><div id="team-error" class="error hidden" role="alert"></div><div class="dialog-footer"><span>You'll replace a robot immediately.</span><button id="cancel-team" class="ghost">Cancel</button></div></dialog>`;
  document.querySelector("#create")!.addEventListener("click", async () => {
    if (!readName()) return;
    const button = document.querySelector<HTMLButtonElement>("#create")!;
    button.disabled = true;
    try {
      const { code } = await api<{ code: string }>("/rooms", "POST");
      await chooseTeam(code);
    } catch (e) {
      error((e as Error).message);
    } finally {
      button.disabled = false;
    }
  });
  document
    .querySelector("#code-form")!
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!readName()) return;
      const code = document
        .querySelector<HTMLInputElement>("#room-code")!
        .value.trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        error("Enter a six-character room code.");
        return;
      }
      try {
        await chooseTeam(code);
      } catch (e) {
        error((e as Error).message);
      }
    });
  document
    .querySelector("#cancel-team")!
    .addEventListener("click", () =>
      document.querySelector<HTMLDialogElement>("#team-dialog")!.close(),
    );
  drawPreview();
  void refresh();
}
function readName() {
  const value = document
    .querySelector<HTMLInputElement>("#callsign")!
    .value.trim();
  if (!/^[A-Za-z0-9 _-]{1,16}$/.test(value)) {
    error(
      "Enter a callsign using 1-16 English letters, numbers, spaces, hyphens or underscores.",
    );
    return false;
  }
  name = value;
  return true;
}
async function refresh() {
  if (scene !== "lobby") return;
  try {
    const data = await api<{ rooms: RoomInfo[]; online: number }>("/rooms");
    if (scene !== "lobby") return;
    document.querySelector(".status")!.innerHTML =
      "<i></i> MULTIPLAYER / ONLINE";
    if (lobbyOffline) {
      document.querySelector("#error")!.classList.add("hidden");
      lobbyOffline = false;
    }
    rooms = data.rooms;
    document.querySelector("#online")!.textContent = String(data.online);
    document.querySelector("#room-count")!.textContent = String(rooms.length);
    document.querySelector("#rooms")!.innerHTML = rooms.length
      ? rooms
          .map(
            (r) =>
              `<div class="room"><div><div class="room-name">ROOM ${escape(r.code)}</div><div class="room-meta">${r.humans}/8 players · ${r.phase === "finished" ? "Match complete" : `Round ${r.round}/3`}<span class="team-dots">${r.teams.map((n, i) => `<b style="color:${TEAMS[i].color}">${TEAMS[i].letter} ${n}/2</b>`).join("")}</span></div></div><button data-room="${escape(r.code)}" ${r.humans >= 8 ? "disabled" : ""}>${r.humans >= 8 ? "Full" : "Join room"}</button></div>`,
          )
          .join("")
      : '<div class="empty"><strong>The arena is yours.</strong>No rooms yet. Create one and start playing with robots.</div>';
    document.querySelectorAll<HTMLButtonElement>("[data-room]").forEach((b) =>
      b.addEventListener("click", () => {
        if (readName())
          void chooseTeam(b.dataset.room!).catch((e) => error(e.message));
      }),
    );
  } catch (e) {
    if (scene === "lobby") {
      lobbyOffline = true;
      document.querySelector(".status")!.textContent =
        "MULTIPLAYER / RECONNECTING";
      error((e as Error).message);
      document.querySelector("#rooms")!.innerHTML =
        '<div class="empty"><strong>Lobby connection unavailable</strong>We will retry automatically.</div>';
    }
  }
}
async function chooseTeam(code: string) {
  selectedRoom = await api<RoomInfo>(`/rooms/${code}`);
  document.querySelector("#error")!.classList.add("hidden");
  const r = selectedRoom!;
  document.querySelector("#team-title")!.textContent = `Room ${r.code}`;
  document.querySelector("#team-options")!.innerHTML = TEAMS.map(
    (t, i) =>
      `<button class="team-option" style="${teamStyle(i)}" data-team="${i}" ${r.teams[i] >= 2 ? "disabled" : ""}><strong>${t.letter} / ${t.name}</strong><span>${r.teams[i]}/2 players · ${r.teams[i] >= 2 ? "Full" : r.teams[i] === 1 ? "Join a teammate" : "Start a squad"}</span><span>${
        r.members
          .filter((p) => p.team === i)
          .map((p) => escape(p.name))
          .join(" + ") || "Open squad"
      }</span></button>`,
  ).join("");
  document.querySelector("#team-error")!.classList.add("hidden");
  document
    .querySelectorAll<HTMLButtonElement>("[data-team]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        connect(r.code, Number(b.dataset.team)),
      ),
    );
  document.querySelector<HTMLDialogElement>("#team-dialog")!.showModal();
}
function connect(code: string, team: number) {
  document
    .querySelectorAll<HTMLButtonElement>("[data-team]")
    .forEach((b) => (b.disabled = true));
  const url = new URL(`${base || location.origin}/api/rooms/${code}/socket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(url);
  let joined = false;
  let latest: Extract<ServerMessage, { type: "state" }>["state"] | undefined;
  const attempt = socket;
  const timeout = setTimeout(() => {
    if (!joined) {
      attempt.close();
      lobby("Connection timed out. Please try again.");
    }
  }, 8000);
  socket.onopen = () =>
    attempt.send(
      JSON.stringify({ type: "join", name, team, protocol: PROTOCOL }),
    );
  socket.onmessage = (e) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === "welcome") {
      clearTimeout(timeout);
      joined = true;
      myId = msg.id;
      roomCode = msg.code;
      scene = "loading";
      app.innerHTML = '<div class="loading">Loading local weapon models…</div>';
      void loadWeaponModels()
        .then((models) => {
          if (socket !== attempt || attempt.readyState !== WebSocket.OPEN)
            return;
          showGame(msg.arena, models);
          if (latest) game?.accept(latest);
        })
        .catch((e) => {
          if (socket === attempt)
            lobby("Weapon models could not load. " + String(e));
        });
    } else if (msg.type === "state") {
      if (msg.state.protocol !== PROTOCOL) {
        lobby("Game updated. Refresh this page.");
        return;
      }
      latest = msg.state;
      game?.accept(msg.state);
    } else if (msg.type === "error") {
      if (!joined) {
        clearTimeout(timeout);
        attempt.onclose = null;
        attempt.close();
        lobby(msg.message);
      } else error(msg.message);
    }
  };
  socket.onclose = () => {
    clearTimeout(timeout);
    lobby(
      joined
        ? "You disconnected. Rejoin the room to continue. Your team keeps its points."
        : "Unable to join this room. It may have expired.",
    );
  };
  socket.onerror = () => {};
}

function showGame(arena: ReturnType<typeof createArena>, models: WeaponModels) {
  scene = "game";
  try {
    game = new GameUI(app, socket!, myId, roomCode, arena, models, () =>
      lobby(),
    );
  } catch (e) {
    lobby(
      "Unable to start 3D graphics. Use a browser with WebGL2 and hardware acceleration. " +
        (e instanceof Error ? e.message : ""),
    );
  }
}
function drawPreview() {
  const canvas = document.querySelector<HTMLCanvasElement>("#preview")!,
    c = canvas.getContext("2d")!,
    arena = createArena();
  c.fillStyle = "#152736";
  c.fillRect(0, 0, canvas.width, canvas.height);
  const sx = canvas.width / WIDTH,
    sz = canvas.height / DEPTH;
  for (const b of arena.boxes) {
    c.fillStyle = b.kind === "floor" ? "#638aa3" : "#39546b";
    c.fillRect(b.x * sx, b.z * sz, b.w * sx, b.d * sz);
  }
  c.fillStyle = "#79bfc5";
  for (const r of arena.ramps)
    c.fillRect(r.x * sx, r.z * sz, r.w * sx, r.d * sz);
  arena.spawns.forEach((p, i) => {
    c.fillStyle = TEAMS[i].color;
    c.fillRect(p.x * sx - 8, p.z * sz - 8, 16, 16);
  });
  c.fillStyle = "#dbf5ff";
  c.font = "bold 23px Segoe UI";
  c.textAlign = "center";
  c.fillText("SKYBRIDGE", canvas.width / 2, canvas.height / 2 + 8);
}
setInterval(() => void refresh(), 4000);
async function boot() {
  try {
    const config = (await fetch("/config.json", { cache: "no-store" }).then(
      (r) => r.json(),
    )) as { serverUrl?: string };
    base =
      typeof config.serverUrl === "string"
        ? config.serverUrl.replace(/\/$/, "")
        : "";
  } catch {}
  lobby();
}
void boot();
