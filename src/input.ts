import { idleInput, type Input } from "../shared/game";
export function movementAxes(aim: number, forward: number, right: number) {
  const length = Math.max(1, Math.hypot(forward, right));
  return {
    x: (Math.cos(aim) * forward - Math.sin(aim) * right) / length,
    z: (Math.sin(aim) * forward + Math.cos(aim) * right) / length,
  };
}
export class Controls {
  aim = 0;
  pitch = 0;
  sensitivity = 1;
  locked = false;
  private dragMode = false;
  private dragging = false;
  private keys = new Set<string>();
  private fire = false;
  private ads = false;
  private pressed = false;
  private seq = 0;
  private actions = { jump: 0, dash: 0, use: 0, swap: 0, reload: 0 };
  weapon: Input["weapon"] = "rifle";
  private sentActions = { jump: 0, dash: 0, use: 0, swap: 0, reload: 0 };
  private abort = new AbortController();
  private disposed = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private onLock: (locked: boolean) => void,
  ) {
    const signal = this.abort.signal;
    document.addEventListener(
      "pointerlockchange",
      () => {
        this.locked = document.pointerLockElement === canvas || this.dragMode;
        if (!this.locked) this.clear();
        this.onLock(this.locked);
      },
      { signal },
    );
    document.addEventListener(
      "mousemove",
      (e) => {
        if (!this.locked || (this.dragMode && !this.dragging)) return;
        const zoom = this.ads ? (this.weapon === "sniper" ? 4 : this.weapon === "rifle" ? 2 : 1) : 1;
        this.aim =
          ((this.aim + e.movementX * 0.002 * this.sensitivity / zoom + Math.PI * 3) %
            (Math.PI * 2)) -
          Math.PI;
        this.pitch = Math.max(
          -1.48,
          Math.min(1.48, this.pitch - e.movementY * 0.002 * this.sensitivity / zoom),
        );
      },
      { signal },
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "Escape" && this.dragMode) {
          this.release();
          return;
        }
        if (!this.locked) return;
        if (
          [
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
            "Space",
            "ShiftLeft",
            "ShiftRight",
            "KeyE",
            "KeyF",
            "KeyR",
            "KeyZ",
            "Digit1",
            "Digit2",
            "Digit3",
            "Digit4",
          ].includes(e.code)
        )
          e.preventDefault();
        this.keys.add(e.code);
        if (e.repeat) return;
        if (e.code === "Space") this.actions.jump++;
        if (e.code === "ShiftLeft" || e.code === "ShiftRight")
          this.actions.dash++;
        if (e.code === "KeyE") this.actions.use++;
        if (e.code === "KeyF") this.actions.swap++;
        if (e.code === "KeyR") this.actions.reload++;
        if (e.code === "Digit1") this.weapon = "rifle";
        if (e.code === "Digit2") this.weapon = "smg";
        if (e.code === "Digit3") this.weapon = "shotgun";
        if (e.code === "Digit4") this.weapon = "sniper";
      },
      { signal },
    );
    document.addEventListener("keyup", (e) => this.keys.delete(e.code), {
      signal,
    });
    canvas.addEventListener(
      "mousedown",
      (e) => {
        if (this.locked && e.button === 2) {
          this.ads = true;
          if (this.dragMode) this.dragging = true;
        }
        if (this.locked && e.button === 0) {
          this.fire = true;
          this.pressed = true;
        }
      },
      { signal },
    );
    document.addEventListener(
      "mouseup",
      (e) => {
        if (e.button === 0) this.fire = false;
        if (e.button === 2) {
          this.dragging = false;
          this.ads = false;
        }
      },
      { signal },
    );
    window.addEventListener("blur", () => this.release(), { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.release();
      },
      { signal },
    );
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), {
      signal,
    });
  }
  current(): Input {
    const forward =
        Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
      right = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    const axes = movementAxes(this.aim, forward, right);
    return {
      ...idleInput(),
      ...this.actions,
      weapon: this.weapon,
      seq: this.seq,
      x: this.locked ? axes.x : 0,
      z: this.locked ? axes.z : 0,
      aim: this.aim,
      pitch: this.pitch,
      fire: this.locked && (this.fire || this.pressed),
      ads: this.locked && this.ads,
      charge: this.locked && this.keys.has("KeyZ"),
    };
  }
  sample() {
    this.seq++;
    const i = this.current();
    this.sentActions = { ...this.actions };
    this.pressed = false;
    return i;
  }
  clear() {
    this.keys.clear();
    this.fire = false;
    this.ads = false;
    this.pressed = false;
    this.dragging = false;
    this.actions = { ...this.sentActions };
  }
  async lock() {
    this.dragMode = false;
    await this.canvas.requestPointerLock();
    if (this.disposed && document.pointerLockElement === this.canvas)
      document.exitPointerLock();
  }
  useDragLook() {
    this.dragMode = true;
    this.locked = true;
    this.canvas.focus();
    this.onLock(true);
  }
  release() {
    this.clear();
    this.dragMode = false;
    this.locked = false;
    this.onLock(false);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  dispose() {
    this.disposed = true;
    this.release();
    this.abort.abort();
  }
}
