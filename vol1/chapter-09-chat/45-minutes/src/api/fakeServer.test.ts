/* NOT PART OF THE INTERVIEW. Tests of the fake server of the demo. */
import { CONVERSATION_ID, createFakeServer } from "./fakeServer";
import type { ServerFrame } from "../chat";

const signal = () => new AbortController().signal;

function setup(seedCount = 5) {
  const server = createFakeServer({ seedCount, pageSize: 2, random: () => 0 });
  const asha = server.join("asha");
  const ravi = server.join("ravi");
  const frames: Record<string, ServerFrame[]> = { asha: [], ravi: [] };
  asha.connect({ onFrame: (frame) => frames.asha.push(frame) });
  ravi.connect({ onFrame: (frame) => frames.ravi.push(frame) });
  return { server, asha, ravi, frames };
}

/** Runs `request` and moves the fake clock until it has its answer. */
async function settle<T>(request: Promise<T>): Promise<T> {
  request.catch(() => {});
  await vi.advanceTimersByTimeAsync(5000);
  return request;
}

describe("fake server", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives the history in pages, the newest page first, with a cursor for the page before", async () => {
    const { asha } = setup(5);

    const newest = await settle(asha.fetchMessages(CONVERSATION_ID, null, signal()));
    expect(newest.messages.map((m) => m.id)).toEqual(["00000004", "00000005"]);

    const older = await settle(asha.fetchMessages(CONVERSATION_ID, newest.olderCursor, signal()));
    expect(older.messages.map((m) => m.id)).toEqual(["00000002", "00000003"]);

    const oldest = await settle(asha.fetchMessages(CONVERSATION_ID, older.olderCursor, signal()));
    expect(oldest.messages.map((m) => m.id)).toEqual(["00000001"]);
    expect(oldest.olderCursor).toBeNull();
  });

  it("stores a message, answers with the confirmed copy and pushes it to everyone, also to the sender", async () => {
    const { server, asha, frames } = setup();
    const message = { clientId: "a1", conversationId: CONVERSATION_ID, text: "hello" };

    const confirmed = await settle(asha.sendMessage(message, signal()));

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
    const message = { clientId: "a1", conversationId: CONVERSATION_ID, text: "hello" };

    asha.network.loseNextAnswer = true;
    await expect(settle(asha.sendMessage(message, signal()))).rejects.toThrow("lost");
    const confirmed = await settle(asha.sendMessage(message, signal()));

    expect(confirmed.id).toBe("00000006");
    expect(server.storedCount()).toBe(6);
    expect(frames.ravi).toHaveLength(1);
  });

  it("stores nothing for the send that is set to fail, and stores the next one", async () => {
    const { server, asha, frames } = setup();
    const message = { clientId: "a1", conversationId: CONVERSATION_ID, text: "hello" };

    asha.network.failNextSend = true;
    await expect(settle(asha.sendMessage(message, signal()))).rejects.toThrow();
    expect(server.storedCount()).toBe(5);
    expect(frames.ravi).toHaveLength(0);
    expect(asha.network.failNextSend).toBe(false);

    await settle(asha.sendMessage(message, signal()));
    expect(frames.ravi).toHaveLength(1);
  });

  it("fails requests and loses frames while the connection is dropped", async () => {
    const { asha, ravi, frames } = setup();
    ravi.network.isDropped = true;

    await expect(settle(ravi.fetchMessages(CONVERSATION_ID, null, signal()))).rejects.toThrow();
    await settle(
      asha.sendMessage({ clientId: "a1", conversationId: CONVERSATION_ID, text: "hi" }, signal()),
    );

    expect(frames.asha).toHaveLength(1);
    expect(frames.ravi).toHaveLength(0);
  });

  it("gives every message a later server time than the one before", async () => {
    const { asha } = setup(0);

    const first = await settle(
      asha.sendMessage({ clientId: "a1", conversationId: CONVERSATION_ID, text: "1" }, signal()),
    );
    const second = await settle(
      asha.sendMessage({ clientId: "a2", conversationId: CONVERSATION_ID, text: "2" }, signal()),
    );

    expect(second.createdAt).toBeGreaterThan(first.createdAt);
  });

  it("rejects a request at once when it is aborted, and pushes nothing after close", async () => {
    const { asha, ravi } = setup();
    const controller = new AbortController();
    const received: ServerFrame[] = [];
    const connection = ravi.connect({ onFrame: (frame) => received.push(frame) });

    const request = asha.fetchMessages(CONVERSATION_ID, null, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow("Aborted");

    connection.close();
    await settle(
      asha.sendMessage({ clientId: "a1", conversationId: CONVERSATION_ID, text: "hi" }, signal()),
    );
    expect(received).toHaveLength(0);
  });
});
