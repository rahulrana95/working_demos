/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the shared, reconnecting connection, with a fake clock, a fake
 * socket and a fake long-polling function.
 */
import {
  backoffDelay,
  createChatSocket,
  HEARTBEAT_MS,
  POLL_AFTER_FAILED_TRIES,
  SOCKET_RETRY_WHILE_POLLING_MS,
} from "./socket";
import { createFakeTransport, serverMessage } from "./testUtils";
import type { ChatEvent, ServerFrame } from "./types";

function setup({ withPoll = false } = {}) {
  const transport = createFakeTransport();
  const frames: ServerFrame[] = [];
  const statuses: boolean[] = [];
  const events: ChatEvent[] = [];
  const socket = createChatSocket({
    connect: transport.connect,
    poll: withPoll ? transport.poll : undefined,
    onEvent: (event) => events.push(event),
  });
  const unsubscribe = socket.subscribe({
    onFrame: (frame) => frames.push(frame),
    onStatus: (isOpen) => statuses.push(isOpen),
  });
  const last = () => transport.connections[transport.connections.length - 1];
  return { ...transport, socket, frames, statuses, events, unsubscribe, last };
}

const aMessage: ServerFrame = { type: "message", message: serverMessage("1") };

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

  it("spreads the clients: a different random number gives a different wait", () => {
    expect(backoffDelay(3, 0.25)).toBe(5_000);
    expect(backoffDelay(3, 0.75)).toBe(7_000);
  });

  it("never waits longer than 30 seconds, also after 1,000 failed tries", () => {
    expect(backoffDelay(5, 1)).toBe(30_000);
    expect(backoffDelay(1_000, 1)).toBe(30_000);
    expect(backoffDelay(1_000, 0)).toBe(15_000);
  });
});

