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
import {
  GOALS,
  SHOP,
  STARTER_SKIN_IDS,
  goalTarget,
  type CareerProfile,
  type GoalId,
  type ShopItemId,
} from "../shared/career";
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
  name = localStorage.getItem("blockfire-career-name") ?? "",
  scene = "lobby",
  selectedRoom: RoomInfo | undefined,
  lobbyOffline = false,
  leaving = false,
  game: GameUI | undefined;
type SavedCareer = { name: string; token: string };
const careerKey = (value: string) => value.trim().toLowerCase();
function loadCareers(): Record<string, SavedCareer> {
  try {
    const parsed = JSON.parse(localStorage.getItem("blockfire-career-profiles") ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
const savedCareers = loadCareers();
let legacyToken = localStorage.getItem("blockfire-career-token") ?? "";
let careerToken = "";
let careerProfile: CareerProfile | undefined;
function saveCareers() {
  localStorage.setItem("blockfire-career-profiles", JSON.stringify(savedCareers));
}
type RankingRow = {
  id: string;
  name: string;
  wins: number;
  totalPoints: number;
  botKills: number;
  humanKills: number;
  bestHumanKills: number;
  matches: number;
};
type Rankings = {
  totalPoints: RankingRow[];
  wins: RankingRow[];
  humanKills: RankingRow[];
  bestHumanKills: RankingRow[];
  latestPredator: { name: string; kills: number } | null;
};
let rankingTab: "wins" | "humanKills" | "bestHumanKills" | "totalPoints" = "totalPoints";
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
async function careerApi<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  const response = await fetch(`${base}/api/career/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(careerToken ? { Authorization: `Bearer ${careerToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Career server unavailable.");
  return data;
}
async function migrateLegacyCareer() {
  if (!legacyToken) return;
  careerToken = legacyToken;
  const profile = (await careerApi<{ profile: CareerProfile }>("profile")).profile;
  savedCareers[careerKey(profile.name)] ??= { name: profile.name, token: legacyToken };
  saveCareers();
  if (!name) name = profile.name;
  localStorage.setItem("blockfire-career-name", name);
  localStorage.removeItem("blockfire-career-token");
  legacyToken = "";
}
async function ensureCareer() {
  if (legacyToken) await migrateLegacyCareer();
  Object.assign(savedCareers, loadCareers());
  const saved = savedCareers[careerKey(name)];
  careerToken = saved?.token ?? "";
  if (saved) {
    careerProfile = (await careerApi<{ profile: CareerProfile }>("profile")).profile;
    updateCareerBadge();
    return;
  }
  const created = await careerApi<{ token: string; profile: CareerProfile }>(
    "new",
    "POST",
    { name },
  );
  careerToken = created.token;
  careerProfile = created.profile;
  savedCareers[careerKey(name)] = { name, token: careerToken };
  saveCareers();
  updateCareerBadge();
}
function updateCareerBadge() {
  const badge = document.querySelector<HTMLElement>("#career-balance");
  if (badge)
    badge.textContent = careerProfile
      ? `${careerProfile.coins} CREDITS`
      : "CAREER OFFLINE";
}
function error(message: string) {
  const e = document.querySelector<HTMLElement>("#error");
  if (e) {
    e.textContent = message;
    e.classList.remove("hidden");
  }
}
function lobby(message = "") {
  leaving = false;
  Object.assign(savedCareers, loadCareers());
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
  app.innerHTML = `<div class="shell"><header><div class="brand"><div class="mark">B</div><div>BLOCKFIRE<small>ARENA</small></div></div><nav class="career-nav"><span id="career-balance">CAREER OFFLINE</span><button id="statistics" class="ghost">Statistics</button><button id="objectives" class="ghost">Objectives</button><button id="store" class="ghost">Store</button></nav><div class="status"><i></i> MULTIPLAYER / ONLINE</div></header>
    <section class="intro"><div><div class="eyebrow">Four teams. One arena.</div><h1>Find your squad.</h1><p class="muted">Join the fight. Bring a friend. Make every shot count.</p></div><div class="stats"><div class="stat"><strong id="online">—</strong><span>Players online</span></div><div class="stat"><strong id="room-count">—</strong><span>Live rooms</span></div></div></section>
    <div id="error" role="alert" class="error ${message ? "" : "hidden"}">${escape(message)}</div>
    <div class="lobby-layout"><section class="panel"><div class="panel-title"><h2>Room browser</h2><span>LIVE ARENAS</span></div><div class="arena-art"><canvas id="preview" width="900" height="240" aria-label="Arena map preview"></canvas><span class="art-label">SKYBRIDGE 3D / 1–8 PLAYERS</span></div><div id="rooms" class="rooms"><div class="empty">Connecting to the lobby...</div></div></section>
    <aside class="panel side"><div class="eyebrow">Ready to play?</div><h2>Enter the arena</h2><p class="muted">Pick a callsign and join your team. Saved callsigns have separate careers.</p><label for="callsign">YOUR CALLSIGN</label><input id="callsign" list="saved-callsigns" maxlength="16" placeholder="e.g. Maverick" value="${escape(name)}" autocomplete="off"><datalist id="saved-callsigns">${Object.values(savedCareers).map((p) => `<option value="${escape(p.name)}"></option>`).join("")}</datalist><div style="height:18px"></div><button class="primary" id="create">Create a room</button><div class="divider">HAVE A CODE?</div><label for="room-code">ROOM CODE</label><form id="code-form" class="code-row"><input id="room-code" maxlength="6" placeholder="ABC123" aria-label="Room code" autocomplete="off"><button type="submit">Join</button></form><p class="muted" style="font-size:12px;margin:18px 0 0">No waiting around. Robots fill empty spots until your friends arrive.</p><p class="notice desktop-note">Use a keyboard and mouse to play.</p></aside></div>
    <section class="rules"><div class="rule"><span class="number">01 / SQUAD UP</span><h3>Four teams of two</h3><p>Choose your team. Share the room code. Teammates cannot hurt each other.</p></div><div class="rule"><span class="number">02 / SCORE POINTS</span><h3>Every elimination counts</h3><p>Every elimination earns 1 point. Humans and robots compete for their team.</p></div><div class="rule"><span class="number">03 / TAKE THE WIN</span><h3>Three rounds. 90 seconds each.</h3><p>Team scores carry across rounds. Highest total wins. Tied teams share victory.</p></div></section>
    <div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp; · &nbsp; Mouse to aim &nbsp; · &nbsp; Hold click to fire</span><span>100 HP + 100 SHIELD &nbsp; / &nbsp; 3s respawn &nbsp; / &nbsp; No friendly fire</span></div><section class="supply-guide" aria-label="Power-up guide">${Object.values(
      POWER_INFO,
    )
      .map(
        (p) =>
          `<div style="--power:${p.color}"><b>${p.icon}</b><span>${p.label}</span></div>`,
      )
      .join(
        "",
      )}</section><p class="muted">Walk over a supply to store it. E activates it; F swaps a stored supply. Four shield cells appear around the center and respawn after 20s. Carry one and hold Z for 1.5s to restore health and shield; release or take damage to interrupt. Space jumps, Shift dashes, 1/2/3/4 select weapons, right click scopes, and R reloads. The center holds a five-shot power sniper.</p><footer>BLOCKFIRE ARENA — PLAY TOGETHER, FROM ANYWHERE.</footer></div>
    <dialog id="team-dialog"><div class="eyebrow">Choose your side</div><h2 id="team-title"></h2><p class="muted">Two spots per team. Join a friend or start a new squad.</p><div id="team-options" class="teams"></div><div id="team-error" class="error hidden" role="alert"></div><div class="dialog-footer"><span>You'll replace a robot immediately.</span><button id="cancel-team" class="ghost">Cancel</button></div></dialog><dialog id="career-dialog" class="career-dialog"><div class="career-head"><div><div class="eyebrow">BLOCKFIRE / FIELD DOSSIER</div><h2 id="career-title"></h2></div><button id="career-close" class="ghost" aria-label="Close">✕</button></div><div id="career-content"></div></dialog>`;
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
  for (const section of ["statistics", "objectives", "store"] as const)
    document
      .querySelector(`#${section}`)!
      .addEventListener("click", () => void showCareer(section));
  document
    .querySelector("#career-close")!
    .addEventListener("click", () =>
      document.querySelector<HTMLDialogElement>("#career-dialog")!.close(),
    );
  updateCareerBadge();
  if (name && savedCareers[careerKey(name)])
    void ensureCareer()
      .catch(() => {
        careerProfile = undefined;
        updateCareerBadge();
      });
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
  localStorage.setItem("blockfire-career-name", name);
  if (careerProfile && careerKey(careerProfile.name) !== careerKey(name)) {
    careerProfile = undefined;
    careerToken = "";
    updateCareerBadge();
  }
  return true;
}
async function showCareer(section: "statistics" | "objectives" | "store") {
  const dialog = document.querySelector<HTMLDialogElement>("#career-dialog");
  if (!dialog) return;
  const content = document.querySelector<HTMLElement>("#career-content")!;
  document.querySelector<HTMLElement>("#career-title")!.textContent =
    section === "statistics"
      ? "Predators & rankings"
      : section === "objectives"
        ? "Field objectives"
        : "Armory exchange";
  content.innerHTML = '<p class="muted">Loading career data…</p>';
  if (!dialog.open) dialog.showModal();
  try {
    if (section === "statistics") {
      const selected = document.querySelector<HTMLInputElement>("#callsign")?.value.trim();
      if (selected && savedCareers[careerKey(selected)]) {
        name = selected;
        await ensureCareer();
      }
      const data = await careerApi<Rankings>("rankings");
      const tabs = [
        ["totalPoints", "TOTAL POINTS"],
        ["wins", "WINS"],
        ["humanKills", "HUMAN ELIMS"],
        ["bestHumanKills", "SINGLE MATCH"],
      ] as const;
      const render = () => {
        const rows = data[rankingTab];
        content.innerHTML = `<div class="career-feature"><div><span class="eyebrow">WORLD RECORD / SINGLE MATCH</span><strong>${data.bestHumanKills[0]?.bestHumanKills ?? 0}</strong><span>${escape(data.bestHumanKills[0]?.name ?? "UNCLAIMED")}</span></div><div><span class="eyebrow">LATEST PREDATOR</span><strong>${data.latestPredator?.kills ?? 0}</strong><span>${escape(data.latestPredator?.name ?? "NO QUALIFIED MATCH YET")}</span></div></div><div class="career-tabs">${tabs.map(([key, label]) => `<button data-rank="${key}" class="${rankingTab === key ? "active" : "ghost"}">${label}</button>`).join("")}</div><div class="career-list">${rows.length ? rows.map((row, i) => `<div class="career-row ${row.id === careerProfile?.id ? "mine" : ""}"><b>#${i + 1}</b><span>${escape(row.name)}${row.id === careerProfile?.id ? " / YOU" : ""}<small>${row.totalPoints} POINTS · ${row.humanKills} HUMAN ELIMS · ${row.botKills} ROBOT ELIMS · ${row.wins} PVP WINS</small></span><strong>${row[rankingTab]}</strong></div>`).join("") : '<p class="muted">Play to enter the rankings.</p>'}</div>`;
        content
          .querySelectorAll<HTMLButtonElement>("[data-rank]")
          .forEach((button) =>
            button.addEventListener("click", () => {
              rankingTab = button.dataset.rank as typeof rankingTab;
              render();
            }),
          );
      };
      render();
      return;
    }
    if (!readName()) {
      content.innerHTML =
        '<p class="muted">Enter a callsign in the lobby first.</p>';
      return;
    }
    await ensureCareer();
    const p = careerProfile!;
    if (section === "objectives") {
      content.innerHTML = `<p class="muted">Robot matches count toward match and win objectives. Claim each level to unlock the next.</p><div class="career-list">${GOALS.map(
        (goal) => {
          const level = p.claimed[goal.id] + 1;
          const target = goalTarget(goal.id, level);
          const progress =
            goal.id === "kills" ? p.humanKills + p.botKills : goal.id === "matches" ? p.goalMatches : goal.id === "wins" ? p.goalWins : p.charges;
          return `<div class="objective-row"><div><span class="eyebrow">LEVEL ${level}</span><h3>${goal.label}</h3><p>${goal.unit} · ${progress} / ${target}</p><div class="objective-track"><i style="width:${Math.min(100, (progress / target) * 100)}%"></i></div></div><button data-claim="${goal.id}" ${progress < target ? "disabled" : ""}>CLAIM +${goal.reward * level}</button></div>`;
        },
      ).join(
        "",
      )}</div><p class="career-note">CREDITS ${p.coins} · Rewards do not affect weapon damage.</p>`;
      content
        .querySelectorAll<HTMLButtonElement>("[data-claim]")
        .forEach((button) =>
          button.addEventListener("click", async () => {
            try {
              careerProfile = (
                await careerApi<{ profile: CareerProfile }>("claim", "POST", {
                  id: button.dataset.claim as GoalId,
                })
              ).profile;
              updateCareerBadge();
              void showCareer("objectives");
            } catch (e) {
              content.insertAdjacentHTML(
                "afterbegin",
                `<p class="error">${escape((e as Error).message)}</p>`,
              );
            }
          }),
        );
      return;
    }
    content.innerHTML = `<p class="muted">Every completed match earns credits. Your robot and human eliminations add more. All unlocks are cosmetic.</p><div class="career-wallet">${p.coins} CREDITS AVAILABLE</div><div class="shop-grid">${SHOP.filter(
      (item) =>
        item.id === "skin-cinder" ||
        !STARTER_SKIN_IDS.some((id) => id === item.id),
    )
      .map((item) => {
        const owned = p.owned.includes(item.id);
        const equipped = p.equipped[item.type] === item.id;
        const starterControls = STARTER_SKIN_IDS.map((id) =>
          SHOP.find((finish) => finish.id === id)!,
        )
          .map(
            (finish) =>
              `<button class="starter-color ${p.equipped.skin === finish.id ? "selected" : ""}" style="--item:${finish.color}" data-item="${finish.id}" data-type="skin" ${p.equipped.skin === finish.id ? "disabled" : ""}><i></i>${finish.label.replace("Cinder ", "")}</button>`,
          )
          .join("");
        return `<div class="shop-card" style="--item:${item.color}"><div class="shop-swatch"></div><span class="eyebrow">${item.id === "skin-cinder" ? "FREE TO TRY · ADJUST COLOR" : item.type === "skin" ? "WEAPON FINISH" : "BULLET TRAIL"}</span><h3>${item.label}</h3><p>${item.id === "skin-cinder" ? "Choose a free finish color for every weapon." : item.type === "skin" ? "A flowing metallic finish for every weapon." : "A distinctive normal-shot tracer."}</p>${item.id === "skin-cinder" ? `<div class="starter-colors">${starterControls}</div>` : `<button data-item="${item.id}" data-type="${item.type}" ${equipped || (!owned && p.coins < item.price) ? "disabled" : ""}>${equipped ? "EQUIPPED" : owned ? "EQUIP" : `BUY / ${item.price}`}</button>`}</div>`;
      })
      .join(
        "",
      )}</div><div class="career-defaults"><button data-default="skin" class="ghost">Default weapon finish</button><button data-default="tracer" class="ghost">Default tracer</button></div>`;
    content
      .querySelectorAll<HTMLButtonElement>("[data-item]")
      .forEach((button) =>
        button.addEventListener("click", async () => {
          const id = button.dataset.item as ShopItemId;
          try {
            if (!careerProfile!.owned.includes(id))
              await careerApi("buy", "POST", { id });
            careerProfile = (
              await careerApi<{ profile: CareerProfile }>("equip", "POST", {
                id,
                type: button.dataset.type,
              })
            ).profile;
            updateCareerBadge();
            void showCareer("store");
          } catch (e) {
            content.insertAdjacentHTML(
              "afterbegin",
              `<p class="error">${escape((e as Error).message)}</p>`,
            );
          }
        }),
      );
    content
      .querySelectorAll<HTMLButtonElement>("[data-default]")
      .forEach((button) =>
        button.addEventListener("click", async () => {
          try {
            careerProfile = (
              await careerApi<{ profile: CareerProfile }>("equip", "POST", {
                type: button.dataset.default,
              })
            ).profile;
            updateCareerBadge();
            void showCareer("store");
          } catch (e) {
            content.insertAdjacentHTML(
              "afterbegin",
              `<p class="error">${escape((e as Error).message)}</p>`,
            );
          }
        }),
      );
  } catch (e) {
    content.innerHTML = `<p class="error">${escape((e as Error).message)}</p>`;
  }
}
async function refresh() {
  if (scene !== "lobby") return;
  if (careerToken)
    void careerApi<{ profile: CareerProfile }>("profile")
      .then((data) => {
        careerProfile = data.profile;
        updateCareerBadge();
      })
      .catch(() => {});
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
  await ensureCareer();
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
      JSON.stringify({
        type: "join",
        name,
        team,
        protocol: PROTOCOL,
        token: careerToken,
      }),
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
    } else if (msg.type === "left") {
      lobby();
    } else if (msg.type === "error") {
      if (!joined) {
        clearTimeout(timeout);
        attempt.onclose = null;
        attempt.close();
        lobby(msg.message);
      } else {
        leaving = false;
        error(msg.message);
      }
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

function requestLeave() {
  if (leaving) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    lobby();
    return;
  }
  leaving = true;
  const attempt = socket;
  attempt.send(JSON.stringify({ type: "leave" }));
  setTimeout(() => {
    if (socket === attempt && leaving)
      lobby("Career save is taking longer than expected. Check Statistics again shortly.");
  }, 5000);
}

function showGame(arena: ReturnType<typeof createArena>, models: WeaponModels) {
  scene = "game";
  try {
    game = new GameUI(app, socket!, myId, roomCode, arena, models, requestLeave);
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
  c.fillStyle = "#4c5557";
  c.fillRect(0, 0, canvas.width, canvas.height);
  const sx = canvas.width / WIDTH,
    sz = canvas.height / DEPTH;
  for (const b of arena.boxes) {
    c.fillStyle =
      b.kind === "floor"
        ? "#818887"
        : b.kind === "cover"
          ? "#5e625f"
          : "#323d42";
    c.fillRect(b.x * sx, b.z * sz, b.w * sx, b.d * sz);
  }
  c.fillStyle = "#c79a60";
  for (const r of arena.ramps)
    c.fillRect(r.x * sx, r.z * sz, r.w * sx, r.d * sz);
  arena.spawns.forEach((p, i) => {
    c.fillStyle = TEAMS[i].color;
    c.fillRect(p.x * sx - 8, p.z * sz - 8, 16, 16);
  });
  for (const p of arena.batteries) {
    c.fillStyle = "#8dd8fb";
    c.beginPath();
    c.arc(p.x * sx, p.z * sz, 6, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#efe4d1";
  c.font = "bold 23px Segoe UI";
  c.textAlign = "center";
  c.fillText("FOUNDRY YARD", canvas.width / 2, canvas.height / 2 + 8);
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
  if (legacyToken) {
    try { await migrateLegacyCareer(); } catch { /* Keep the old credential for retry. */ }
  }
  lobby();
}
void boot();
