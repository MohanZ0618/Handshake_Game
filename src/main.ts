import "./style.css";
import {
  TEAMS,
  WIDTH,
  HEIGHT,
  generateMap,
  movementSpeed,
  POWER_INFO,
  blocked,
  type Player,
  type Snapshot,
  type RoomInfo,
  type ServerMessage,
  type Input,
  type Wall,
} from "../shared/game";
const VIEW_W = 1200,
  VIEW_H = 750;
const previewWalls = generateMap(() => 0.42);
let camera = { x: 0, y: 0 };
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
  state: Snapshot | undefined,
  myId = "",
  roomCode = "",
  name = "";
let scene = "lobby",
  lastStateAt = 0,
  shownFeed = "",
  finishedShown = false,
  selectedRoom: RoomInfo | undefined;
const keys = new Set<string>();
let mouse = { x: WIDTH / 2, y: HEIGHT / 2, down: false };
let canvas: HTMLCanvasElement | undefined,
  ctx: CanvasRenderingContext2D | undefined,
  lastFrame = 0;
const display = new Map<string, { x: number; y: number }>();
let lobbyOffline = false;
const teamStyle = (i: number) => `--team:${TEAMS[i].color}`;
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
  scene = "lobby";
  state = undefined;
  display.clear();
  keys.clear();
  mouse.down = false;
  canvas = undefined;
  ctx = undefined;
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
    <div class="lobby-layout"><section class="panel"><div class="panel-title"><h2>Room browser</h2><span>LIVE ARENAS</span></div><div class="arena-art"><canvas id="preview" width="900" height="240" aria-label="Arena map preview"></canvas><span class="art-label">RANDOM ARENA / 2–8 PLAYERS</span></div><div id="rooms" class="rooms"><div class="empty">Connecting to the lobby...</div></div></section>
    <aside class="panel side"><div class="eyebrow">Ready to play?</div><h2>Enter the arena</h2><p class="muted">Pick a callsign and join your team.</p><label for="callsign">YOUR CALLSIGN</label><input id="callsign" maxlength="16" placeholder="e.g. Maverick" value="${escape(name)}" autocomplete="off"><div style="height:18px"></div><button class="primary" id="create">Create a room</button><div class="divider">HAVE A CODE?</div><label for="room-code">ROOM CODE</label><form id="code-form" class="code-row"><input id="room-code" maxlength="6" placeholder="ABC123" aria-label="Room code" autocomplete="off"><button type="submit">Join</button></form><p class="muted" style="font-size:12px;margin:18px 0 0">No waiting around. Robots fill empty spots until your friends arrive.</p><p class="notice desktop-note">Use a keyboard and mouse to play.</p></aside></div>
    <section class="rules"><div class="rule"><span class="number">01 / SQUAD UP</span><h3>Four teams of two</h3><p>Choose your team. Share the room code. Teammates cannot hurt each other.</p></div><div class="rule"><span class="number">02 / SCORE POINTS</span><h3>Every elimination counts</h3><p>Eliminate a player: +4 points. A robot: +1 point. Robots earn no points.</p></div><div class="rule"><span class="number">03 / TAKE THE WIN</span><h3>Three rounds. 90 seconds each.</h3><p>Team scores carry across rounds. Highest total wins. Tied teams share victory.</p></div></section>
    <div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp; · &nbsp; Mouse to aim &nbsp; · &nbsp; Hold click to fire</span><span>100 HP &nbsp; / &nbsp; 3s respawn &nbsp; / &nbsp; No friendly fire</span></div><section class="supply-guide" aria-label="Power-up guide">${Object.values(
      POWER_INFO,
    )
      .map(
        (p) =>
          `<div style="--power:${p.color}"><b>${p.icon}</b><span>${p.label}</span></div>`,
      )
      .join(
        "",
      )}</section><p class="muted">Walk over a supply for a 3-second boost. Double bullets, ricochet lasers, 2x fire rate, 50% extra speed, or damage protection. A new pickup replaces your current power. Supplies return after 10 seconds at new random locations.</p><footer>BLOCKFIRE ARENA — PLAY TOGETHER, FROM ANYWHERE.</footer></div>
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
  const attempt = socket;
  const timeout = setTimeout(() => {
    if (!joined) {
      attempt.close();
      lobby("Connection timed out. Please try again.");
    }
  }, 8000);
  socket.onopen = () =>
    attempt.send(JSON.stringify({ type: "join", name, team }));
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
      showGame();
    } else if (msg.type === "state") {
      state = msg.state;
      lastStateAt = performance.now();
      updateHud();
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
function showGame() {
  scene = "game";
  finishedShown = false;
  shownFeed = "";
  display.clear();
  app.innerHTML = `<div class="game-shell"><div class="game-top"><div class="brand"><div class="mark">B</div>BLOCKFIRE</div><div id="scores" class="scores"></div><div class="match-time"><strong id="timer">1:30</strong><small id="round">ROUND 1 / 3</small></div><button id="leave" class="ghost">Leave room</button></div><div id="error" class="error hidden" role="alert"></div><div class="battlefield"><canvas id="game" width="1440" height="900" tabindex="0" aria-label="Battlefield. Use WASD to move, mouse to aim, and hold the left mouse button to fire."></canvas><div id="feed" class="feed"></div><div id="banner" class="banner hidden"></div></div><div class="hud"><div class="health"><span id="player-label"></span><b id="hp"></b><div class="healthbar"><i id="hp-bar"></i></div></div><span class="hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp; · &nbsp; Aim + hold click to fire</span><span id="personal-score"></span><span>ROOM <b>${escape(roomCode)}</b></span></div></div><dialog id="result"><div class="eyebrow">Match complete</div><h2 id="winner"></h2><p class="muted">Three rounds. One final score.</p><div id="result-table"></div><div class="dialog-footer"><button id="back-lobby" class="ghost">Back to lobby</button><button id="rematch" class="primary">Play again</button></div></dialog>`;
  canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  camera = { x: 0, y: 0 };
  ctx = canvas.getContext("2d")!;
  canvas.focus();
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas!.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    mouse.y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
  });
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      mouse.down = true;
      canvas!.focus();
      sendInput();
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.querySelector("#leave")!.addEventListener("click", () => lobby());
  document
    .querySelector("#back-lobby")!
    .addEventListener("click", () => lobby());
  document.querySelector("#rematch")!.addEventListener("click", () => {
    socket?.send(JSON.stringify({ type: "rematch" }));
  });
}
function input(): Input {
  const p = state?.players.find((p) => p.id === myId),
    pos = display.get(myId) ?? p;
  return {
    x: Number(keys.has("d")) - Number(keys.has("a")),
    y: Number(keys.has("s")) - Number(keys.has("w")),
    aim: pos
      ? Math.atan2(mouse.y + camera.y - pos.y, mouse.x + camera.x - pos.x)
      : 0,
    fire: mouse.down,
  };
}
function updateHud() {
  if (scene !== "game" || !state) return;
  const p = state.players.find((p) => p.id === myId);
  if (!p) return;
  document.querySelector("#scores")!.innerHTML = TEAMS.map(
    (t, i) =>
      `<div class="score-pill" style="${teamStyle(i)}">${t.name}<b>${state!.scores[i]}</b></div>`,
  ).join("");
  document.querySelector("#round")!.textContent =
    state.phase === "intermission"
      ? "NEXT ROUND"
      : state.phase === "finished"
        ? "MATCH COMPLETE"
        : `ROUND ${state.round} / 3`;
  document.querySelector("#player-label")!.textContent =
    `${name} / ${TEAMS[p.team].name}`;
  document.querySelector("#hp")!.textContent = `${p.hp} HP`;
  (document.querySelector("#hp-bar") as HTMLElement).style.width = `${p.hp}%`;
  document.querySelector("#personal-score")!.textContent =
    `${p.score} PTS · ${p.kills} ELIMS`;
  const feed = state.feed.filter((f) => state!.now - f.time < 6500),
    signature = feed.map((f) => f.id).join(",");
  if (signature !== shownFeed) {
    shownFeed = signature;
    document.querySelector("#feed")!.innerHTML = feed
      .map(
        (f) =>
          `<div><b style="color:${TEAMS[f.team].color}">${escape(f.killer)}</b><span>eliminated</span>${escape(f.victim)}${f.points ? ` <b>+${f.points}</b>` : ""}</div>`,
      )
      .join("");
  }
  if (state.phase === "finished" && !finishedShown) {
    finishedShown = true;
    keys.clear();
    mouse.down = false;
    const max = Math.max(...state.scores),
      winners = TEAMS.filter((_, i) => state!.scores[i] === max);
    document.querySelector("#winner")!.textContent =
      winners.length === 1 ? `${winners[0].name} wins!` : "Shared victory!";
    document.querySelector("#result-table")!.innerHTML =
      `<table class="scoretable"><thead><tr><th>TEAM</th><th>POINTS</th></tr></thead><tbody>${TEAMS.map(
        (t, i) => ({ t, i }),
      )
        .sort((a, b) => state!.scores[b.i] - state!.scores[a.i])
        .map(
          ({ t, i }) =>
            `<tr><td style="color:${t.color}">${t.name}</td><td>${state!.scores[i]}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><table class="scoretable"><thead><tr><th>PLAYER</th><th>ELIMS</th><th>POINTS</th></tr></thead><tbody>${state.players
        .filter((p) => !p.bot)
        .sort((a, b) => b.score - a.score)
        .map(
          (p) =>
            `<tr><td style="color:${TEAMS[p.team].color}">${escape(p.name)}</td><td>${p.kills}</td><td>${p.score}</td></tr>`,
        )
        .join("")}</tbody></table>`;
    document.querySelector<HTMLDialogElement>("#result")!.showModal();
  }
  if (state.phase !== "finished" && finishedShown) {
    finishedShown = false;
    document.querySelector<HTMLDialogElement>("#result")!.close();
    canvas?.focus();
  }
}
function floor(c: CanvasRenderingContext2D, walls: Wall[] = previewWalls) {
  c.fillStyle = "#131e29";
  c.fillRect(0, 0, WIDTH, HEIGHT);
  c.strokeStyle = "#1b2937";
  c.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 60) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, HEIGHT);
    c.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 60) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(WIDTH, y);
    c.stroke();
  }
  TEAMS.forEach((t, i) => {
    const x = i % 2 ? WIDTH - 165 : 25,
      y = i < 2 ? 25 : HEIGHT - 150;
    c.fillStyle = t.color + "12";
    c.fillRect(x, y, 140, 125);
    c.strokeStyle = t.color + "55";
    c.setLineDash([8, 8]);
    c.strokeRect(x, y, 140, 125);
    c.setLineDash([]);
    c.fillStyle = t.color + "66";
    c.font = "bold 17px Segoe UI";
    c.fillText(t.name, x + 17, y + 72);
  });
  for (const w of walls) {
    c.fillStyle = "#080d16";
    c.fillRect(w.x + 7, w.y + 9, w.w, w.h);
    c.fillStyle = "#334457";
    c.fillRect(w.x, w.y, w.w, w.h);
    c.fillStyle = "#455b70";
    c.fillRect(w.x, w.y, w.w, 5);
    c.strokeStyle = "#53677a";
    c.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    c.fillStyle = "#293949";
    for (let x = w.x + 12; x < w.x + w.w - 8; x += 24)
      c.fillRect(x, w.y + 12, 4, w.h - 24);
  }
  c.strokeStyle = "#486071";
  c.lineWidth = 8;
  c.strokeRect(0, 0, WIDTH, HEIGHT);
}
function character(
  c: CanvasRenderingContext2D,
  p: Player,
  x: number,
  y: number,
  aim: number,
  now: number,
) {
  const color = TEAMS[p.team].color;
  c.save();
  c.translate(x, y);
  c.fillStyle = "#050a1299";
  c.beginPath();
  c.ellipse(3, 10, 23, 16, 0, 0, Math.PI * 2);
  c.fill();
  c.rotate(aim);
  c.fillStyle = "#070c13";
  c.fillRect(-17, -15, 32, 30);
  c.fillStyle = color;
  c.fillRect(-14, -12, 27, 24);
  c.fillStyle = "#ffffff44";
  c.fillRect(-12, -10, 23, 4);
  c.fillStyle = "#263442";
  c.fillRect(9, -8, 11, 16);
  c.fillStyle = "#a6b6c8";
  c.fillRect(12, -4, 24, 8);
  c.fillStyle = "#26313e";
  c.fillRect(31, -3, 9, 6);
  c.fillStyle = "#c6d3df";
  c.fillRect(-6, -8, 9, 16);
  c.fillStyle = "#1a2937";
  c.fillRect(-3, -6, 7, 12);
  c.restore();
  if (now < p.shieldUntil || (p.power === "shield" && p.powerUntil > now)) {
    c.strokeStyle =
      p.power === "shield" ? POWER_INFO.shield.color : color + "aa";
    c.lineWidth = p.power === "shield" ? 4 : 2;
    c.beginPath();
    c.arc(x, y, 28, 0, Math.PI * 2);
    c.stroke();
  }
  if (p.id === myId) {
    c.strokeStyle = "#ffffffcc";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, 24, 0, Math.PI * 2);
    c.stroke();
  }
  c.textAlign = "center";
  c.font = "bold 17px Segoe UI";
  c.fillStyle = p.bot ? "#8e9faf" : color;
  c.fillText(p.bot ? "ROBOT" : p.name, x, y - 32);
  c.fillStyle = "#07101c";
  c.fillRect(x - 19, y + 28, 38, 4);
  c.fillStyle = color;
  c.fillRect(x - 19, y + 28, (38 * p.hp) / 100, 4);
  c.textAlign = "left";
}
function drawPreview() {
  const c = document
    .querySelector<HTMLCanvasElement>("#preview")!
    .getContext("2d")!;
  c.save();
  c.scale(900 / WIDTH, 240 / HEIGHT);
  floor(c);
  TEAMS.forEach((_, i) => {
    const p = {
      id: "preview",
      bot: false,
      name: "",
      team: i,
      hp: 100,
      shieldUntil: 0,
    } as Player;
    character(
      c,
      p,
      550 + (i % 2) * 340,
      170 + Math.floor(i / 2) * 570,
      i < 2 ? 1 : -1,
      1,
    );
  });
  c.restore();
}
function render(time: number) {
  const dt = Math.min((time - lastFrame) / 1000, 0.05);
  lastFrame = time;
  if (scene === "game" && state && canvas && ctx) {
    const available = canvas.parentElement!.getBoundingClientRect(),
      ratio = Math.min(available.width / VIEW_W, available.height / VIEW_H);
    canvas.style.width = `${VIEW_W * ratio}px`;
    canvas.style.height = `${VIEW_H * ratio}px`;
    const me = state.players.find((p) => p.id === myId);
    const focus = display.get(myId) ?? me;
    if (focus) {
      camera.x = Math.max(0, Math.min(WIDTH - VIEW_W, focus.x - VIEW_W / 2));
      camera.y = Math.max(0, Math.min(HEIGHT - VIEW_H, focus.y - VIEW_H / 2));
    }
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    floor(ctx, state.walls);
    const now = state.now + Math.min(time - lastStateAt, 200);
    for (const pickup of state.pickups) {
      if (pickup.readyAt !== 0) continue;
      const info = POWER_INFO[pickup.kind];
      ctx.strokeStyle = info.color;
      ctx.fillStyle = "#0a1421";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = info.color;
      ctx.font = "bold 15px Segoe UI";
      ctx.fillText(info.icon, pickup.x, pickup.y + 6);
      ctx.font = "11px Segoe UI";
      ctx.fillText("SUPPLY", pickup.x, pickup.y + 49);
      ctx.textAlign = "left";
    }
    const i = input();
    for (const p of state.players) {
      if (p.hp <= 0) {
        display.delete(p.id);
        continue;
      }
      let pos = display.get(p.id);
      if (!pos) {
        pos = { x: p.x, y: p.y };
        display.set(p.id, pos);
      }
      if (Math.hypot(pos.x - p.x, pos.y - p.y) > 110) {
        pos.x = p.x;
        pos.y = p.y;
      }
      let targetX = p.x,
        targetY = p.y;
      if (
        p.id === myId &&
        state.phase === "playing" &&
        time - lastStateAt < 300
      ) {
        const n = Math.max(1, Math.hypot(i.x, i.y)),
          ahead = Math.min(time - lastStateAt, 100) / 1000,
          nx = p.x + (i.x / n) * movementSpeed(p, now) * ahead,
          ny = p.y + (i.y / n) * movementSpeed(p, now) * ahead;
        if (!blocked(nx, p.y, undefined, state.walls)) targetX = nx;
        if (!blocked(targetX, ny, undefined, state.walls)) targetY = ny;
      }
      const blend = 1 - Math.exp(-dt * (p.id === myId ? 30 : 17));
      pos.x += (targetX - pos.x) * blend;
      pos.y += (targetY - pos.y) * blend;
      character(ctx, p, pos.x, pos.y, p.id === myId ? i.aim : p.aim, now);
    }
    for (const b of state.bullets) {
      ctx.strokeStyle = TEAMS[b.team].color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = "#fff3c4";
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    for (const beam of state.beams) {
      ctx.globalAlpha = Math.max(0, Math.min(1, (beam.until - now) / 170));
      ctx.strokeStyle = "#b88bff";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(beam.endX, beam.endY);
      ctx.stroke();
      ctx.strokeStyle = "#fff0ff";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawMinimap(ctx, state);
    if (me) {
      ctx.fillStyle = "#07101de6";
      ctx.fillRect(16, VIEW_H - 49, 415, 34);
      ctx.fillStyle =
        me.power && me.powerUntil > now
          ? POWER_INFO[me.power].color
          : "#b0c2d1";
      ctx.font = "bold 14px Segoe UI";
      ctx.fillText(
        me.power && me.powerUntil > now
          ? `${POWER_INFO[me.power].label}  /  ${((me.powerUntil - now) / 1000).toFixed(1)}s`
          : "RANDOM SUPPLIES / 5 POWER TYPES / 3s BOOSTS",
        27,
        VIEW_H - 27,
      );
    }
    const seconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
    document.querySelector("#timer")!.textContent =
      state.phase === "finished"
        ? "0:00"
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const p = state.players.find((p) => p.id === myId),
      banner = document.querySelector<HTMLElement>("#banner")!;
    if (time - lastStateAt > 3000) {
      banner.classList.remove("hidden");
      banner.innerHTML =
        "<h2>Connection interrupted</h2><p>Waiting for the game server...</p>";
      keys.clear();
      mouse.down = false;
    } else if (state.phase === "intermission") {
      banner.classList.remove("hidden");
      banner.innerHTML = `<h2>Round ${state.round} complete</h2><p>Next round in ${seconds} seconds</p>`;
    } else if (p && p.hp <= 0 && state.phase === "playing") {
      banner.classList.remove("hidden");
      banner.innerHTML = `<h2>Back in ${Math.max(1, Math.ceil((p.respawnAt - now) / 1000))}</h2><p>Regroup. Your team needs you.</p>`;
    } else banner.classList.add("hidden");
  }
  requestAnimationFrame(render);
}
function drawMinimap(c: CanvasRenderingContext2D, s: Snapshot) {
  const w = 210,
    h = 140,
    x = VIEW_W - w - 16,
    y = VIEW_H - h - 16;
  c.save();
  c.translate(x, y);
  c.fillStyle = "#06101deb";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "#607486";
  c.strokeRect(0, 0, w, h);
  const sx = w / WIDTH,
    sy = h / HEIGHT;
  c.fillStyle = "#485e70";
  for (const wall of s.walls)
    c.fillRect(wall.x * sx, wall.y * sy, wall.w * sx, wall.h * sy);
  for (const pickup of s.pickups)
    if (pickup.readyAt === 0) {
      c.fillStyle = POWER_INFO[pickup.kind].color;
      c.fillRect(pickup.x * sx - 2, pickup.y * sy - 2, 4, 4);
    }
  for (const p of s.players)
    if (p.hp > 0) {
      c.fillStyle = p.id === myId ? "#ffffff" : TEAMS[p.team].color;
      c.beginPath();
      c.arc(p.x * sx, p.y * sy, p.id === myId ? 4 : 2.5, 0, Math.PI * 2);
      c.fill();
    }
  c.strokeStyle = "#ffffff80";
  c.strokeRect(camera.x * sx, camera.y * sy, VIEW_W * sx, VIEW_H * sy);
  c.restore();
}
window.addEventListener("keydown", (e) => {
  if (
    scene === "game" &&
    ["w", "a", "s", "d", " "].includes(e.key.toLowerCase())
  ) {
    e.preventDefault();
    keys.add(e.key.toLowerCase());
    if (!e.repeat) sendInput();
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
  sendInput();
});
window.addEventListener("mouseup", () => {
  mouse.down = false;
  sendInput();
});
window.addEventListener("blur", () => {
  keys.clear();
  mouse.down = false;
  sendInput();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    mouse.down = false;
    sendInput();
  }
});
function sendInput() {
  if (scene === "game" && socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: "input", input: input() }));
}
setInterval(sendInput, 50);
setInterval(() => void refresh(), 4000);
requestAnimationFrame(render);
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