describe("createChatSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The longest wait of every step, so the tests know the exact time.
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens one connection and tells every listener when it is open", () => {
    const { connections, socket, statuses } = setup();
    const second: boolean[] = [];
    socket.subscribe({ onStatus: (isOpen) => second.push(isOpen) });

    expect(connections).toHaveLength(1);
    expect(socket.isOpen()).toBe(false);

    connections[0].open();
    expect(socket.isOpen()).toBe(true);
    expect(statuses).toEqual([true]);
    expect(second).toEqual([true]);
  });

  it("gives every frame of the server to every listener, but keeps pong for itself", () => {
    const { connections, socket, frames } = setup();
    const second: ServerFrame[] = [];
    socket.subscribe({ onFrame: (frame) => second.push(frame) });
    connections[0].open();

    connections[0].push(aMessage);
    connections[0].push({ type: "pong" });

    expect(frames).toEqual([aMessage]);
    expect(second).toEqual([aMessage]);
  });

  it("calls a listener no more after it is removed, also when it removes itself in a call", () => {
    const { connections, socket, frames, unsubscribe } = setup();
    const once: ServerFrame[] = [];
    const removeOnce = socket.subscribe({
      onFrame: (frame) => {
        once.push(frame);
        removeOnce();
      },
    });
    connections[0].open();

    connections[0].push(aMessage);
    unsubscribe();
    connections[0].push(aMessage);

    expect(once).toHaveLength(1);
    expect(frames).toHaveLength(1);
  });

  it("sends a frame on an open connection and drops it on a closed one", () => {
    const { connections, socket } = setup();

    socket.send({ type: "typing", conversationId: "c1" });
    expect(connections[0].sent).toEqual([]);

    connections[0].open();
    socket.send({ type: "typing", conversationId: "c1" });
    expect(connections[0].sent).toEqual([{ type: "typing", conversationId: "c1" }]);
  });

  it("reports a lost connection and opens a new one after the wait", () => {
    const { connections, socket, statuses } = setup();
    connections[0].open();

    connections[0].drop();
    expect(statuses).toEqual([true, false]);
    expect(socket.isOpen()).toBe(false);
    expect(connections[0].isClosed).toBe(true);

    vi.advanceTimersByTime(999);
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(2);

    connections[1].open();
    expect(statuses).toEqual([true, false, true]);
  });

  it("waits longer after every failed try: 1, 2, 4, 8, 16, 30 and 30 seconds", () => {
    const { connections, last } = setup();
    const waits: number[] = [];

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const before = Date.now();
      last().drop();
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
      expect(connections[0].sent).toHaveLength(beat);
      connections[0].push({ type: "pong" });
    }

    expect(connections[0].sent[0]).toEqual({ type: "ping" });
    expect(statuses).toEqual([true]);
    expect(connections).toHaveLength(1);
  });

  it("counts any frame as a sign of life, not only pong", () => {
    const { connections, statuses } = setup();
    connections[0].open();

    vi.advanceTimersByTime(HEARTBEAT_MS);
    connections[0].push(aMessage);
    vi.advanceTimersByTime(HEARTBEAT_MS);

    expect(statuses).toEqual([true]);
  });

  it("sends no ping on a connection it gave up", () => {
    const { connections } = setup();
    connections[0].open();
    connections[0].drop();

    vi.advanceTimersByTime(HEARTBEAT_MS + 1_000);

    expect(connections[0].sent).toEqual([]);
    expect(connections[1].sent).toEqual([{ type: "ping" }]);
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

  it("tries at once when the browser says the network is back, and drops the timer of the wait", () => {
    const { connections } = setup();
    connections[0].drop();
    vi.advanceTimersByTime(1_000);
    connections[1].drop();
    // The next try would come after 2 seconds.

    window.dispatchEvent(new Event("online"));
    expect(connections).toHaveLength(3);

    vi.advanceTimersByTime(2_000);
    expect(connections).toHaveLength(3);
  });

  it("does not open a second connection for the network event while one is open or opening", () => {
    const { connections } = setup();

    window.dispatchEvent(new Event("online"));
    connections[0].open();
    window.dispatchEvent(new Event("online"));

    expect(connections).toHaveLength(1);
  });

  it("reports a reconnect with the number of tries it took, and nothing for the first connection", () => {
    const { connections, events } = setup();
    connections[0].open();
    expect(events).toEqual([]);

    connections[0].drop();
    vi.advanceTimersByTime(1_000);
    connections[1].drop();
    vi.advanceTimersByTime(2_000);
    connections[2].open();

    expect(events).toEqual([{ type: "reconnect", attempt: 2, transport: "socket" }]);
  });

  it("closes the connection and leaves no timer and no listener behind when it is closed", () => {
    const { connections, socket, statuses } = setup();
    connections[0].open();

    socket.close();

    expect(connections[0].isClosed).toBe(true);
    expect(socket.isOpen()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event("online"));
    expect(connections).toHaveLength(1);
    expect(statuses).toEqual([true]);
  });

  it("does not reconnect when it is closed while it waits for the next try", () => {
    const { connections, socket } = setup();
    connections[0].drop();

    socket.close();
    vi.advanceTimersByTime(60_000);

    expect(connections).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe("long polling", () => {
    /** Fails the WebSocket until the socket starts to poll. */
    async function failUntilPolling(view: ReturnType<typeof setup>) {
      for (let attempt = 1; attempt < POLL_AFTER_FAILED_TRIES; attempt += 1) {
        view.last().drop();
        await vi.advanceTimersByTimeAsync(30_000);
      }
      view.last().drop();
      await vi.advanceTimersByTimeAsync(0);
    }

    it("never polls when no poll function is given", async () => {
      const view = setup();

      await failUntilPolling(view);
      await vi.advanceTimersByTimeAsync(120_000);

      expect(view.polls).toHaveLength(0);
      expect(view.socket.isOpen()).toBe(false);
    });

    it("does not poll while the WebSocket fails fewer than three times in a row", async () => {
      const view = setup({ withPoll: true });

      view.last().drop();
      await vi.advanceTimersByTimeAsync(1_000);
      view.last().drop();
      await vi.advanceTimersByTimeAsync(0);

      expect(view.polls).toHaveLength(0);
    });

    it("starts to poll after three failed tries, and is open after the first answer", async () => {
      const view = setup({ withPoll: true });
      await failUntilPolling(view);

      expect(view.polls).toHaveLength(1);
      expect(view.polls[0].cursor).toBeNull();
      expect(view.socket.isOpen()).toBe(false);

      view.polls[0].answer.resolve({ frames: [], cursor: "5" });
      await vi.advanceTimersByTimeAsync(0);

      expect(view.socket.isOpen()).toBe(true);
      expect(view.statuses[view.statuses.length - 1]).toBe(true);
      expect(view.events).toEqual([{ type: "reconnect", attempt: 3, transport: "polling" }]);
    });

    it("gives the frames of an answer to the listeners and asks again from the new cursor", async () => {
      const view = setup({ withPoll: true });
      await failUntilPolling(view);

      view.polls[0].answer.resolve({ frames: [aMessage, { type: "pong" }], cursor: "7" });
      await vi.advanceTimersByTimeAsync(0);

      expect(view.frames).toEqual([aMessage]);
      expect(view.polls).toHaveLength(2);
      expect(view.polls[1].cursor).toBe("7");
    });

    it("says closed when a poll fails, waits, and polls again from the same cursor", async () => {
      const view = setup({ withPoll: true });
      await failUntilPolling(view);
      view.polls[0].answer.resolve({ frames: [], cursor: "7" });
      await vi.advanceTimersByTimeAsync(0);

      view.polls[1].answer.reject(new Error("500"));
      await vi.advanceTimersByTimeAsync(0);
      expect(view.socket.isOpen()).toBe(false);
      expect(view.polls).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(view.polls).toHaveLength(3);
      expect(view.polls[2].cursor).toBe("7");
    });

    it("drops frames we want to send while it polls", async () => {
      const view = setup({ withPoll: true });
      await failUntilPolling(view);
      view.polls[0].answer.resolve({ frames: [], cursor: "1" });
      await vi.advanceTimersByTimeAsync(0);

      expect(() => view.socket.send({ type: "typing", conversationId: "c1" })).not.toThrow();
    });

    it("tries the WebSocket again once a minute, and stops polling when it opens", async () => {
      const view = setup({ withPoll: true });
      await failUntilPolling(view);
      view.polls[0].answer.resolve({ frames: [], cursor: "1" });
      await vi.advanceTimersByTimeAsync(0);
      const tries = view.connections.length;
      const statusCount = view.statuses.length;

      await vi.advanceTimersByTimeAsync(SOCKET_RETRY_WHILE_POLLING_MS - 1);
      expect(view.connections).toHaveLength(tries);
      await vi.advanceTimersByTimeAsync(1);
      expect(view.connections).toHaveLength(tries + 1);

      view.last().open();
      const openPoll = view.polls[view.polls.length - 1];
      expect(openPoll.signal.aborted).toBe(true);
      // Listeners are told "open" again, so they ask for what the switch may have lost.
      expect(view.statuses.slice(statusCount)).toEqual([true]);
      expect(view.socket.isOpen()).toBe(true);

      view.socket.send({ type: "typing", conversationId: "c1" });
      expect(view.last().sent).toEqual([{ type: "typing", conversationId: "c1" }]);
    });

    it("keeps polling, and stays open, when a later WebSocket try fails too", async () => {
      const view = setup({ withPoll: true });
      await failUntilPolling(view);
      view.polls[0].answer.resolve({ frames: [], cursor: "1" });
      await vi.advanceTimersByTimeAsync(SOCKET_RETRY_WHILE_POLLING_MS);

      view.last().drop();
      await vi.advanceTimersByTimeAsync(0);

      expect(view.socket.isOpen()).toBe(true);
      expect(view.polls[view.polls.length - 1].signal.aborted).toBe(false);
    });

    it("stops polling when the socket is closed", async () => {
      const view = setup({ withPoll: true });
      await failUntilPolling(view);

      view.socket.close();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(view.polls).toHaveLength(1);
      expect(view.polls[0].signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
