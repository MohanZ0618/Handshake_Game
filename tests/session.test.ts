import { it, expect, vi } from "vitest";
import { RoomSession } from "../server/session";
it("replaces a silently disconnected human after fifteen seconds", () => {
  vi.useFakeTimers();
  try {
    const session = new RoomSession("ABC123"),
      peer = { send: vi.fn(), close: vi.fn() };
    session.receive(
      peer,
      JSON.stringify({ type: "join", name: "Alpha", team: 0 }),
    );
    expect(session.game.humans).toBe(1);
    vi.advanceTimersByTime(15001);
    session.tick();
    expect(session.game.humans).toBe(0);
    expect(session.game.players.filter((p) => p.bot)).toHaveLength(8);
    expect(peer.close).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
it("preserves a short click between simulation ticks", () => {
  const session = new RoomSession("ABC123"),
    peer = { send: vi.fn(), close: vi.fn() };
  session.receive(
    peer,
    JSON.stringify({ type: "join", name: "Alpha", team: 0 }),
  );
  session.game.now = 2000;
  session.receive(
    peer,
    JSON.stringify({
      type: "input",
      input: { x: 0, y: 0, aim: 0, fire: true },
    }),
  );
  session.receive(
    peer,
    JSON.stringify({
      type: "input",
      input: { x: 0, y: 0, aim: 0, fire: false },
    }),
  );
  session.tick();
  expect(session.game.bullets.some((b) => !b.bot)).toBe(true);
});
