import type { GameEvent, Player } from "../shared/game";
export interface Settings {
  volume: number;
  muted: boolean;
  sensitivity: number;
  shake: boolean;
  quality: "low" | "high";
}
export function loadSettings(): Settings {
  const defaults: Settings = {
    volume: 0.5,
    muted: false,
    sensitivity: 1,
    shake: true,
    quality: "low",
  };
  try {
    const s = JSON.parse(localStorage.getItem("blockfire-settings-v2") ?? "{}");
    return {
      volume:
        typeof s.volume === "number" && Number.isFinite(s.volume)
          ? Math.max(0, Math.min(1, s.volume))
          : defaults.volume,
      muted: s.muted === true,
      sensitivity:
        typeof s.sensitivity === "number" && Number.isFinite(s.sensitivity)
          ? Math.max(0.2, Math.min(3, s.sensitivity))
          : 1,
      quality: s.quality === "high" ? "high" : "low",
      shake: typeof s.shake === "boolean" ? s.shake : true,
    };
  } catch {
    return defaults;
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem("blockfire-settings-v2", JSON.stringify(s));
  } catch {
    /* Storage may be disabled; settings still apply for this session. */
  }
}
export class Sound {
  private context?: AudioContext;
  private master?: GainNode;
  private voices = new Set<AudioScheduledSourceNode>();
  private noise?: AudioBuffer;
  private disposed = false;
  constructor(public settings: Settings) {}
  async unlock() {
    if (this.disposed) return false;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate,
          this.context.sampleRate,
        );
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      await this.context.resume();
      if (this.disposed) return false;
      this.update();
      return true;
    } catch {
      return false;
    }
  }
  update() {
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        this.settings.muted ? 0 : this.settings.volume,
        this.context.currentTime,
        0.02,
      );
  }
  suspend() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    void this.context?.suspend().catch(() => {});
  }
  event(e: GameEvent, me: Player, aim: number) {
    const c = this.context;
    if (
      !c ||
      c.state !== "running" ||
      this.settings.muted ||
      this.voices.size >= 24
    )
      return;
    const personal =
      (e.kind === "hit" || e.kind === "kill") && e.target === me.id;
    const own = e.actor === me.id;
    if ((e.kind === "pickup" || e.kind === "use") && !own) return;
    const dx = e.x - me.x,
      dz = e.z - me.z,
      dist = Math.hypot(dx, e.y - me.y - 52, dz);
    const volume =
      personal || own || e.kind === "round"
        ? 1
        : Math.max(0, 1 - dist / 1050) * 0.6;
    if (volume <= 0) return;
    let freq = 200,
      end = 70,
      duration = 0.12,
      level = 0.16,
      noise = false,
      type: OscillatorType = "triangle";
    switch (e.kind) {
      case "shot":
        freq = e.weapon === "smg" ? 230 : e.weapon === "shotgun" ? 85 : 150;
        end = 45;
        duration =
          e.weapon === "shotgun" ? 0.23 : e.weapon === "smg" ? 0.07 : 0.11;
        noise = true;
        level = 0.2;
        break;
      case "reload":
        freq = e.weapon === "shotgun" ? 270 : e.weapon === "smg" ? 420 : 330;
        end = freq * 1.6;
        duration = 0.3;
        level = 0.12;
        break;
      case "switch":
        freq = e.weapon === "shotgun" ? 130 : e.weapon === "smg" ? 220 : 180;
        end = 70;
        duration = 0.08;
        break;
      case "empty":
        freq = 700;
        end = 350;
        duration = 0.04;
        level = 0.08;
        break;
      case "laser":
        freq = 1300;
        end = 160;
        duration = 0.25;
        type = "sawtooth";
        break;
      case "block":
        freq = 900;
        end = 1700;
        duration = 0.1;
        level = 0.1;
        type = "sine";
        break;
      case "hit":
        freq = personal ? 1100 : 100;
        end = personal ? 1500 : 45;
        duration = 0.08;
        level = 0.22;
        break;
      case "kill":
        freq = personal ? 700 : 130;
        end = personal ? 1400 : 25;
        duration = 0.25;
        noise = !personal;
        break;
      case "pickup":
        freq = 550;
        end = 1000;
        duration = 0.18;
        break;
      case "use":
        freq = 350;
        end = 1500;
        duration = 0.3;
        break;
      case "dash":
        freq = 500;
        end = 80;
        noise = true;
        duration = 0.2;
        break;
      case "jump":
        freq = 180;
        end = 350;
        duration = 0.12;
        level = 0.08;
        break;
      case "land":
        freq = 80;
        end = 30;
        noise = true;
        duration = 0.09;
        break;
      case "step":
        freq = 65;
        end = 30;
        noise = true;
        duration = 0.05;
        level = 0.045;
        break;
      case "round":
        freq = 440;
        end = 880;
        duration = 0.5;
        break;
    }
    const gain = c.createGain(),
      pan = c.createStereoPanner(),
      filter = c.createBiquadFilter();
    const now = c.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(level * volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    pan.pan.value =
      personal || own
        ? 0
        : Math.max(
            -1,
            Math.min(
              1,
              (-Math.sin(aim) * dx + Math.cos(aim) * dz) /
                Math.max(1, Math.hypot(dx, dz)),
            ),
          );
    gain.connect(pan);
    pan.connect(this.master!);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(noise ? 1800 : 5000, now);
    filter.frequency.exponentialRampToValueAtTime(
      noise ? 120 : 1800,
      now + duration,
    );
    filter.connect(gain);
    let source: AudioScheduledSourceNode;
    if (noise) {
      const s = c.createBufferSource();
      s.buffer = this.noise!;
      source = s;
    } else {
      const s = c.createOscillator();
      s.type = type;
      s.frequency.setValueAtTime(freq, now);
      s.frequency.exponentialRampToValueAtTime(end, now + duration);
      source = s;
    }
    source.connect(filter);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    source.start(now);
    source.stop(now + duration);
  }
  dispose() {
    this.disposed = true;
    this.suspend();
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}
