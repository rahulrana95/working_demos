/* NOT PART OF THE INTERVIEW. Tests of the hook of the conversation list. */
import { act, renderHook } from "@testing-library/react";
import { createChatSocket } from "./socket";
import { conversation, createDeferred, createFakeTransport, serverMessage } from "./testUtils";
import type { Deferred } from "./testUtils";
import type { ConversationSummary, Message } from "./types";
import { useConversations } from "./useConversations";

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

const LIST = [
  conversation("c1", { lastMessage: { senderId: "ravi", text: "old", createdAt: 1000 } }),
  conversation("c2", {
    lastMessage: { senderId: "meera", text: "older", createdAt: 500 },
    unreadCount: 2,
  }),
];

function renderList(openId: string | null = "c1") {
  const { connections, connect } = createFakeTransport();
  const socket = createChatSocket({ connect });
  const requests: { signal: AbortSignal; answer: Deferred<ConversationSummary[]> }[] = [];
  const unseen: { message: Message; conversation: ConversationSummary }[] = [];
  const deps = {
    currentUserId: "asha",
    socket,
    fetchConversations: (signal: AbortSignal) => {
      const answer = createDeferred<ConversationSummary[]>();
      requests.push({ signal, answer });
      return answer.promise;
    },
    onUnseenMessage: (message: Message, summary: ConversationSummary) =>
      unseen.push({ message, conversation: summary }),
  };
  const view = renderHook(({ id }: { id: string | null }) => useConversations(id, deps), {
    initialProps: { id: openId },
  });
  const list = () => view.result.current;
  const counts = () => Object.fromEntries(list().conversations.map((c) => [c.id, c.unreadCount]));

  async function answer(index: number, conversations = LIST) {
    requests[index].answer.resolve(conversations);
    await flush();
  }
  const push = (id: string, fields: Partial<Message>) =>
    act(() => connections[0].push({ type: "message", message: serverMessage(id, fields) }));

  return { ...view, connections, requests, unseen, list, counts, answer, push, socket };
}

afterEach(() => setVisibility("visible"));

describe("useConversations", () => {
  it("loads the list and gives it with the newest conversation first", async () => {
    const { requests, list, answer } = renderList();
    expect(list().status).toBe("loading");
    expect(requests).toHaveLength(1);

    await answer(0);

    expect(list().status).toBe("ready");
    expect(list().conversations.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(list().unreadTotal).toBe(2);
  });

  it("reports an error when the list cannot be loaded", async () => {
    const { requests, list } = renderList();

    requests[0].answer.reject(new Error("500"));
    await flush();

    expect(list().status).toBe("error");
    expect(list().conversations).toEqual([]);
  });

  it("loads the list again when the connection opens, because counts may have changed", async () => {
    const { requests, connections, list, answer } = renderList();
    await answer(0);

    act(() => connections[0].open());
    expect(requests).toHaveLength(2);
    await answer(1, [{ ...LIST[1], unreadCount: 5 }]);

    expect(list().unreadTotal).toBe(5);
    expect(list().conversations.map((c) => c.id)).toEqual(["c2"]);
  });

  it("keeps the list it has when a later load fails", async () => {
    const { requests, connections, list, answer } = renderList();
    await answer(0);
    act(() => connections[0].open());

    requests[1].answer.reject(new Error("500"));
    await flush();

    expect(list().status).toBe("ready");
    expect(list().conversations).toHaveLength(2);
  });

  it("ignores an old answer that arrives after a newer one", async () => {
    const { requests, connections, list, answer } = renderList();
    act(() => connections[0].open());
    expect(requests[0].signal.aborted).toBe(true);

    await answer(1, [{ ...LIST[1], unreadCount: 1 }]);
    await answer(0, [{ ...LIST[1], unreadCount: 9 }]);

    expect(list().unreadTotal).toBe(1);
  });

  it("counts a message in a conversation that is not open, and moves it to the top", async () => {
    const { list, counts, answer, push } = renderList("c1");
    await answer(0);

    push("5", { conversationId: "c2", senderId: "meera", text: "are you there?" });

    expect(counts()).toEqual({ c2: 3, c1: 0 });
    expect(list().conversations[0]).toMatchObject({
      id: "c2",
      lastMessage: { text: "are you there?" },
    });
    expect(list().unreadTotal).toBe(3);
  });

  it("does not count a message in the open conversation while the user can see the page", async () => {
    const { counts, unseen, answer, push } = renderList("c1");
    await answer(0);

    push("5", { conversationId: "c1" });

    expect(counts().c1).toBe(0);
    expect(unseen).toHaveLength(0);
  });

  it("counts a message in the open conversation while the page is hidden, and clears it when the user is back", async () => {
    const { counts, unseen, answer, push } = renderList("c1");
    await answer(0);
    setVisibility("hidden");

    push("5", { conversationId: "c1" });
    expect(counts().c1).toBe(1);
    expect(unseen).toHaveLength(1);

    setVisibility("visible");
    expect(counts().c1).toBe(0);
  });

  it("never counts my own message, also not one sent from another tab", async () => {
    const { counts, unseen, answer, push } = renderList("c1");
    await answer(0);

    push("5", { conversationId: "c2", senderId: "asha" });

    expect(counts().c2).toBe(2);
    expect(unseen).toHaveLength(0);
  });

  it("counts and announces a message once when the server pushes it twice", async () => {
    const { counts, unseen, answer, push } = renderList("c1");
    await answer(0);

    push("5", { conversationId: "c2", senderId: "meera" });
    push("5", { conversationId: "c2", senderId: "meera" });

    expect(counts().c2).toBe(3);
    expect(unseen).toHaveLength(1);
    expect(unseen[0].conversation.id).toBe("c2");
  });

  it("clears the count of a conversation when the user opens it", async () => {
    const { counts, answer, rerender } = renderList("c1");
    await answer(0);
    expect(counts().c2).toBe(2);

    rerender({ id: "c2" });

    expect(counts().c2).toBe(0);
  });

  it("clears the count of the open conversation when the list arrives after it was opened", async () => {
    const { counts, answer } = renderList("c2");

    await answer(0);

    expect(counts().c2).toBe(0);
  });

  it("does not show a count on the open conversation when the server still counts its messages", async () => {
    const { connections, counts, answer } = renderList("c1");
    await answer(0);

    act(() => connections[0].open());
    await answer(1, [
      conversation("c1", {
        unreadCount: 4,
        lastMessage: { senderId: "ravi", text: "new", createdAt: 9000 },
      }),
    ]);

    expect(counts().c1).toBe(0);
  });

  it("stops listening and cancels its request when it is removed", () => {
    const { requests, connections, unmount } = renderList();

    unmount();

    expect(requests[0].signal.aborted).toBe(true);
    expect(() =>
      connections[0].push({ type: "message", message: serverMessage("5") }),
    ).not.toThrow();
  });
});
