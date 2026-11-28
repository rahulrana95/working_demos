/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the reconnecting connection, with a fake clock and a fake socket.
 */
import { backoffDelay, HEARTBEAT_MS, openReliableConnection } from "./connection";
import { createFakeDeps, serverMessage } from "./testUtils";
import type { ServerFrame } from "./types";

function setup() {
  const { deps, connections } = createFakeDeps();
  const frames: ServerFrame[] = [];
  const statuses: boolean[] = [];
  const stop = openReliableConnection(
    deps.connect,
    (frame) => frames.push(frame),
    (isOpen) => statuses.push(isOpen),
  );
  return { connections, frames, statuses, stop };
}

describe("backoffDelay", () => {
  it.each([
    [0, 500, 1_000],
    [1, 1_000, 2_000],
    [2, 2_000, 4_000],
    [3, 4_000, 8_000],
    [4, 8_000, 16_000],
  ])("doubles the wait: attempt %i waits from %i to %i ms", (attempt, shortest, longest) => {
    expect(backoffDelay(attempt, 0)).toBe(shortest);
    expect(backoffDelay(attempt, 1)).toBe(longest);
  });

  it("never waits longer than 30 seconds, also after 1,000 failed tries", () => {
    expect(backoffDelay(5, 1)).toBe(30_000);
    expect(backoffDelay(1_000, 1)).toBe(30_000);
    expect(backoffDelay(1_000, 0)).toBe(15_000);
  });

  it("spreads the clients: a different random number gives a different wait", () => {
    expect(backoffDelay(3, 0.25)).toBe(5_000);
    expect(backoffDelay(3, 0.75)).toBe(7_000);
  });
});

describe("openReliableConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The longest wait of every step, so the tests know the exact time.
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens one connection and reports when it is open", () => {
    const { connections, statuses } = setup();

    expect(connections).toHaveLength(1);
    expect(statuses).toEqual([]);

    connections[0].open();
    expect(statuses).toEqual([true]);
  });

  it("passes the frames of the server on, but keeps pong for itself", () => {
    const { connections, frames } = setup();
    connections[0].open();
    const frame: ServerFrame = { type: "message", message: serverMessage("1") };

    connections[0].push(frame);
    connections[0].push({ type: "pong" });

    expect(frames).toEqual([frame]);
  });

  it("reports a lost connection and opens a new one after the wait", () => {
    const { connections, statuses } = setup();
    connections[0].open();

    connections[0].drop();
    expect(statuses).toEqual([true, false]);
    expect(connections[0].isClosed).toBe(true);

    vi.advanceTimersByTime(999);
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(2);

    connections[1].open();
    expect(statuses).toEqual([true, false, true]);
  });

  it("waits longer after every failed try: 1, 2, 4, 8, 16, 30 and 30 seconds", () => {
    const { connections } = setup();
    const waits: number[] = [];

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const before = Date.now();
      connections[connections.length - 1].drop();
      const count = connections.length;
      while (connections.length === count) {
        vi.advanceTimersByTime(500);
      }
      waits.push(Date.now() - before);
    }

    expect(waits).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });

  it("does not shorten the wait for a server that opens the connection and closes it at once", () => {
    const { connections } = setup();

    connections[0].open();
    connections[0].drop();
    vi.advanceTimersByTime(1_000);
    connections[1].open();
    connections[1].drop();

    vi.advanceTimersByTime(1_999);
    expect(connections).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(3);
  });

  it("starts with a short wait again after a connection that really worked", () => {
    const { connections } = setup();
    connections[0].drop();
    vi.advanceTimersByTime(1_000);
    connections[1].drop();
    vi.advanceTimersByTime(2_000);

    connections[2].open();
    connections[2].push({ type: "pong" });
    connections[2].drop();

    vi.advanceTimersByTime(1_000);
    expect(connections).toHaveLength(4);
  });

  it("sends a ping on every heartbeat while the server answers", () => {
    const { connections, statuses } = setup();
    connections[0].open();

    for (let beat = 1; beat <= 4; beat += 1) {
      vi.advanceTimersByTime(HEARTBEAT_MS);
      expect(connections[0].pings).toBe(beat);
      connections[0].push({ type: "pong" });
    }

    expect(statuses).toEqual([true]);
    expect(connections).toHaveLength(1);
  });

  it("counts any frame as a sign of life, not only pong", () => {
    const { connections, statuses } = setup();
    connections[0].open();

    vi.advanceTimersByTime(HEARTBEAT_MS);
    connections[0].push({ type: "message", message: serverMessage("1") });
    vi.advanceTimersByTime(HEARTBEAT_MS);

    expect(statuses).toEqual([true]);
  });

  it("gives up a connection that says nothing between two heartbeats, and opens a new one", () => {
    const { connections, statuses } = setup();
    connections[0].open();

    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(connections[0].isClosed).toBe(false);
    vi.advanceTimersByTime(HEARTBEAT_MS);

    expect(connections[0].isClosed).toBe(true);
    expect(statuses).toEqual([true, false]);

    vi.advanceTimersByTime(1_000);
    expect(connections).toHaveLength(2);
  });

  it("gives up a connection that never opens", () => {
    const { connections, statuses } = setup();

    vi.advanceTimersByTime(2 * HEARTBEAT_MS);

    expect(connections[0].isClosed).toBe(true);
    expect(statuses).toEqual([false]);
  });

  it("sends no ping on a connection it gave up", () => {
    const { connections } = setup();
    connections[0].open();
    connections[0].drop();

    vi.advanceTimersByTime(900);
    expect(connections[0].pings).toBe(0);
    vi.advanceTimersByTime(HEARTBEAT_MS + 100);
    expect(connections[0].pings).toBe(0);
    expect(connections[1].pings).toBe(1);
  });

  it("closes the connection and leaves no timer behind when it is stopped", () => {
    const { connections, stop } = setup();
    connections[0].open();

    stop();

    expect(connections[0].isClosed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reconnect when it is stopped while it waits for the next try", () => {
    const { connections, stop } = setup();
    connections[0].drop();

    stop();
    vi.advanceTimersByTime(60_000);

    expect(connections).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
