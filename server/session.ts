import {
  Game,
  PROTOCOL,
  validInput,
  type ClientMessage,
  type ServerMessage,
} from "../shared/game";
export interface Peer {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
export class RoomSession {
  game = new Game();
  peers = new Map<Peer, string>();
  private inputRates = new Map<Peer, { start: number; count: number }>();
  private lastSeen = new Map<Peer, number>();
  constructor(
    readonly code: string,
    private changed: () => void = () => {},
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
          throw new Error(
            "Game updated. Refresh this page to join (protocol 3 required).",
          );
        if (this.peers.has(peer)) throw new Error("Already joined.");
        const id = crypto.randomUUID();
        this.game.addHuman(id, m.name, m.team);
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
        return;
      }
      const id = this.peers.get(peer);
      if (!id) throw new Error("Join a team first.");
      if (m.type === "input") {
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
        this.game.rematch();
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
  leave(peer: Peer) {
    const id = this.peers.get(peer);
    if (!id) return;
    this.peers.delete(peer);
    this.inputRates.delete(peer);
    this.lastSeen.delete(peer);
    this.game.removeHuman(id);
    this.changed();
    this.broadcast();
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
    if (phase !== this.game.phase) this.changed();
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
