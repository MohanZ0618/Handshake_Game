import { afterEach, it, expect, vi } from "vitest";
import { Controls } from "../src/input";
import { validInput } from "../shared/game";
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null as unknown,
    exitPointerLock: vi.fn(),
  });
  const win = new EventTarget();
  const canvas = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    requestPointerLock: vi.fn(async () => {}),
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  const onLock = vi.fn(),
    controls = new Controls(canvas as unknown as HTMLCanvasElement, onLock);
  controls.useDragLook();
  const send = (
    target: EventTarget,
    type: string,
    props: Record<string, unknown> = {},
  ) =>
    target.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), props),
    );
  return { doc, win, canvas, controls, onLock, send };
}
it("sends a short click once even when released before the input tick", () => {
  const { controls, canvas, doc, send } = setup();
  send(canvas, "mousedown", { button: 0 });
  send(doc, "mouseup", { button: 0 });
  expect(controls.sample().fire).toBe(true);
  expect(controls.sample().fire).toBe(false);
  controls.dispose();
});
it("ignores key repeat and cancels unsent actions when the menu opens", () => {
  const { controls, doc, send } = setup();
  send(doc, "keydown", { code: "Space", repeat: false });
  send(doc, "keydown", { code: "Space", repeat: true });
  expect(controls.current().jump).toBe(1);
  controls.release();
  expect(controls.sample().jump).toBe(0);
  expect(controls.current().x).toBe(0);
  controls.useDragLook();
  send(doc, "keydown", { code: "ShiftLeft", repeat: false });
  expect(controls.sample().dash).toBe(1);
  controls.clear();
  expect(controls.sample().dash).toBe(1);
  controls.dispose();
});
it("keeps diagonal movement valid while looking in any direction", () => {
  const { controls, doc, send } = setup();
  send(doc, "keydown", { code: "KeyW", repeat: false });
  send(doc, "keydown", { code: "KeyD", repeat: false });
  for (let aim = -Math.PI; aim < Math.PI; aim += 0.2) {
    controls.aim = aim;
    const i = controls.sample();
    expect(validInput(i)).toBe(true);
    expect(Math.hypot(i.x, i.z)).toBeCloseTo(1);
  }
  controls.dispose();
});
it("releases controls on blur and aborts listeners when disposed", () => {
  const { controls, doc, win, send } = setup();
  send(doc, "keydown", { code: "KeyW", repeat: false });
  expect(controls.current().x).toBe(1);
  send(win, "blur");
  expect(controls.locked).toBe(false);
  expect(controls.current().x).toBe(0);
  controls.dispose();
  send(doc, "keydown", { code: "KeyE", repeat: false });
  expect(controls.current().use).toBe(0);
});
it("only changes the fallback view while the right mouse button is held", () => {
  const { controls, canvas, doc, send } = setup();
  send(doc, "mousemove", { movementX: 100, movementY: 100 });
  expect(controls.aim).toBe(0);
  send(canvas, "mousedown", { button: 2 });
  send(doc, "mousemove", { movementX: 100, movementY: 100 });
  expect(controls.aim).toBeCloseTo(0.1);
  expect(controls.pitch).toBeCloseTo(-0.1);
  expect(controls.current().ads).toBe(true);
  send(doc, "mouseup", { button: 2 });
  send(doc, "mousemove", { movementX: 100, movementY: 100 });
  expect(controls.aim).toBeCloseTo(0.1);
  expect(controls.current().ads).toBe(false);
  controls.dispose();
});
it("selects all four weapons and deduplicates held reload keys", () => {
  const { controls, doc, send } = setup();
  for (const [code, weapon] of [
    ["Digit2", "smg"],
    ["Digit3", "shotgun"],
    ["Digit1", "rifle"],
    ["Digit4", "sniper"],
  ]) {
    send(doc, "keydown", { code, repeat: false });
    expect(controls.sample().weapon).toBe(weapon);
  }
  send(doc, "keydown", { code: "KeyR", repeat: false });
  send(doc, "keydown", { code: "KeyR", repeat: true });
  expect(controls.sample().reload).toBe(1);
  controls.dispose();
});
