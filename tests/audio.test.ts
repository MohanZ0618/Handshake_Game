import { afterEach, expect, it, vi } from "vitest";
import { Game, type GameEvent } from "../shared/game";
import { loadSettings, saveSettings, Sound } from "../src/audio";

const parameter = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const gainNode = () => ({ ...node(), gain: parameter() });
const pannerNode = () => ({ ...node(), pan: parameter() });
const sourceNode = () => ({
  ...node(),
  frequency: parameter(),
  type: "",
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as null | (() => void),
});
class FakeContext {
  static instances: FakeContext[] = [];
  state = "suspended";
  currentTime = 0;
  sampleRate = 8;
  destination = node();
  sources: ReturnType<typeof sourceNode>[] = [];
  gains: ReturnType<typeof gainNode>[] = [];
  panners: ReturnType<typeof pannerNode>[] = [];
  constructor() {
    FakeContext.instances.push(this);
  }
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createGain() {
    const n = gainNode();
    this.gains.push(n);
    return n;
  }
  createStereoPanner() {
    const n = pannerNode();
    this.panners.push(n);
    return n;
  }
  createBiquadFilter() {
    return { ...node(), frequency: parameter(), type: "" };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(8) };
  }
  createOscillator() {
    const n = sourceNode();
    this.sources.push(n);
    return n;
  }
  createBufferSource() {
    return { ...this.createOscillator(), buffer: undefined };
  }
}
const me = new Game().players[0];
const event = (patch: Partial<GameEvent> = {}): GameEvent => ({
  id: 1,
  time: 0,
  kind: "laser",
  actor: "enemy",
  team: 1,
  x: me.x,
  y: 52,
  z: me.z + 100,
  ...patch,
});
function sound() {
  vi.stubGlobal("AudioContext", FakeContext);
  return new Sound({
    volume: 0.5,
    muted: false,
    sensitivity: 1,
    shake: true,
    quality: "low",
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  FakeContext.instances = [];
});

it("starts only after interaction, caps voices and frees ended sounds", async () => {
  const s = sound();
  s.event(event(), me, 0);
  expect(FakeContext.instances).toHaveLength(0);
  expect(await s.unlock()).toBe(true);
  const c = FakeContext.instances[0];
  for (let i = 0; i < 30; i++) s.event(event(), me, 0);
  expect(c.sources).toHaveLength(24);
  c.sources[0].onended?.();
  expect(c.sources[0].disconnect).toHaveBeenCalled();
  s.event(event(), me, 0);
  expect(c.sources).toHaveLength(25);
  s.dispose();
  expect(c.close).toHaveBeenCalledOnce();
  expect(await s.unlock()).toBe(false);
});
it("mutes output, suspends voices in the background and resumes without replay", async () => {
  const s = sound();
  await s.unlock();
  const c = FakeContext.instances[0];
  s.event(event(), me, 0);
  s.settings.muted = true;
  s.update();
  s.event(event(), me, 0);
  expect(c.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.02);
  expect(c.sources).toHaveLength(1);
  s.suspend();
  expect(c.sources[0].stop).toHaveBeenCalledWith();
  expect(c.suspend).toHaveBeenCalledOnce();
  s.settings.muted = false;
  s.event(event(), me, 0);
  expect(c.sources).toHaveLength(1);
  await s.unlock();
  expect(c.sources).toHaveLength(1);
  s.event(event(), me, 0);
  expect(c.sources).toHaveLength(2);
  s.dispose();
});
it("attenuates distant world sounds and pans them, while centering own feedback", async () => {
  const s = sound();
  await s.unlock();
  const c = FakeContext.instances[0];
  s.event(event({ x: me.x + 2000 }), me, 0);
  expect(c.sources).toHaveLength(0);
  s.event(event(), me, 0);
  expect(c.panners[0].pan.value).toBe(1);
  s.event(event({ kind: "hit", target: me.id, x: me.x + 2000 }), me, 0);
  expect(c.panners[1].pan.value).toBe(0);
  expect(c.sources).toHaveLength(2);
  s.dispose();
});
it("tolerates unavailable audio and disabled or malformed settings storage", async () => {
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        throw new Error("Unavailable");
      }
    },
  );
  const s = new Sound(loadSettings());
  expect(await s.unlock()).toBe(false);
  expect(() => s.event(event(), me, 0)).not.toThrow();
  s.dispose();
  vi.stubGlobal("localStorage", {
    getItem: () => "invalid",
    setItem: () => {
      throw new Error("Disabled");
    },
  });
  expect(loadSettings()).toEqual({
    volume: 0.5,
    muted: false,
    sensitivity: 1,
    shake: true,
    quality: "high",
  });
  expect(() => saveSettings(loadSettings())).not.toThrow();
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({ volume: 8, sensitivity: -1, shake: false, muted: true }),
  });
  expect(loadSettings()).toEqual({
    volume: 1,
    sensitivity: 0.2,
    shake: false,
    quality: "high",
    muted: true,
  });
});
