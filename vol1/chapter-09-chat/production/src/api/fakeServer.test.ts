/* NOT PART OF THE INTERVIEW. Tests of the fake server of the demo. */
import { createFakeServer } from "./fakeServer";
import type { FakeClient } from "./fakeServer";
import type { ServerFrame } from "../chat";

const signal = () => new AbortController().signal;
const NEWEST = { before: null };
const AR = "asha-ravi";

function setup(seedCount = 5) {
  const server = createFakeServer({
    seedCount,
    pageSize: 2,
    random: () => 0,
    makeUrl: (file) => `https://files.example/${file.name}`,
  });
  const asha = server.join("asha");
  const ravi = server.join("ravi");
  const frames: Record<string, ServerFrame[]> = { asha: [], ravi: [] };
  const events: string[] = [];
  const connectAs = (client: FakeClient) =>
    client.connect({
      onOpen: () => events.push(`${client.userId} open`),
      onFrame: (frame) => frames[client.userId].push(frame),
      onClose: () => events.push(`${client.userId} closed`),
    });
  const connections = { asha: connectAs(asha), ravi: connectAs(ravi) };
  // Lets both connections open.
  vi.advanceTimersByTime(1000);
  const of = (userId: string, type: ServerFrame["type"]) =>
    frames[userId].filter((frame) => frame.type === type);
  return { server, asha, ravi, frames, events, connections, connectAs, of };
}

/** Runs `request` and moves the fake clock until it has its answer. */
async function settle<T>(request: Promise<T>): Promise<T> {
  request.catch(() => {});
  await vi.advanceTimersByTimeAsync(6000);
  return request;
}

const hello = (clientId: string, conversationId = AR) => ({
  clientId,
  conversationId,
  text: "hello",
});

