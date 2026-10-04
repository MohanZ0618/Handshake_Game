import type { WeaponModels } from "./weapon-models";
import { WEAPONS, WEAPON_IDS } from "../shared/weapons";
import type { Arena } from "../shared/arena";
import {
  TEAMS,
  POWER_INFO,
  type Snapshot,
  type Input,
  type GameEvent,
} from "../shared/game";
import { distance } from "../shared/physics";
import { Controls } from "./input";
import { Sound, loadSettings, saveSettings } from "./audio";
import { EventCursor } from "./events";
import { ArenaRenderer } from "./renderer";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const KILL_GLYPHS = [
  '<path d="M32 10c-2 10-13 15-13 30a13 13 0 0 0 26 0c0-8-4-12-8-17 1 9-4 11-5 12-5-8 2-14 0-25Z" fill="currentColor"/>',
  '<path d="M9 33c8-11 15-11 23 0s15 11 23 0M9 43c8-11 15-11 23 0s15 11 23 0" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
  '<path d="M15 48c0-22 12-32 36-34-2 25-12 37-34 35m2-2 25-26" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  '<path d="M37 10 17 37h14l-4 18 21-29H34l3-16Z" fill="currentColor"/>',
] as const;
export class GameUI {
  private sniperNoticeUntil = 0;
  private syncNoticeUntil = 0;
  private controls: Controls;
  private sound: Sound;
  private renderer: ArenaRenderer;
  private settings = loadSettings();
  private events = new EventCursor();
  private state?: Snapshot;
  private elements = new Map<string, HTMLElement>();
  private htmlValues = new Map<string, string>();
  private receivedAt = 0;
  private raf = 0;
  private interval: ReturnType<typeof setInterval>;
  private lastFrame = performance.now();
  private first = true;
  private rendererLife = 0;
  private phase = "";
  private hitUntil = 0;
  private hurtUntil = 0;
  private blockUntil = 0;
  private killUntil = 0;
  private streak = 0;
  private lastKill = 0;
  private lastDiagnostics = 0;
  private abort = new AbortController();
  private disposed = false;
  constructor(
    private app: HTMLElement,
    private socket: WebSocket,
    private id: string,
    code: string,
    arena: Arena,
    models: WeaponModels,
    private onLeave: () => void,
  ) {
    app.innerHTML = `<div class="game-shell"><div class="game-top"><div class="brand"><div class="mark">B</div>BLOCKFIRE <small>3D</small></div><div id="scores" class="scores"></div><div class="match-time"><strong id="timer">1:30</strong><small id="round">ROUND 1 / 3</small></div><button id="menu-button" class="ghost">Settings / Esc</button><button id="leave" class="ghost">Leave room</button></div><div id="error" class="error hidden" role="alert"></div><div class="battlefield fps-field"><canvas id="game" tabindex="0" aria-label="First-person 3D arena. WASD move, mouse aim, Space jump, Shift dash, E use, F swap."></canvas><div id="crosshair">+</div><div id="scope-overlay" class="hidden"><div class="scope-lens"><i></i></div></div><div id="power-announcement" class="hidden">POWER WEAPON AVAILABLE</div><div id="sync-announcement" aria-live="polite">SYNC STRIKE · +15 SHIELD · +10% SPEED</div><div id="hit-marker">×</div><div id="hurt"><span id="hurt-arrow">▲</span></div><div id="kill-message" role="status" aria-live="polite"></div><div id="feed" class="feed"></div><div id="banner" class="banner hidden"></div><div id="shield-edge"></div><div id="speed-edge"></div><div id="sync-edge"></div><div class="weapon-panel"><div id="weapon-slots"></div><strong id="ammo"></strong><span id="reload-state"></span><div class="dash-track"><i id="reload-bar"></i></div></div><div class="ability-panel"><div class="eyebrow">FIELD EQUIPMENT</div><strong id="stored">E / EMPTY SLOT</strong><span id="active">Find a supply to charge your next move.</span><div class="dash-track"><i id="dash-bar"></i></div><span id="dash">SHIFT / DASH READY</span><span id="pickup-hint"></span><span id="sync-status">SYNC STRIKE READY · FOCUS ONE TARGET</span></div><div class="minimap-panel"><canvas id="minimap" width="240" height="160"></canvas><span id="performance">SKYBRIDGE / TWO LEVELS</span></div><div id="pause" class="pause-panel"><div class="eyebrow">SKYBRIDGE / FIRST PERSON</div><h2>Enter the arena.</h2><p>WASD move · Mouse aim · Hold click to fire<br>Right click scope · 1 / 2 / 3 / 4 switch weapon<br>Space jump · Shift dash · E use · F swap · R reload<br>Sync Strike: you and a teammate hit the same enemy within 3s.</p><button id="resume" class="primary">Click to play</button><button id="drag-play" class="ghost hidden" style="margin-top:10px">Play with drag-look</button><p class="muted" id="lock-hint">Esc opens this menu. The match continues.</p><div class="settings-grid"><label>Graphics quality <select id="quality"><option value="low">Low / smooth</option><option value="high">High / shadows</option></select></label><label>Sound volume <input id="volume" type="range" min="0" max="100" value="${this.settings.volume * 100}"></label><label>Mouse sensitivity <input id="sensitivity" type="range" min="0.2" max="3" step="0.1" value="${this.settings.sensitivity}"></label><label class="check"><input id="muted" type="checkbox" ${this.settings.muted ? "checked" : ""}> Mute audio</label><label class="check"><input id="shake" type="checkbox" ${this.settings.shake ? "checked" : ""}> Screen shake</label></div></div></div><div class="hud"><div class="health"><span id="player-label"></span><b id="hp"></b><div class="healthbar"><i id="hp-bar"></i></div></div><span class="hint">SPACE Jump &nbsp; SHIFT Dash &nbsp; E Use &nbsp; F Swap</span><span id="personal-score"></span><span>ROOM <b>${escape(code)}</b></span></div></div><dialog id="result"><div class="eyebrow">Match complete</div><h2 id="winner"></h2><p class="muted">Three rounds. One final score.</p><div id="result-table"></div><div class="dialog-footer"><button id="back-lobby">Back to lobby</button><button id="rematch" class="primary">Play again</button></div></dialog>`;
    app
      .querySelector(".health")!
      .insertAdjacentHTML(
        "beforeend",
        '<b id="armor">100 SHIELD</b><div class="healthbar armorbar"><i id="armor-bar"></i></div>',
      );
    app
      .querySelector(".ability-panel")!
      .insertAdjacentHTML(
        "beforeend",
        '<strong id="battery-hint">SHIELD CELL / EMPTY</strong><div class="dash-track battery-track"><i id="battery-progress"></i></div>',
      );
    app
      .querySelector(".pause-panel p")!
      .insertAdjacentHTML(
        "beforeend",
        "<br>Hold Z for 1.5s to recharge with a shield cell.",
      );
    const canvas = this.el<HTMLCanvasElement>("game");
    this.sound = new Sound(this.settings);
    this.renderer = new ArenaRenderer(
      canvas,
      this.el<HTMLCanvasElement>("minimap"),
      id,
      arena,
      models,
      this.settings.quality,
    );
    this.controls = new Controls(canvas, (locked) =>
      this.el("pause").classList.toggle("hidden", locked),
    );
    this.el<HTMLInputElement>("quality").value = this.settings.quality;
    this.controls.sensitivity = this.settings.sensitivity;
    this.el("resume").addEventListener("click", () => {
      void this.sound.unlock().then((ok) => {
        if (this.disposed) return;
        if (!ok)
          this.el("lock-hint").textContent =
            "Audio unavailable. You can still play.";
      });
      void this.controls.lock().catch(() => {
        if (this.disposed) return;
        this.el("drag-play").classList.remove("hidden");
        this.el("lock-hint").textContent =
          "Mouse capture is unavailable here. Use drag-look: hold right mouse to aim, left click to fire.";
      });
    });
    this.el("drag-play").addEventListener("click", () => {
      void this.sound.unlock();
      this.controls.useDragLook();
    });
    this.el("menu-button").addEventListener("click", () => {
      this.controls.release();
      this.el("pause").classList.remove("hidden");
    });
    this.el("leave").addEventListener("click", onLeave);
    this.el("back-lobby").addEventListener("click", onLeave);
    this.el("rematch").addEventListener("click", () =>
      socket.send(JSON.stringify({ type: "rematch" })),
    );
    for (const key of [
      "volume",
      "sensitivity",
      "muted",
      "shake",
      "quality",
    ] as const)
      this.el(key).addEventListener("input", () => {
        this.settings.volume =
          Number(this.el<HTMLInputElement>("volume").value) / 100;
        this.settings.sensitivity = Number(
          this.el<HTMLInputElement>("sensitivity").value,
        );
        this.settings.muted = this.el<HTMLInputElement>("muted").checked;
        this.settings.shake = this.el<HTMLInputElement>("shake").checked;
        this.settings.quality =
          this.el<HTMLInputElement>("quality").value === "high"
            ? "high"
            : "low";
        this.renderer.setQuality(this.settings.quality);
        saveSettings(this.settings);
        this.sound.update();
        this.controls.sensitivity = this.settings.sensitivity;
      });
    canvas.addEventListener("rendererror", (e) => {
      this.controls.release();
      this.el("lock-hint").textContent = (e as CustomEvent<string>).detail;
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        this.events.reset();
        this.hitUntil = this.hurtUntil = this.killUntil = 0;
        if (document.hidden) this.sound.suspend();
      },
      { signal: this.abort.signal },
    );
    this.interval = setInterval(() => this.send(), 50);
    this.raf = requestAnimationFrame(this.frame);
  }
  private el<T extends HTMLElement = HTMLElement>(id: string) {
    if (!this.elements.has(id))
      this.elements.set(id, this.app.querySelector<HTMLElement>(`#${id}`)!);
    return this.elements.get(id) as T;
  }
  private html(id: string, value: string) {
    if (this.htmlValues.get(id) === value) return;
    this.htmlValues.set(id, value);
    this.el(id).innerHTML = value;
  }
  private send() {
    if (this.socket.readyState !== WebSocket.OPEN || !this.state) return;
    const i = this.controls.sample();
    if (
      this.state.phase !== "playing" ||
      !this.state.players.find((p) => p.id === this.id)?.hp
    ) {
      i.x = i.z = 0;
      i.fire = false;
    }
    this.socket.send(JSON.stringify({ type: "input", input: i }));
  }
  accept(s: Snapshot) {
    const firstState = this.first;
    this.state = s;
    this.receivedAt = performance.now();
    const p = s.players.find((p) => p.id === this.id);
    if (!p) return;
    if (this.first) {
      this.controls.aim = p.aim;
      this.controls.pitch = p.pitch;
      this.controls.weapon = p.weapon;
      this.first = false;
    }

    const phase = `${s.round}/${s.phase}`;
    if (phase !== this.phase) {
      this.controls.clear();
      this.hitUntil = this.hurtUntil = this.killUntil = 0;
      this.streak = 0;
      this.phase = phase;
    }
    if (this.rendererLife !== p.life) {
      this.controls.weapon = p.weapon;
      this.controls.clear();
      this.rendererLife = p.life;
    }
    if (p.ammo.sniper === 0 && this.controls.weapon === "sniper") this.controls.weapon = "rifle";
    this.renderer.accept(s);
    if (firstState) {
      const spawn = s.events.find((e) => e.kind === "sniper-spawn" && s.now - e.time < 1000);
      if (spawn) {
        this.renderer.event(spawn);
        this.sound.event(spawn, p, this.controls.aim);
        this.feedback(spawn);
      }
    }
    for (const e of this.events.read(s, !document.hidden)) {
      this.renderer.event(e);
      this.sound.event(e, p, this.controls.aim);
      this.feedback(e);
    }
    this.html(
      "scores",
      TEAMS.map(
        (t, i) =>
          `<div class="score-pill" style="--team:${t.color}">${t.name}<b>${s.scores[i]}</b></div>`,
      ).join(""),
    );
    this.el("round").textContent =
      s.phase === "playing"
        ? `ROUND ${s.round} / 3`
        : s.phase === "finished"
          ? "MATCH COMPLETE"
          : "NEXT ROUND";
    this.el("player-label").textContent = `${p.name} / ${TEAMS[p.team].name}`;
    this.el("hp").textContent = `${p.hp} HP`;
    this.el("hp-bar").style.width = `${p.hp}%`;
    this.el("armor").textContent = `${p.armor} SHIELD`;
    this.el("armor-bar").style.width = `${p.armor}%`;
    this.el("personal-score").textContent = `${p.score} PTS · ${p.kills} ELIMS`;
    this.html(
      "feed",
      s.feed
        .filter((f) => s.now - f.time < 6000)
        .map(
          (f) =>
            `<div><b style="color:${TEAMS[f.team].color}">${escape(f.killer)}</b><span>eliminated</span>${escape(f.victim)} <b>+${f.points}</b></div>`,
        )
        .join(""),
    );
    const result = this.el<HTMLDialogElement>("result");
    if (s.phase === "finished" && !result.open) {
      this.controls.release();
      const max = Math.max(...s.scores),
        winners = TEAMS.filter((_, i) => s.scores[i] === max);
      this.el("winner").textContent =
        winners.length === 1 ? `${winners[0].name} wins!` : "Shared victory!";
      this.el("result-table").innerHTML =
        `<table class="scoretable"><thead><tr><th>PLAYER</th><th>ELIMS</th><th>DEATHS</th><th>POINTS</th></tr></thead><tbody>${[
          ...s.players,
        ]
          .sort((a, b) => b.score - a.score)
          .map(
            (p) =>
              `<tr><td style="color:${TEAMS[p.team].color}">${escape(p.name)}${p.bot ? " / AI" : ""}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.score}</td></tr>`,
          )
          .join("")}</tbody></table>`;
      result.showModal();
    } else if (s.phase !== "finished" && result.open) {
      result.close();
      this.el("pause").classList.remove("hidden");
    }
  }
  private feedback(e: GameEvent) {
    const now = performance.now();
    if (e.kind === "sync" && e.team === this.state?.players.find((p) => p.id === this.id)?.team)
      this.syncNoticeUntil = now + 1600;
    if (e.kind === "sniper-spawn") this.sniperNoticeUntil = now + 3500;
    if (e.kind === "sniper-pickup" && e.actor === this.id) this.controls.weapon = "sniper";
    if (e.kind === "hit" && e.target === this.id) this.hitUntil = now + 140;
    if (e.kind === "block" && e.actor === this.id) this.blockUntil = now + 180;
    if (e.kind === "kill" && e.target === this.id) {
      this.streak = now - this.lastKill < 5000 ? this.streak + 1 : 1;
      this.lastKill = now;
      this.killUntil = now + 1400;
      const team = this.state?.players.find((p) => p.id === this.id)?.team ?? 0;
      const badge = this.el("kill-message");
      badge.style.setProperty("--kill-color", TEAMS[team].color);
      badge.innerHTML = `<span class="kill-emblem"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2" opacity=".65"/><circle cx="32" cy="32" r="23" fill="#07121d" stroke="currentColor" stroke-width="1.5"/>${KILL_GLYPHS[team]}</svg></span><span class="kill-caption">${this.streak > 1 ? `${this.streak} ELIM STREAK` : "ELIMINATION"}<small>+1 POINT · ${TEAMS[team].name}</small></span>`;
    }
    if (e.kind === "kill" && e.actor === this.id) this.streak = 0;
    if (e.kind === "hit" && e.actor === this.id) {
      this.hurtUntil = now + 500;
      if (e.source) {
        const angle =
          Math.atan2(e.source.z - e.z, e.source.x - e.x) - this.controls.aim;
        this.el("hurt-arrow").style.transform =
          `rotate(${angle + Math.PI / 2}rad)`;
      }
    }
  }
  private frame = (time: number) => {
    if (this.disposed) return;
    const motionMs = Math.min(300, Math.max(0, time - this.lastFrame));
    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    const s = this.state,
      p = s?.players.find((p) => p.id === this.id),
      input = this.controls.current();
    if (s && p) {
      if (time - this.receivedAt > 300) this.controls.clear();
      const view = this.renderer.frame(
        dt,
        input,
        this.settings.shake,
        motionMs,
      );
      const now = s.now + Math.min(200, time - this.receivedAt),
        seconds = Math.max(0, Math.ceil((s.endsAt - now) / 1000));
      this.el("timer").textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      this.el("stored").textContent = p.storedPower
        ? `STORED / ${POWER_INFO[p.storedPower].label} · ${p.power ? "WAIT FOR ACTIVE EFFECT" : "PRESS E"}`
        : "E / EMPTY SLOT";
      this.el("stored").style.color = p.storedPower
        ? POWER_INFO[p.storedPower].color
        : "#a8bbc9";
      this.el("active").textContent =
        p.power && p.powerUntil > now
          ? `ACTIVE / ${POWER_INFO[p.power].label} · ${((p.powerUntil - now) / 1000).toFixed(1)}s`
          : "Walk over a supply to store it.";
      this.html(
        "weapon-slots",
        WEAPON_IDS.map(
          (id, index) =>
            `<span class="${id === p.weapon ? "selected" : ""} ${id === "sniper" && p.ammo.sniper === 0 ? "unavailable" : ""}">${index + 1} ${WEAPONS[id].label}</span>`,
        ).join(""),
      );
      this.el("ammo").textContent =
        `${p.ammo[p.weapon]} / ${WEAPONS[p.weapon].magazine}`;
      const remaining = Math.max(0, p.reloadUntil - now);
      this.el("reload-state").textContent = p.weapon === "sniper"
        ? "FIVE SHOTS TOTAL · NO RELOAD"
        : remaining
        ? `RELOADING / ${(remaining / 1000).toFixed(1)}s`
        : p.switchUntil > now
          ? "SWITCHING"
          : "R / RELOAD · UNLIMITED RESERVE";
      this.el("reload-bar").style.width = remaining
        ? `${(1 - remaining / WEAPONS[p.weapon].reload) * 100}%`
        : "0%";
      this.el("shield-edge").classList.toggle(
        "active",
        p.hp > 0 && p.power === "shield" && p.powerUntil > now,
      );
      this.el("shield-edge").classList.toggle(
        "blocked",
        time < this.blockUntil,
      );
      this.el("speed-edge").classList.toggle(
        "active",
        p.hp > 0 &&
          ((p.power === "speed" && p.powerUntil > now) || p.dashUntil > now),
      );
      const cooldown = Math.max(0, p.dashReadyAt - now);
      this.el("dash").textContent = cooldown
        ? `SHIFT / ${(cooldown / 1000).toFixed(1)}s`
        : "SHIFT / DASH READY";
      this.el("dash-bar").style.width = `${(1 - cooldown / 4000) * 100}%`;
      const charging = p.chargeStart >= 0;
      this.el("battery-hint").textContent = charging
        ? `CHARGING / ${Math.min(1.5, (now - p.chargeStart) / 1000).toFixed(1)} / 1.5s`
        : p.battery
          ? p.hp < 50 || p.armor < 50
            ? "LOW DEFENSE · HOLD Z TO RECHARGE"
            : "SHIELD CELL READY · HOLD Z"
          : "SHIELD CELL / CENTER OF MAP";
      this.el("battery-progress").style.width = charging
        ? `${Math.min(100, (now - p.chargeStart) / 15)}%`
        : "0%";
      const nearby = s.pickups.find(
        (q) => !q.readyAt && distance(q, view ?? p) < 65,
      );
      this.el("pickup-hint").textContent =
        nearby && p.storedPower
          ? `F / SWAP FOR ${POWER_INFO[nearby.kind].label}`
          : "";
      this.el("hit-marker").style.opacity = time < this.hitUntil ? "1" : "0";
      this.el("hurt").style.opacity = time < this.hurtUntil ? "1" : "0";
      this.el("kill-message").style.opacity = time < this.killUntil ? "1" : "0";
      this.el("sync-announcement").style.opacity = time < this.syncNoticeUntil ? "1" : "0";
      const syncRemaining = Math.max(0, p.syncUntil - now);
      const syncCooldown = Math.max(0, s.syncReadyAt[p.team] - now);
      this.el("sync-status").textContent = syncRemaining
        ? `SYNC STRIKE ACTIVE · ${(syncRemaining / 1000).toFixed(1)}s`
        : syncCooldown
          ? `SYNC STRIKE · ${(syncCooldown / 1000).toFixed(1)}s COOLDOWN`
          : "SYNC STRIKE READY · FOCUS ONE TARGET";
      this.el("sync-edge").classList.toggle("active", p.hp > 0 && syncRemaining > 0);
      this.el("crosshair").classList.toggle(
        "hidden",
        p.hp <= 0 || !this.controls.locked || input.ads,
      );
      const scope = this.el("scope-overlay");
      scope.dataset.weapon = p.weapon;
      const scopeFade = Math.max(0, Math.min(1,
        (this.renderer.scopeProgress() - (p.weapon === "sniper" ? .82 : .35)) * (p.weapon === "sniper" ? 5.6 : 2.5)));
      scope.style.opacity = String(scopeFade);
      scope.classList.toggle("hidden", p.hp <= 0 || !this.controls.locked || scopeFade <= 0 || s.phase !== "playing");
      this.el("power-announcement").classList.toggle("hidden", time >= this.sniperNoticeUntil);
      const banner = this.el("banner");
      let message = "";
      if (time - this.receivedAt > 3000)
        message = "Connection interrupted — waiting for server";
      else if (s.phase === "intermission")
        message = `ROUND ${s.round} COMPLETE · NEXT IN ${seconds}s`;
      else if (p.hp <= 0 && s.phase === "playing")
        message = `RESPAWN IN ${Math.max(1, Math.ceil((p.respawnAt - now) / 1000))}s`;
      banner.textContent = message;
      banner.classList.toggle("hidden", !message);
      this.el("performance").textContent =
        `${this.renderer.fps()} FPS · ${view && view.y > 90 ? "L2 SKYBRIDGE" : "L1 GROUND"}`;
      if (time - this.lastDiagnostics > 1000) {
        this.lastDiagnostics = time;
        const metrics = this.renderer.metrics.stats(time);
        this.el("performance").title =
          `Samples ${metrics.frames}; FPS ${metrics.fps.toFixed(1)}; P95 ${metrics.p95.toFixed(2)} ms; P99 ${metrics.p99.toFixed(2)} ms; >50 ms ${metrics.slow}; ${this.renderer.network.summary()}; ${this.renderer.resources()}`;
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  dispose() {
    this.disposed = true;
    clearInterval(this.interval);
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.controls.dispose();
    this.sound.dispose();
    this.renderer.dispose();
  }
}
