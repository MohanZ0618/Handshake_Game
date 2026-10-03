import { it, expect, vi } from "vitest";
import { RoomSession } from "../server/session";
import { idleInput } from "../shared/game";
it("limits input bursts and accepts fresh actions after the next rate window", () => {
  vi.useFakeTimers();
  try {
    const session = new RoomSession("ABC123"),
      peer = { send: vi.fn(), close: vi.fn() };
    session.receive(
      peer,
      JSON.stringify({ type: "join", protocol: 3, name: "Alpha", team: 0 }),
    );
    for (let seq = 1; seq <= 121; seq++)
      session.receive(
        peer,
        JSON.stringify({
          type: "input",
          input: { ...idleInput(), seq, dash: seq === 121 ? 1 : 0 },
        }),
      );
    session.tick();
    const p = session.game.players.find((p) => !p.bot)!;
    expect(p.ack).toBe(120);
    expect(p.dashReadyAt).toBe(0);
    vi.advanceTimersByTime(1001);
    session.receive(
      peer,
      JSON.stringify({
        type: "input",
        input: { ...idleInput(), seq: 122, dash: 1 },
      }),
    );
    session.tick();
    expect(p.ack).toBe(122);
    expect(p.dashReadyAt).toBeGreaterThan(session.game.now);
  } finally {
    vi.useRealTimers();
  }
});
it("broadcasts rematch reset to both peers and ignores requests during play", () => {
  const session = new RoomSession("ABC123"),
    a = { send: vi.fn(), close: vi.fn() },
    b = { send: vi.fn(), close: vi.fn() };
  for (const [peer, team] of [
    [a, 0],
    [b, 1],
  ] as const)
    session.receive(
      peer,
      JSON.stringify({
        type: "join",
        protocol: 3,
        name: `Player${team}`,
        team,
      }),
    );
  session.game.scores = [3, 2, 1, 0];
  session.receive(a, JSON.stringify({ type: "rematch" }));
  expect(session.game.scores).toEqual([3, 2, 1, 0]);
  session.game.phase = "finished";
  session.game.round = 3;
  session.game.players[0].storedPower = "laser";
  session.game.players[0].dashReadyAt = 1e9;
  session.receive(a, JSON.stringify({ type: "rematch" }));
  const first = JSON.parse(a.send.mock.calls.at(-1)![0]),
    second = JSON.parse(b.send.mock.calls.at(-1)![0]);
  expect(first).toEqual(second);
  expect(first.state.phase).toBe("playing");
  expect(first.state.round).toBe(1);
  expect(first.state.scores).toEqual([0, 0, 0, 0]);
  expect(
    first.state.players.filter((p: { bot: boolean }) => !p.bot),
  ).toHaveLength(2);
  expect(first.state.players[0].storedPower).toBeNull();
  expect(first.state.players[0].dashReadyAt).toBe(0);
});
it("rejects an old client protocol before allocating a slot", () => {
  const session = new RoomSession("ABC123"),
    peer = { send: vi.fn(), close: vi.fn() };
  session.receive(peer, JSON.stringify({ type: "join", name: "Old", team: 0 }));
  expect(session.game.humans).toBe(0);
  expect(JSON.parse(peer.send.mock.calls[0][0]).message).toContain("Refresh");
});
it("replaces a silently disconnected human after fifteen seconds", () => {
  vi.useFakeTimers();
  try {
    const session = new RoomSession("ABC123"),
      peer = { send: vi.fn(), close: vi.fn() };
    session.receive(
      peer,
      JSON.stringify({ type: "join", protocol: 3, name: "Alpha", team: 0 }),
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
    JSON.stringify({ type: "join", protocol: 3, name: "Alpha", team: 0 }),
  );
  session.game.now = 2000;
  session.receive(
    peer,
    JSON.stringify({
      type: "input",
      input: {
        ...idleInput(),
        seq: 1,
        x: 0,
        z: 0,
        aim: 0,
        pitch: 0,
        fire: true,
        jump: 0,
        dash: 0,
        use: 0,
        swap: 0,
      },
    }),
  );
  session.receive(
    peer,
    JSON.stringify({
      type: "input",
      input: {
        ...idleInput(),
        seq: 2,
        x: 0,
        z: 0,
        aim: 0,
        pitch: 0,
        fire: false,
        jump: 0,
        dash: 0,
        use: 0,
        swap: 0,
      },
    }),
  );
  session.tick();
  expect(
    session.game.bullets.some((b) => b.owner === session.game.players[0].id),
  ).toBe(true);
});
