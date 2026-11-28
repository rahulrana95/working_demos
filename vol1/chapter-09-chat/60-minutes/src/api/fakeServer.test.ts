/* NOT PART OF THE INTERVIEW. Tests of the fake server of the demo. */
import { CONVERSATION_ID, createFakeServer } from "./fakeServer";
import type { ServerFrame } from "../chat";

const signal = () => new AbortController().signal;
const NEWEST = { before: null };

function setup(seedCount = 5) {
  const server = createFakeServer({ seedCount, pageSize: 2, random: () => 0 });
  const asha = server.join("asha");
  const ravi = server.join("ravi");
  const frames: Record<string, ServerFrame[]> = { asha: [], ravi: [] };
  const events: string[] = [];
  const connectAs = (client: typeof asha) =>
    client.connect({
      onOpen: () => events.push(`${client.userId} open`),
      onFrame: (frame) => frames[client.userId].push(frame),
      onClose: () => events.push(`${client.userId} closed`),
    });
  const connections = { asha: connectAs(asha), ravi: connectAs(ravi) };
  // Lets both connections open.
  vi.advanceTimersByTime(1000);
  return { server, asha, ravi, frames, events, connections, connectAs };
}

/** Runs `request` and moves the fake clock until it has its answer. */
async function settle<T>(request: Promise<T>): Promise<T> {
  request.catch(() => {});
  await vi.advanceTimersByTimeAsync(5000);
  return request;
}

const hello = (clientId: string) => ({ clientId, conversationId: CONVERSATION_ID, text: "hello" });

describe("fake server", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives the history in pages, the newest page first, with a cursor for the page before", async () => {
    const { asha } = setup(5);

    const newest = await settle(asha.fetchMessages(CONVERSATION_ID, NEWEST, signal()));
    expect(newest.messages.map((m) => m.id)).toEqual(["00000004", "00000005"]);
    expect(newest.newerCursor).toBe("00000005");

    const older = await settle(
      asha.fetchMessages(CONVERSATION_ID, { before: newest.olderCursor }, signal()),
    );
    expect(older.messages.map((m) => m.id)).toEqual(["00000002", "00000003"]);

    const oldest = await settle(
      asha.fetchMessages(CONVERSATION_ID, { before: older.olderCursor }, signal()),
    );
    expect(oldest.messages.map((m) => m.id)).toEqual(["00000001"]);
    expect(oldest.olderCursor).toBeNull();
  });

  it("gives everything stored after a cursor, and a cursor for the next catch-up", async () => {
    const { asha } = setup(3);
    const { newerCursor } = await settle(asha.fetchMessages(CONVERSATION_ID, NEWEST, signal()));
    await settle(asha.sendMessage(hello("a1"), signal()));
    await settle(asha.sendMessage(hello("a2"), signal()));

    const missed = await settle(
      asha.fetchMessages(CONVERSATION_ID, { after: newerCursor }, signal()),
    );
    expect(missed.messages.map((m) => m.clientId)).toEqual(["a1", "a2"]);
    expect(missed.newerCursor).toBe("00000005");

    const nothing = await settle(
      asha.fetchMessages(CONVERSATION_ID, { after: missed.newerCursor }, signal()),
    );
    expect(nothing.messages).toEqual([]);
  });

  it("gives a cursor that works for an empty conversation", async () => {
    const { asha } = setup(0);
    const { newerCursor } = await settle(asha.fetchMessages(CONVERSATION_ID, NEWEST, signal()));
    await settle(asha.sendMessage(hello("a1"), signal()));

    const missed = await settle(
      asha.fetchMessages(CONVERSATION_ID, { after: newerCursor }, signal()),
    );
    expect(missed.messages).toHaveLength(1);
  });

  it("stores a message, answers with the confirmed copy and pushes it to everyone, also to the sender", async () => {
    const { server, asha, frames } = setup();

    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));

    expect(confirmed).toMatchObject({
      clientId: "a1",
      senderId: "asha",
      status: "sent",
      id: "00000006",
    });
    expect(server.storedCount()).toBe(6);
    expect(frames.asha).toEqual([{ type: "message", message: confirmed }]);
    expect(frames.ravi).toEqual([{ type: "message", message: confirmed }]);
  });

  it("stores and pushes a message once when the same clientId is sent again", async () => {
    const { server, asha, frames } = setup();

    asha.setNetwork("loseNextAnswer", true);
    await expect(settle(asha.sendMessage(hello("a1"), signal()))).rejects.toThrow("lost");
    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));

    expect(confirmed.id).toBe("00000006");
    expect(server.storedCount()).toBe(6);
    expect(frames.ravi).toHaveLength(1);
  });

  it("stores nothing for the send that is set to fail, and stores the next one", async () => {
    const { server, asha, frames } = setup();

    asha.setNetwork("failNextSend", true);
    await expect(settle(asha.sendMessage(hello("a1"), signal()))).rejects.toThrow();
    expect(server.storedCount()).toBe(5);
    expect(frames.ravi).toHaveLength(0);
    expect(asha.network.failNextSend).toBe(false);

    await settle(asha.sendMessage(hello("a1"), signal()));
    expect(frames.ravi).toHaveLength(1);
  });

  it("opens a connection after a moment, and answers a ping with a pong", () => {
    const { events, frames, connections } = setup();
    expect(events).toEqual(["asha open", "ravi open"]);

    connections.asha.send({ type: "ping" });
    vi.advanceTimersByTime(1000);

    expect(frames.asha).toEqual([{ type: "pong" }]);
    expect(frames.ravi).toEqual([]);
  });

  it("closes the connection of a screen that is dropped, fails its requests and pushes it nothing", async () => {
    const { asha, ravi, frames, events } = setup();

    ravi.setNetwork("isDropped", true);
    expect(events).toEqual(["asha open", "ravi open", "ravi closed"]);

    await expect(settle(ravi.fetchMessages(CONVERSATION_ID, NEWEST, signal()))).rejects.toThrow();
    await settle(asha.sendMessage(hello("a1"), signal()));
    expect(frames.asha).toHaveLength(1);
    expect(frames.ravi).toHaveLength(0);
  });

  it("refuses a new connection while the screen is dropped, and accepts one after", () => {
    const { ravi, events, connectAs } = setup();
    ravi.setNetwork("isDropped", true);
    events.length = 0;

    connectAs(ravi);
    vi.advanceTimersByTime(1000);
    expect(events).toEqual(["ravi closed"]);

    ravi.setNetwork("isDropped", false);
    connectAs(ravi);
    vi.advanceTimersByTime(1000);
    expect(events).toEqual(["ravi closed", "ravi open"]);
  });

  it("gives every message a later server time than the one before", async () => {
    const { asha } = setup(0);

    const first = await settle(asha.sendMessage(hello("a1"), signal()));
    const second = await settle(asha.sendMessage(hello("a2"), signal()));

    expect(second.createdAt).toBeGreaterThan(first.createdAt);
  });

  it("rejects a request at once when it is aborted, and calls no handler after close", async () => {
    const { asha, connections, frames, events } = setup();
    const controller = new AbortController();

    const request = asha.fetchMessages(CONVERSATION_ID, NEWEST, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow("Aborted");

    connections.ravi.close();
    await settle(asha.sendMessage(hello("a1"), signal()));
    expect(frames.ravi).toHaveLength(0);
    expect(events).toEqual(["asha open", "ravi open"]);
  });
});
