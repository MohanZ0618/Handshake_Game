import type { GameEvent, Snapshot } from "../shared/game";
export class EventCursor {
  private last: number | null = null;
  reset() {
    this.last = null;
  }
  read(s: Snapshot, active = true): GameEvent[] {
    const newest = s.events.reduce((n, e) => Math.max(n, e.id), this.last ?? 0);
    if (this.last === null || !active) {
      this.last = newest;
      return [];
    }
    const out = s.events.filter(
      (e) => e.id > this.last! && s.now - e.time <= 350,
    );
    this.last = newest;
    return out;
  }
}