describe("fake server", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives the history in pages, the newest page first, with a cursor for the page before", async () => {
    const { asha } = setup(5);

    const newest = await settle(asha.fetchMessages(AR, NEWEST, signal()));
    expect(newest.messages.map((m) => m.id)).toEqual(["00000004", "00000005"]);

    const older = await settle(asha.fetchMessages(AR, { before: newest.olderCursor }, signal()));
    expect(older.messages.map((m) => m.id)).toEqual(["00000002", "00000003"]);

    const oldest = await settle(asha.fetchMessages(AR, { before: older.olderCursor }, signal()));
    expect(oldest.messages.map((m) => m.id)).toEqual(["00000001"]);
    expect(oldest.olderCursor).toBeNull();
  });

  it("gives everything of the conversation stored after a cursor, and a cursor for the next catch-up", async () => {
    const { asha } = setup(3);
    const { newerCursor } = await settle(asha.fetchMessages(AR, NEWEST, signal()));
    await settle(asha.sendMessage(hello("a1"), signal()));
    await settle(asha.sendMessage(hello("m1", "asha-meera"), signal()));
    await settle(asha.sendMessage(hello("a2"), signal()));

    const missed = await settle(asha.fetchMessages(AR, { after: newerCursor }, signal()));
    expect(missed.messages.map((m) => m.clientId)).toEqual(["a1", "a2"]);

    const nothing = await settle(asha.fetchMessages(AR, { after: missed.newerCursor }, signal()));
    expect(nothing.messages).toEqual([]);
  });

  it("stores a message, answers with the confirmed copy and pushes it to everyone in the conversation, also to the sender", async () => {
    const { asha, of } = setup();

    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));

    expect(confirmed).toMatchObject({
      clientId: "a1",
      senderId: "asha",
      status: "sent",
      conversationId: AR,
    });
    expect(of("asha", "message")).toEqual([{ type: "message", message: confirmed }]);
    expect(of("ravi", "message")).toEqual([{ type: "message", message: confirmed }]);
  });

  it("does not push a message to a person who is not in the conversation", async () => {
    const { asha, of } = setup();

    await settle(asha.sendMessage(hello("m1", "asha-meera"), signal()));

    expect(of("ravi", "message")).toEqual([]);
  });

  it("stores and pushes a message once when the same clientId is sent again", async () => {
    const { server, asha, of } = setup();
    const before = server.storedCount();

    asha.setNetwork("loseNextAnswer", true);
    await expect(settle(asha.sendMessage(hello("a1"), signal()))).rejects.toThrow("lost");
    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));

    expect(server.storedCount()).toBe(before + 1);
    expect(of("ravi", "message")).toEqual([{ type: "message", message: confirmed }]);
  });

  it("stores nothing for the send that is set to fail, and stores the next one", async () => {
    const { server, asha, of } = setup();
    const before = server.storedCount();

    asha.setNetwork("failNextSend", true);
    await expect(settle(asha.sendMessage(hello("a1"), signal()))).rejects.toThrow();
    expect(server.storedCount()).toBe(before);
    expect(asha.network.failNextSend).toBe(false);

    await settle(asha.sendMessage(hello("a1"), signal()));
    expect(of("ravi", "message")).toHaveLength(1);
  });

  it("tells the sender that the message was delivered when it reaches the other person", async () => {
    const { asha, of } = setup();

    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));

    expect(of("asha", "receipt")).toEqual([
      { type: "receipt", conversationId: AR, status: "delivered", upTo: confirmed.createdAt },
    ]);
    expect(of("ravi", "receipt")).toEqual([]);
  });

  it("tells the sender that the message was read when the other person says so, once", async () => {
    const { asha, connections, of } = setup();
    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));
    const read = { type: "read", conversationId: AR, upTo: confirmed.createdAt } as const;

    connections.ravi.send(read);
    connections.ravi.send(read);
    await vi.advanceTimersByTimeAsync(1000);

    expect(
      of("asha", "receipt").filter((frame) => frame.type === "receipt" && frame.status === "read"),
    ).toHaveLength(1);
  });

  it("gives the history with the status the sender should see", async () => {
    const { asha, ravi, connections } = setup(0);
    const first = await settle(asha.sendMessage(hello("a1"), signal()));
    connections.ravi.send({ type: "read", conversationId: AR, upTo: first.createdAt });
    connections.ravi.close();
    await settle(asha.sendMessage(hello("a2"), signal()));

    const forAsha = await settle(asha.fetchMessages(AR, NEWEST, signal()));
    const forRavi = await settle(ravi.fetchMessages(AR, NEWEST, signal()));

    expect(forAsha.messages.map((m) => m.status)).toEqual(["read", "sent"]);
    expect(forRavi.messages.map((m) => m.status)).toEqual(["sent", "sent"]);
  });

  it("counts a message as delivered when the other person loads it as history", async () => {
    const { asha, ravi, connections, of } = setup(0);
    connections.ravi.close();
    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));
    expect(of("asha", "receipt")).toEqual([]);

    await settle(ravi.fetchMessages(AR, NEWEST, signal()));

    expect(of("asha", "receipt")).toEqual([
      { type: "receipt", conversationId: AR, status: "delivered", upTo: confirmed.createdAt },
    ]);
  });

  it("passes typing on to the other person only", async () => {
    const { connections, of } = setup();

    connections.asha.send({ type: "typing", conversationId: AR });
    await vi.advanceTimersByTimeAsync(1000);

    expect(of("ravi", "typing")).toEqual([{ type: "typing", conversationId: AR, userId: "asha" }]);
    expect(of("asha", "typing")).toEqual([]);
  });

  it("lists the conversations of a person with the last message and the unread count", async () => {
    const { server, asha, connections } = setup(4);
    server.sendAs("meera", "asha-meera", "Asha, do you have a minute?");
    await vi.advanceTimersByTimeAsync(1000);

    const list = await settle(asha.fetchConversations(signal()));

    expect(list.map((c) => c.id).sort()).toEqual(["asha-meera", "asha-ravi"]);
    const meera = list.find((c) => c.id === "asha-meera");
    expect(meera).toMatchObject({ title: "Meera", unreadCount: 1 });
    expect(meera?.lastMessage?.text).toBe("Asha, do you have a minute?");

    connections.asha.send({
      type: "read",
      conversationId: "asha-meera",
      upTo: meera?.lastMessage?.createdAt ?? 0,
    });
    const after = await settle(asha.fetchConversations(signal()));
    expect(after.find((c) => c.id === "asha-meera")?.unreadCount).toBe(0);
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
    const { asha, ravi, events, of } = setup();

    ravi.setNetwork("isDropped", true);
    expect(events).toEqual(["asha open", "ravi open", "ravi closed"]);

    await expect(settle(ravi.fetchMessages(AR, NEWEST, signal()))).rejects.toThrow();
    await settle(asha.sendMessage(hello("a1"), signal()));
    expect(of("asha", "message")).toHaveLength(1);
    expect(of("ravi", "message")).toHaveLength(0);
  });

  it("refuses a new connection while the WebSocket is blocked, but still answers requests", async () => {
    const { ravi, events, connectAs } = setup();
    ravi.setNetwork("isSocketBlocked", true);
    events.length = 0;

    connectAs(ravi);
    vi.advanceTimersByTime(1000);
    expect(events).toEqual(["ravi closed"]);

    await expect(settle(ravi.fetchMessages(AR, NEWEST, signal()))).resolves.toBeDefined();
  });

  it("holds a poll until a frame comes, then answers with it and with the next cursor", async () => {
    const { asha, ravi } = setup();
    ravi.setNetwork("isSocketBlocked", true);
    const first = await settle(ravi.poll(null, signal()));
    expect(first.frames).toEqual([]);

    const waiting = ravi.poll(first.cursor, signal());
    let answered = false;
    waiting.then(() => (answered = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(answered).toBe(false);

    const confirmed = await settle(asha.sendMessage(hello("a1"), signal()));
    const answer = await waiting;
    expect(answer.frames).toEqual([{ type: "message", message: confirmed }]);

    const next = await settle(ravi.poll(answer.cursor, signal()));
    expect(next.frames).toEqual([]);
  });

  it("counts a message as delivered when it reaches the other person in a poll", async () => {
    const { asha, ravi, connections, of } = setup();
    connections.ravi.close();
    const { cursor } = await settle(ravi.poll(null, signal()));
    await settle(asha.sendMessage(hello("a1"), signal()));
    expect(of("asha", "receipt")).toEqual([]);

    await settle(ravi.poll(cursor, signal()));
    await vi.advanceTimersByTimeAsync(1000);

    expect(of("asha", "receipt")).toHaveLength(1);
  });

  it("uploads a file in steps, reports the progress and gives its address", async () => {
    const { asha } = setup();
    const progress: number[] = [];
    const file = new File(["x"], "cat.png", { type: "image/png" });

    const result = await settle(
      asha.uploadFile(file, { signal: signal(), onProgress: (f) => progress.push(f) }),
    );

    expect(progress).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
    expect(result).toEqual({ url: "https://files.example/cat.png" });
  });

  it("stops an upload that is aborted, and fails one on a dropped network", async () => {
    const { asha } = setup();
    const file = new File(["x"], "cat.png", { type: "image/png" });
    const controller = new AbortController();

    const aborted = asha.uploadFile(file, { signal: controller.signal, onProgress: () => {} });
    controller.abort();
    await expect(aborted).rejects.toThrow("Aborted");

    asha.setNetwork("isDropped", true);
    await expect(
      settle(asha.uploadFile(file, { signal: signal(), onProgress: () => {} })),
    ).rejects.toThrow();
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

    const request = asha.fetchMessages(AR, NEWEST, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow("Aborted");

    connections.ravi.close();
    await settle(asha.sendMessage(hello("a1"), signal()));
    expect(frames.ravi).toHaveLength(0);
    expect(events).toEqual(["asha open", "ravi open"]);
  });
});
