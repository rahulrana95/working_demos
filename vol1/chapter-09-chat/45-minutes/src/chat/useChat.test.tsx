/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the hook, without any screen. Every answer of the fake server is
 * given by hand, so each test decides the order of events.
 */
import { act, renderHook } from "@testing-library/react";
import { createFakeDeps, serverMessage } from "./testUtils";
import { MAX_MESSAGE_LENGTH } from "./types";
import { useChat } from "./useChat";
import type { ChatDeps } from "./useChat";

/** Lets the promises that are already settled run, and React with them. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderChat(conversationId = "c1") {
  const fake = createFakeDeps();
  const view = renderHook(({ id, deps }: { id: string; deps: ChatDeps }) => useChat(id, deps), {
    initialProps: { id: conversationId, deps: fake.deps },
  });
  const chat = () => view.result.current;
  const texts = () => chat().messages.map((message) => `${message.text}:${message.status}`);

  async function answerPage(index: number, ids: string[], olderCursor: string | null = null) {
    fake.pages[index].answer.resolve({ messages: ids.map((id) => serverMessage(id)), olderCursor });
    await flush();
  }

  return { ...fake, ...view, chat, texts, answerPage };
}

describe("useChat: history", () => {
  it("loads the newest page when it starts", async () => {
    const { pages, chat, answerPage } = renderChat();

    expect(chat().loadStatus).toBe("loading");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ conversationId: "c1", cursor: null });

    await answerPage(0, ["1", "2"], "cursor-1");

    expect(chat().loadStatus).toBe("ready");
    expect(chat().messages.map((message) => message.id)).toEqual(["1", "2"]);
    expect(chat().hasOlder).toBe(true);
  });

  it("loads the page before the oldest one with the cursor of the server", async () => {
    const { pages, chat, answerPage } = renderChat();
    await answerPage(0, ["3", "4"], "cursor-3");

    act(() => chat().loadOlder());
    expect(pages[1]).toMatchObject({ conversationId: "c1", cursor: "cursor-3" });
    expect(chat().loadStatus).toBe("loading");

    await answerPage(1, ["1", "2"], null);

    expect(chat().messages.map((message) => message.id)).toEqual(["1", "2", "3", "4"]);
    expect(chat().hasOlder).toBe(false);
  });

  it("asks for nothing when there is nothing older", async () => {
    const { pages, chat, answerPage } = renderChat();
    await answerPage(0, ["1"], null);

    act(() => chat().loadOlder());

    expect(pages).toHaveLength(1);
  });

  it("ignores a second call for an older page while the first one loads", async () => {
    const { pages, chat, answerPage } = renderChat();
    await answerPage(0, ["3"], "cursor-3");

    act(() => {
      chat().loadOlder();
      chat().loadOlder();
    });
    act(() => chat().loadOlder());

    expect(pages).toHaveLength(2);
  });

  it("reports an error when the first page fails, and tries the same page again", async () => {
    const { pages, chat, answerPage } = renderChat();

    pages[0].answer.reject(new Error("500"));
    await flush();
    expect(chat().loadStatus).toBe("error");
    expect(chat().hasOlder).toBe(true);

    act(() => chat().loadOlder());
    expect(pages[1]).toMatchObject({ cursor: null });
    await answerPage(1, ["1"]);

    expect(chat().loadStatus).toBe("ready");
  });

  it("keeps the messages and the cursor when an older page fails, and tries it again", async () => {
    const { pages, chat, answerPage } = renderChat();
    await answerPage(0, ["3"], "cursor-3");

    act(() => chat().loadOlder());
    pages[1].answer.reject(new Error("500"));
    await flush();

    expect(chat().loadStatus).toBe("error");
    expect(chat().messages).toHaveLength(1);

    act(() => chat().loadOlder());
    expect(pages[2]).toMatchObject({ cursor: "cursor-3" });
  });
});

describe("useChat: sending", () => {
  it("shows the message at once and sends its clientId, conversation and trimmed text", async () => {
    const { sends, chat, answerPage } = renderChat();
    await answerPage(0, ["1"]);

    let accepted = false;
    act(() => {
      accepted = chat().send("  hello  ");
    });

    expect(accepted).toBe(true);
    const mine = chat().messages[1];
    expect(mine).toMatchObject({ text: "hello", status: "sending", senderId: "asha" });
    expect(mine.id).toBeUndefined();
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      clientId: mine.clientId,
      conversationId: "c1",
      text: "hello",
    });
  });

  it("gives every message its own clientId", () => {
    const { sends, chat } = renderChat();

    act(() => void chat().send("one"));
    act(() => void chat().send("two"));

    expect(sends[0].clientId).not.toBe(sends[1].clientId);
  });

  it.each([
    ["", "an empty text"],
    ["  \n ", "only spaces and new lines"],
  ])("does not send %j (%s)", (text) => {
    const { sends, chat } = renderChat();

    let accepted = true;
    act(() => {
      accepted = chat().send(text);
    });

    expect(accepted).toBe(false);
    expect(sends).toHaveLength(0);
    expect(chat().messages).toHaveLength(0);
  });

  it("does not send a text over the length limit, and sends one at the limit", () => {
    const { sends, chat } = renderChat();

    let tooLong = true;
    act(() => {
      tooLong = chat().send("a".repeat(MAX_MESSAGE_LENGTH + 1));
    });
    expect(tooLong).toBe(false);
    expect(sends).toHaveLength(0);

    act(() => void chat().send("a".repeat(MAX_MESSAGE_LENGTH)));
    expect(sends).toHaveLength(1);
  });

  it("marks the message as sent, with the server id, when the server answers", async () => {
    const { sends, chat, confirm } = renderChat();
    act(() => void chat().send("hello"));

    sends[0].answer.resolve(confirm(sends[0], "7"));
    await flush();

    expect(chat().messages).toHaveLength(1);
    expect(chat().messages[0]).toMatchObject({ id: "7", status: "sent" });
  });

  it("shows my message once when the server also pushes it back, before or after the answer", async () => {
    const { sends, connections, chat, confirm } = renderChat();
    act(() => void chat().send("first"));
    act(() => void chat().send("second"));

    // First message: the pushed copy arrives before the answer.
    act(() => connections[0].push({ type: "message", message: confirm(sends[0], "7") }));
    sends[0].answer.resolve(confirm(sends[0], "7"));
    // Second message: the answer arrives before the pushed copy.
    sends[1].answer.resolve(confirm(sends[1], "8"));
    await flush();
    act(() => connections[0].push({ type: "message", message: confirm(sends[1], "8") }));

    expect(chat().messages.map((message) => message.id)).toEqual(["7", "8"]);
  });

  it("marks the message as failed when the send fails", async () => {
    const { sends, texts, chat } = renderChat();
    act(() => void chat().send("hello"));

    sends[0].answer.reject(new Error("500"));
    await flush();

    expect(texts()).toEqual(["hello:failed"]);
  });

  it("retries with the same clientId, so the server can tell a repeat from a new message", async () => {
    const { sends, texts, chat, confirm } = renderChat();
    act(() => void chat().send("hello"));
    sends[0].answer.reject(new Error("500"));
    await flush();

    act(() => chat().retry(sends[0].clientId));

    expect(texts()).toEqual(["hello:sending"]);
    expect(sends).toHaveLength(2);
    expect(sends[1]).toMatchObject({ clientId: sends[0].clientId, text: "hello" });

    sends[1].answer.resolve(confirm(sends[1], "7"));
    await flush();
    expect(texts()).toEqual(["hello:sent"]);
  });

  it("sends nothing on a second Retry while the first one is on its way", async () => {
    const { sends, chat } = renderChat();
    act(() => void chat().send("hello"));
    sends[0].answer.reject(new Error("500"));
    await flush();

    act(() => chat().retry(sends[0].clientId));
    act(() => chat().retry(sends[0].clientId));

    expect(sends).toHaveLength(2);
  });

  it("does not retry a message that is sent or still sending", async () => {
    const { sends, chat, answerPage } = renderChat();
    await answerPage(0, ["1"]);
    act(() => void chat().send("hello"));

    act(() => chat().retry(sends[0].clientId));
    act(() => chat().retry("client-1"));
    act(() => chat().retry("no-such-message"));

    expect(sends).toHaveLength(1);
  });

  it("keeps a message sent when the error of its send arrives after the pushed copy confirmed it", async () => {
    const { sends, connections, texts, chat, confirm } = renderChat();
    act(() => void chat().send("hello"));

    act(() => connections[0].push({ type: "message", message: confirm(sends[0], "7") }));
    sends[0].answer.reject(new Error("the answer was lost"));
    await flush();

    expect(texts()).toEqual(["hello:sent"]);
  });

  describe("with a fake clock", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("cancels a send with no answer after 10 seconds and marks it as failed", async () => {
      const { sends, texts, chat } = renderChat();
      act(() => void chat().send("hello"));

      await act(() => vi.advanceTimersByTimeAsync(9_999));
      expect(texts()).toEqual(["hello:sending"]);
      expect(sends[0].signal.aborted).toBe(false);

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(sends[0].signal.aborted).toBe(true);
      expect(texts()).toEqual(["hello:failed"]);
    });

    it("leaves no timer behind when the server answers, and none when the hook is removed", async () => {
      const { sends, chat, confirm, unmount } = renderChat();
      act(() => void chat().send("one"));
      act(() => void chat().send("two"));
      expect(vi.getTimerCount()).toBe(2);

      sends[0].answer.resolve(confirm(sends[0], "7"));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(vi.getTimerCount()).toBe(1);

      unmount();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe("useChat: live messages", () => {
  it("adds a message that the server pushes", async () => {
    const { connections, chat, answerPage } = renderChat();
    await answerPage(0, ["1"]);

    act(() => connections[0].push({ type: "message", message: serverMessage("2") }));

    expect(chat().messages.map((message) => message.id)).toEqual(["1", "2"]);
  });

  it("puts a late delivery at its server time, and does not reorder the others", async () => {
    const { connections, chat, answerPage } = renderChat();
    await answerPage(0, ["1", "4"]);

    act(() => connections[0].push({ type: "message", message: serverMessage("3") }));

    expect(chat().messages.map((message) => message.id)).toEqual(["1", "3", "4"]);
  });

  it("keeps a live message that arrives before the first page", async () => {
    const { connections, chat, answerPage } = renderChat();

    act(() => connections[0].push({ type: "message", message: serverMessage("3") }));
    await answerPage(0, ["1", "2", "3"]);

    expect(chat().messages.map((message) => message.id)).toEqual(["1", "2", "3"]);
  });

  it("ignores a message of another conversation", () => {
    const { connections, chat } = renderChat();

    act(() =>
      connections[0].push({
        type: "message",
        message: serverMessage("2", { conversationId: "other" }),
      }),
    );

    expect(chat().messages).toHaveLength(0);
  });

  it("ignores a kind of frame it does not know", () => {
    const { connections, chat } = renderChat();
    const unknownFrame = { type: "typing", userId: "ravi" } as unknown as Parameters<
      (typeof connections)[0]["push"]
    >[0];

    expect(() => act(() => connections[0].push(unknownFrame))).not.toThrow();
    expect(chat().messages).toHaveLength(0);
  });

  it("opens one connection, also when the parent passes new functions on every render", () => {
    const { connections, deps, rerender } = renderChat();

    rerender({ id: "c1", deps: { ...deps, connect: deps.connect.bind(null) } });
    rerender({ id: "c1", deps: { ...deps } });

    expect(connections).toHaveLength(1);
  });

  it("uses the newest send function of the parent", () => {
    const { deps, chat, rerender } = renderChat();
    const newSendMessage = vi.fn(() => new Promise<never>(() => {}));

    rerender({ id: "c1", deps: { ...deps, sendMessage: newSendMessage } });
    act(() => void chat().send("hello"));

    expect(newSendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("useChat: leaving a conversation", () => {
  it("empties the list, closes the connection and loads the new conversation", async () => {
    const { pages, connections, deps, chat, answerPage, rerender } = renderChat();
    await answerPage(0, ["1"], "cursor-1");

    rerender({ id: "c2", deps });

    expect(chat().messages).toHaveLength(0);
    expect(chat().loadStatus).toBe("loading");
    expect(connections[0].isClosed).toBe(true);
    expect(connections[1].isClosed).toBe(false);
    expect(pages[1]).toMatchObject({ conversationId: "c2", cursor: null });
  });

  it("cancels the page request of the old conversation and ignores its late answer", async () => {
    const { pages, deps, chat, answerPage, rerender } = renderChat();

    rerender({ id: "c2", deps });
    expect(pages[0].signal.aborted).toBe(true);

    await answerPage(0, ["1", "2"], "old-cursor");
    expect(chat().messages).toHaveLength(0);
    expect(chat().loadStatus).toBe("loading");

    await answerPage(1, [], null);
    expect(chat().loadStatus).toBe("ready");
    expect(chat().hasOlder).toBe(false);
  });

  it("does not show an error for a request that was cancelled", async () => {
    const { pages, deps, chat, rerender } = renderChat();

    rerender({ id: "c2", deps });
    pages[0].answer.reject(new DOMException("Aborted", "AbortError"));
    await flush();

    expect(chat().loadStatus).toBe("loading");
  });

  it("can load an older page in the new conversation while the old one was loading one", async () => {
    const { pages, deps, chat, answerPage, rerender } = renderChat();
    await answerPage(0, ["5"], "cursor-5");
    act(() => chat().loadOlder());

    rerender({ id: "c2", deps });
    await answerPage(2, ["9"], "cursor-9");
    act(() => chat().loadOlder());

    expect(pages[3]).toMatchObject({ conversationId: "c2", cursor: "cursor-9" });
  });

  it("cancels a send that is on its way and ignores its late answer", async () => {
    const { sends, deps, chat, confirm, rerender } = renderChat();
    act(() => void chat().send("hello"));

    rerender({ id: "c2", deps });
    expect(sends[0].signal.aborted).toBe(true);

    sends[0].answer.resolve(confirm(sends[0], "7"));
    await flush();
    expect(chat().messages).toHaveLength(0);
  });

  it("closes the connection and cancels every request when the hook is removed", () => {
    const { pages, sends, connections, chat, unmount } = renderChat();
    act(() => void chat().send("hello"));

    unmount();

    expect(connections[0].isClosed).toBe(true);
    expect(pages[0].signal.aborted).toBe(true);
    expect(sends[0].signal.aborted).toBe(true);
  });
});
