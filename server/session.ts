import {
  Game,
  PROTOCOL,
  validInput,
  type ClientMessage,
  type ServerMessage,
  type MatchResult,
  type MatchProgress,
} from "../shared/game";
import type { CareerProfile } from "../shared/career";
export interface Peer {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
export class RoomSession {
  game = new Game();
  peers = new Map<Peer, string>();
  private inputRates = new Map<Peer, { start: number; count: number }>();
  private lastSeen = new Map<Peer, number>();
  private pending = new Set<Peer>();
  private progressWrites = new Set<Promise<unknown>>();
  private matchId = crypto.randomUUID();
  constructor(
    readonly code: string,
    private changed: () => void = () => {},
    private resolveCareer: (
      token: string,
    ) => Promise<CareerProfile | undefined> = async () => undefined,
    private onSettle: (result: MatchResult) => void = () => {},
    private onProgress: (progress: MatchProgress) => Promise<unknown> | void = () => {},
  ) {}
  send(peer: Peer, message: ServerMessage) {
    try {
      peer.send(JSON.stringify(message));
    } catch {
      this.leave(peer);
    }
  }
  receive(peer: Peer, raw: string) {
    try {
      if (raw.length > 1024) throw new Error("Message too large.");
      const m = JSON.parse(raw) as ClientMessage;
      if (!m || typeof m !== "object") throw new Error("Invalid message.");
      if (m.type === "join") {
        if (m.protocol !== PROTOCOL)
          throw new Error("Game updated. Refresh this page to join.");
        if (this.peers.has(peer) || this.pending.has(peer))
          throw new Error("Already joined.");
        if (m.token) {
          this.pending.add(peer);
          void this.resolveCareer(m.token)
            .then((profile) => {
              if (!this.pending.has(peer)) return;
              this.pending.delete(peer);
              if (!profile) {
                this.send(peer, {
                  type: "error",
                  message: "Career session expired. Reload the lobby.",
                });
                return;
              }
              if (profile.name.toLowerCase() !== m.name.trim().toLowerCase()) {
                this.send(peer, { type: "error", message: "Choose the callsign saved with this career." });
                return;
              }
              this.join(peer, m.name, m.team, profile);
            })
            .catch(() => {
              this.pending.delete(peer);
              this.send(peer, {
                type: "error",
                message: "Unable to verify career profile.",
              });
            });
          return;
        }
        this.join(peer, m.name, m.team);
        return;
      }
      const id = this.peers.get(peer);
      if (!id) throw new Error("Join a team first.");
      if (m.type === "leave") {
        void this.leave(peer)
          .then((saved) => this.send(peer, saved
            ? { type: "left" }
            : { type: "error", message: "Unable to save career progress." }))
          .catch(() => this.send(peer, { type: "error", message: "Unable to save career progress." }));
      } else if (m.type === "input") {
        if (!validInput(m.input)) throw new Error("Invalid player input.");
        const now = Date.now();
        let rate = this.inputRates.get(peer);
        if (!rate || now - rate.start >= 1000) {
          rate = { start: now, count: 0 };
          this.inputRates.set(peer, rate);
        }
        if (++rate.count > 120) return;
        this.lastSeen.set(peer, now);
        this.game.setInput(id, m.input);
      } else if (m.type === "rematch") {
        const finished = this.game.phase === "finished";
        this.game.rematch();
        if (finished) this.matchId = crypto.randomUUID();
        this.changed();
        this.broadcast();
      } else throw new Error("Unknown message.");
    } catch (e) {
      this.send(peer, {
        type: "error",
        message: e instanceof Error ? e.message : "Invalid request.",
      });
    }
  }
  private join(
    peer: Peer,
    name: string,
    team: number,
    profile?: CareerProfile,
  ) {
    try {
      const id = crypto.randomUUID();
      this.game.addHuman(id, name, team, profile?.id, profile?.equipped);
      this.peers.set(peer, id);
      this.lastSeen.set(peer, Date.now());
      this.send(peer, {
        type: "welcome",
        id,
        code: this.code,
        protocol: PROTOCOL,
        arena: this.game.arena,
      });
      this.broadcast();
      this.changed();
    } catch (e) {
      this.send(peer, {
        type: "error",
        message: e instanceof Error ? e.message : "Invalid request.",
      });
    }
  }
  async leave(peer: Peer) {
    this.pending.delete(peer);
    const id = this.peers.get(peer);
    if (!id) return;
    this.peers.delete(peer);
    this.inputRates.delete(peer);
    this.lastSeen.delete(peer);
    this.flushProgress();
    this.game.removeHuman(id);
    this.changed();
    this.broadcast();
    const writes = await Promise.allSettled([...this.progressWrites]);
    return writes.every((write) => write.status === "fulfilled");
  }
  tick() {
    for (const [peer, at] of this.lastSeen) {
      if (Date.now() - at > 15_000) {
        this.leave(peer);
        peer.close(4000, "Connection timed out.");
      }
    }
    const phase = this.game.phase;
    this.game.tick(50);
    this.flushProgress();
    if (phase !== this.game.phase) {
      if (this.game.phase === "finished")
        this.onSettle(this.game.matchResult(this.matchId));
      this.changed();
    }
  }
  private flushProgress() {
    for (const update of this.game.drainCareerProgress(this.matchId)) {
      const write = Promise.resolve(this.onProgress(update));
      this.progressWrites.add(write);
      void write.then(
        () => this.progressWrites.delete(write),
        () => this.progressWrites.delete(write),
      );
    }
  }
  broadcast() {
    const data = JSON.stringify({ type: "state", state: this.game.snapshot() });
    for (const peer of this.peers.keys()) {
      try {
        peer.send(data);
      } catch {
        this.leave(peer);
      }
    }
  }
}
