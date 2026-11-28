/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the hook, without any screen. The first part is the tests of the
 * 60-minute answer. The parts after "production" test what this version adds. Every answer of the fake server is
 * given by hand, so each test decides the order of events.
 */
import { act, renderHook } from "@testing-library/react";
import { outboxKey } from "./outboxStorage";
import { createFakeDeps, imageFile, serverMessage } from "./testUtils";
import { MAX_IMAGE_BYTES, MAX_MESSAGE_LENGTH } from "./types";
import { useChat } from "./useChat";
import type { ChatDeps } from "./useChat";
import type { ServerFrame } from "./types";

/** Lets the promises that are already settled run, and React with them. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Starts the hook. The live connection is open before it starts, unless the
 * test says `isOpen: false`.
 */
function renderChat({ isOpen = true, stored = {} as Record<string, string> } = {}) {
  const fake = createFakeDeps();
  Object.entries(stored).forEach(([key, value]) => fake.memory.items.set(key, value));
  if (isOpen) {
    fake.connections[0].open();
  }
  const view = renderHook(({ id, deps }: { id: string; deps: ChatDeps }) => useChat(id, deps), {
    initialProps: { id: "c1", deps: fake.deps },
  });
  const chat = () => view.result.current;
  const texts = () => chat().messages.map((message) => `${message.text}:${message.status}`);

  async function answerPage(index: number, ids: string[], olderCursor: string | null = null) {
    fake.pages[index].answer.resolve(fake.page(ids, olderCursor));
    await flush();
  }

  /** The server answers send number `index` with a confirmed message. */
  async function answerSend(index: number, id: string) {
    fake.sends[index].answer.resolve(fake.confirm(fake.sends[index], id));
    await flush();
  }

  async function failSend(index: number) {
    fake.sends[index].answer.reject(new Error("500"));
    await flush();
  }

  return { ...fake, ...view, chat, texts, answerPage, answerSend, failSend };
}

describe("useChat: history", () => {
  it("loads the newest page when it starts", async () => {
    const { pages, chat, answerPage } = renderChat();

    expect(chat().loadStatus).toBe("loading");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ conversationId: "c1", cursor: { before: null } });

    await answerPage(0, ["1", "2"], "cursor-1");

    expect(chat().loadStatus).toBe("ready");
    expect(chat().messages.map((message) => message.id)).toEqual(["1", "2"]);
    expect(chat().hasOlder).toBe(true);
  });

  it("loads the page before the oldest one with the cursor of the server", async () => {
    const { pages, chat, answerPage } = renderChat();
    await answerPage(0, ["3", "4"], "cursor-3");

    act(() => chat().loadOlder());
    expect(pages[1]).toMatchObject({ conversationId: "c1", cursor: { before: "cursor-3" } });
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
    expect(pages[1]).toMatchObject({ cursor: { before: null } });
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
    expect(pages[2]).toMatchObject({ cursor: { before: "cursor-3" } });
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
    const { chat } = renderChat();

    act(() => void chat().send("one"));
    act(() => void chat().send("two"));

    expect(chat().messages[0].clientId).not.toBe(chat().messages[1].clientId);
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
    const { chat, answerSend } = renderChat();
    act(() => void chat().send("hello"));

    await answerSend(0, "7");

    expect(chat().messages).toHaveLength(1);
    expect(chat().messages[0]).toMatchObject({ id: "7", status: "sent" });
  });

  it("shows my message once when the server also pushes it back, before or after the answer", async () => {
    const { sends, connections, chat, confirm, answerSend } = renderChat();
    act(() => void chat().send("first"));
    act(() => void chat().send("second"));

    // First message: the pushed copy arrives before the answer.
    act(() => connections[0].push({ type: "message", message: confirm(sends[0], "7") }));
    await answerSend(0, "7");
    // Second message: the answer arrives before the pushed copy.
    await answerSend(1, "8");
    act(() => connections[0].push({ type: "message", message: confirm(sends[1], "8") }));

    expect(chat().messages.map((message) => message.id)).toEqual(["7", "8"]);
  });

  it("marks the message as failed when the send fails", async () => {
    const { texts, chat, failSend } = renderChat();
    act(() => void chat().send("hello"));

    await failSend(0);

    expect(texts()).toEqual(["hello:failed"]);
  });

  it("retries with the same clientId, so the server can tell a repeat from a new message", async () => {
    const { sends, texts, chat, answerSend, failSend } = renderChat();
    act(() => void chat().send("hello"));
    await failSend(0);

    act(() => chat().retry(sends[0].clientId));

    expect(texts()).toEqual(["hello:sending"]);
    expect(sends).toHaveLength(2);
    expect(sends[1]).toMatchObject({ clientId: sends[0].clientId, text: "hello" });

    await answerSend(1, "7");
    expect(texts()).toEqual(["hello:sent"]);
  });

  it("sends nothing on a second Retry while the first one is on its way", async () => {
    const { sends, chat, failSend } = renderChat();
    act(() => void chat().send("hello"));
    await failSend(0);

    act(() => {
      chat().retry(sends[0].clientId);
      chat().retry(sends[0].clientId);
    });
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
    expect(chat().messages.map((message) => message.status)).toEqual(["sent", "sending"]);
  });

  it("keeps a message sent when the error of its send arrives after the pushed copy confirmed it", async () => {
    const { sends, connections, texts, chat, confirm, failSend } = renderChat();
    act(() => void chat().send("hello"));

    act(() => connections[0].push({ type: "message", message: confirm(sends[0], "7") }));
    await failSend(0);

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

    it("sends the next message after a time-out, also when the send function never answers", async () => {
      const { deps, texts, chat, rerender } = renderChat();
      const calls: string[] = [];
      // This function breaks the contract: it does not reject when its signal is aborted.
      const deafSendMessage = vi.fn((message: { text: string }) => {
        calls.push(message.text);
        return new Promise<never>(() => {});
      });
      rerender({ id: "c1", deps: { ...deps, sendMessage: deafSendMessage } });

      act(() => void chat().send("one"));
      act(() => void chat().send("two"));
      expect(calls).toEqual(["one"]);

      await act(() => vi.advanceTimersByTimeAsync(10_000));

      expect(texts()).toEqual(["one:failed", "two:sending"]);
      expect(calls).toEqual(["one", "two"]);
    });

    it("leaves no timer of a send behind when the server answers, and none when the hook is removed", async () => {
      const { chat, answerSend, unmount } = renderChat();
      const timersOfTheConnection = vi.getTimerCount();
      act(() => void chat().send("one"));
      act(() => void chat().send("two"));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(vi.getTimerCount()).toBe(timersOfTheConnection + 1);

      await answerSend(0, "7");
      expect(vi.getTimerCount()).toBe(timersOfTheConnection + 1);

      unmount();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(timersOfTheConnection);
    });
  });
});

describe("useChat: the outbox", () => {
  it("sends one message at a time, in the order the user wrote them", async () => {
    const { sends, texts, chat, answerSend } = renderChat();

    act(() => void chat().send("one"));
    act(() => void chat().send("two"));
    act(() => void chat().send("three"));
    expect(sends.map((send) => send.text)).toEqual(["one"]);

    await answerSend(0, "7");
    expect(sends.map((send) => send.text)).toEqual(["one", "two"]);

    await answerSend(1, "8");
    await answerSend(2, "9");
    expect(texts()).toEqual(["one:sent", "two:sent", "three:sent"]);
    expect(sends).toHaveLength(3);
  });

  it("goes on with the next message when one fails", async () => {
    const { sends, texts, chat, answerSend, failSend } = renderChat();
    act(() => void chat().send("one"));
    act(() => void chat().send("two"));

    await failSend(0);
    expect(sends.map((send) => send.text)).toEqual(["one", "two"]);
    await answerSend(1, "8");

    expect(texts()).toEqual(["two:sent", "one:failed"]);
  });

  it("keeps messages waiting while there is no connection, and sends nothing", () => {
    const { sends, texts, chat } = renderChat({ isOpen: false });

    act(() => void chat().send("one"));
    act(() => void chat().send("two"));

    expect(chat().isOpen).toBe(false);
    expect(texts()).toEqual(["one:sending", "two:sending"]);
    expect(sends).toHaveLength(0);
  });

  it("sends the waiting messages in order when the connection opens", async () => {
    const { sends, connections, texts, chat, answerSend } = renderChat({ isOpen: false });
    act(() => void chat().send("one"));
    act(() => void chat().send("two"));

    act(() => connections[0].open());
    expect(chat().isOpen).toBe(true);
    expect(sends.map((send) => send.text)).toEqual(["one"]);

    await answerSend(0, "7");
    await answerSend(1, "8");
    expect(texts()).toEqual(["one:sent", "two:sent"]);
    expect(sends).toHaveLength(2);
  });

  describe("with a fake clock", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, "random").mockReturnValue(1);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("holds messages written after the connection dropped, and sends each once after the reconnect", async () => {
      const { sends, connections, texts, chat, answerSend } = renderChat();
      act(() => void chat().send("before"));
      await answerSend(0, "7");

      act(() => connections[0].drop());
      expect(chat().isOpen).toBe(false);
      act(() => void chat().send("offline one"));
      act(() => void chat().send("offline two"));
      expect(sends).toHaveLength(1);

      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(connections).toHaveLength(2);
      act(() => connections[1].open());

      await answerSend(1, "8");
      await answerSend(2, "9");
      expect(sends.map((send) => send.text)).toEqual(["before", "offline one", "offline two"]);
      expect(texts()).toEqual(["before:sent", "offline one:sent", "offline two:sent"]);
    });

    it("does not start the 10 second limit of a message while it waits for a connection", async () => {
      const { sends, connections, texts, chat } = renderChat({ isOpen: false });
      act(() => void chat().send("hello"));

      await act(() => vi.advanceTimersByTimeAsync(12_000));
      expect(texts()).toEqual(["hello:sending"]);

      act(() => connections[0].open());
      expect(sends).toHaveLength(1);
      await act(() => vi.advanceTimersByTimeAsync(9_999));
      expect(texts()).toEqual(["hello:sending"]);
    });
  });
});

describe("useChat: catching up after a reconnect", () => {
  it("asks for nothing extra when the connection was open before the first page was asked for", async () => {
    const { pages, answerPage } = renderChat();

    await answerPage(0, ["1"]);

    expect(pages).toHaveLength(1);
  });

  it("catches up after the first page when the connection opened while that page was on its way", async () => {
    const { pages, connections, chat } = renderChat({ isOpen: false });

    act(() => connections[0].open());
    expect(pages).toHaveLength(1);
    pages[0].answer.resolve({
      messages: [serverMessage("1")],
      olderCursor: null,
      newerCursor: "at-1",
    });
    await flush();

    // A message stored after the answer and before the opening is in neither of them.
    expect(pages[1]).toMatchObject({ cursor: { after: "at-1" } });
    pages[1].answer.resolve({
      messages: [serverMessage("2")],
      olderCursor: null,
      newerCursor: "at-2",
    });
    await flush();
    expect(chat().messages.map((message) => message.id)).toEqual(["1", "2"]);
  });

  it("asks for everything after the cursor of the newest page when the connection opens after it", async () => {
    const { pages, connections, chat } = renderChat({ isOpen: false });
    pages[0].answer.resolve({
      messages: [serverMessage("1")],
      olderCursor: null,
      newerCursor: "at-1",
    });
    await flush();

    act(() => connections[0].open());
    expect(pages[1]).toMatchObject({ conversationId: "c1", cursor: { after: "at-1" } });

    pages[1].answer.resolve({
      messages: [serverMessage("2")],
      olderCursor: null,
      newerCursor: "at-2",
    });
    await flush();
    expect(chat().messages.map((message) => message.id)).toEqual(["1", "2"]);
  });

  describe("with a fake clock", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, "random").mockReturnValue(1);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    /** Loads the first page, drops the connection and opens the next one. */
    async function reconnect(view: ReturnType<typeof renderChat>, nextConnection: number) {
      act(() => view.connections[nextConnection - 1].drop());
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      act(() => view.connections[nextConnection].open());
    }

    it("loads the messages it missed, shows a pushed one once, and keeps the load status", async () => {
      const view = renderChat();
      const { pages, connections, chat } = view;
      pages[0].answer.resolve({
        messages: [serverMessage("1")],
        olderCursor: "c",
        newerCursor: "at-1",
      });
      await flush();

      await reconnect(view, 1);
      expect(pages[1]).toMatchObject({ cursor: { after: "at-1" } });
      expect(chat().loadStatus).toBe("ready");

      act(() => connections[1].push({ type: "message", message: serverMessage("3") }));
      pages[1].answer.resolve({
        messages: [serverMessage("2"), serverMessage("3")],
        olderCursor: null,
        newerCursor: "at-3",
      });
      await flush();

      expect(chat().messages.map((message) => message.id)).toEqual(["1", "2", "3"]);
      expect(chat().hasOlder).toBe(true);
    });

    it("starts the next catch-up where the last one ended", async () => {
      const view = renderChat();
      const { pages } = view;
      pages[0].answer.resolve({
        messages: [serverMessage("1")],
        olderCursor: null,
        newerCursor: "at-1",
      });
      await flush();
      await reconnect(view, 1);
      pages[1].answer.resolve({
        messages: [serverMessage("2")],
        olderCursor: null,
        newerCursor: "at-2",
      });
      await flush();

      await reconnect(view, 2);

      expect(pages[2]).toMatchObject({ cursor: { after: "at-2" } });
    });

    it("asks from the same cursor again when a catch-up failed, so no message is skipped", async () => {
      const view = renderChat();
      const { pages, connections, chat } = view;
      pages[0].answer.resolve({
        messages: [serverMessage("1")],
        olderCursor: null,
        newerCursor: "at-1",
      });
      await flush();
      await reconnect(view, 1);
      pages[1].answer.reject(new Error("500"));
      await flush();
      // A newer message arrives on the connection. The hole before it stays.
      act(() => connections[1].push({ type: "message", message: serverMessage("5") }));
      expect(chat().loadStatus).toBe("ready");

      await reconnect(view, 2);

      expect(pages[2]).toMatchObject({ cursor: { after: "at-1" } });
    });

    it("does not move the catch-up cursor when an older page loads", async () => {
      const view = renderChat();
      const { pages, chat } = view;
      pages[0].answer.resolve({
        messages: [serverMessage("5")],
        olderCursor: "c5",
        newerCursor: "at-5",
      });
      await flush();
      act(() => chat().loadOlder());
      pages[1].answer.resolve({
        messages: [serverMessage("4")],
        olderCursor: null,
        newerCursor: "at-9",
      });
      await flush();

      await reconnect(view, 1);

      expect(pages[2]).toMatchObject({ cursor: { after: "at-5" } });
    });

    it("can catch up while an older page is loading", async () => {
      const view = renderChat();
      const { pages, chat } = view;
      pages[0].answer.resolve({
        messages: [serverMessage("5")],
        olderCursor: "c5",
        newerCursor: "at-5",
      });
      await flush();
      act(() => chat().loadOlder());

      await reconnect(view, 1);

      expect(pages[2]).toMatchObject({ cursor: { after: "at-5" } });
      expect(chat().loadStatus).toBe("loading");
    });

    it("ignores the catch-up of a conversation the user has left", async () => {
      const view = renderChat();
      const { pages, deps, chat, rerender } = view;
      pages[0].answer.resolve({
        messages: [serverMessage("1")],
        olderCursor: null,
        newerCursor: "at-1",
      });
      await flush();
      await reconnect(view, 1);

      rerender({ id: "c2", deps });
      expect(pages[1].signal.aborted).toBe(true);
      pages[1].answer.resolve({
        messages: [serverMessage("2")],
        olderCursor: null,
        newerCursor: "at-2",
      });
      await flush();

      expect(chat().messages).toHaveLength(0);
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
    const unknownFrame = { type: "typing", userId: "ravi" } as unknown as ServerFrame;

    expect(() => act(() => connections[0].push(unknownFrame))).not.toThrow();
    expect(chat().messages).toHaveLength(0);
  });

  it("says that the connection is not open until the server accepts it, and again after it is lost", () => {
    const { connections, chat } = renderChat({ isOpen: false });
    expect(chat().isOpen).toBe(false);

    act(() => connections[0].open());
    expect(chat().isOpen).toBe(true);

    act(() => connections[0].drop());
    expect(chat().isOpen).toBe(false);
  });

  it("does not start again when the parent passes new functions on every render", () => {
    const { pages, deps, rerender } = renderChat();

    rerender({ id: "c1", deps: { ...deps, fetchMessages: deps.fetchMessages.bind(null) } });
    rerender({ id: "c1", deps: { ...deps } });

    expect(pages).toHaveLength(1);
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
  it("empties the list, keeps the connection and loads the new conversation", async () => {
    const { pages, connections, deps, chat, answerPage, rerender } = renderChat();
    await answerPage(0, ["1"], "cursor-1");

    rerender({ id: "c2", deps });

    expect(chat().messages).toHaveLength(0);
    expect(chat().loadStatus).toBe("loading");
    // The connection belongs to the app. It stays open for the next conversation.
    expect(connections).toHaveLength(1);
    expect(connections[0].isClosed).toBe(false);
    expect(chat().isOpen).toBe(true);
    expect(pages[1]).toMatchObject({ conversationId: "c2", cursor: { before: null } });
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

    expect(pages[3]).toMatchObject({ conversationId: "c2", cursor: { before: "cursor-9" } });
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

  it("cancels every request and stops listening when the hook is removed, and leaves the connection open", () => {
    const { pages, sends, connections, chat, unmount } = renderChat();
    act(() => void chat().send("hello"));

    unmount();

    expect(pages[0].signal.aborted).toBe(true);
    expect(sends[0].signal.aborted).toBe(true);
    expect(connections[0].isClosed).toBe(false);
    expect(() =>
      connections[0].push({ type: "message", message: serverMessage("1") }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// production
// ---------------------------------------------------------------------------

const KEY = outboxKey("asha", "c1");
const storedMessage = (clientId: string, status = "sending", conversationId = "c1") => ({
  clientId,
  conversationId,
  senderId: "asha",
  text: `text ${clientId}`,
  createdAt: 1000,
  status,
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

describe("useChat production: the stored outbox", () => {
  it("stores a message that waits, and removes it when the server has confirmed it", async () => {
    const { memory, chat, answerSend } = renderChat();

    act(() => void chat().send("hello"));
    expect(JSON.parse(memory.items.get(KEY) ?? "[]")).toMatchObject([
      { text: "hello", status: "sending" },
    ]);

    await answerSend(0, "7");
    expect(memory.items.has(KEY)).toBe(false);
  });

  it("shows the messages that waited before a reload, and sends them with their old clientId", async () => {
    const stored = { [KEY]: JSON.stringify([storedMessage("old-1"), storedMessage("old-2")]) };
    const { sends, texts, answerSend } = renderChat({ stored });
    await flush();

    expect(texts()).toEqual(["text old-1:sending", "text old-2:sending"]);
    expect(sends[0]).toMatchObject({ clientId: "old-1", text: "text old-1" });

    await answerSend(0, "7");
    await answerSend(1, "8");
    expect(texts()).toEqual(["text old-1:sent", "text old-2:sent"]);
  });

  it("keeps a failed message failed after a reload, and does not send it by itself", async () => {
    const stored = { [KEY]: JSON.stringify([storedMessage("old-1", "failed")]) };
    const { sends, texts, chat } = renderChat({ stored });
    await flush();

    expect(texts()).toEqual(["text old-1:failed"]);
    expect(sends).toHaveLength(0);

    act(() => chat().retry("old-1"));
    expect(sends[0]).toMatchObject({ clientId: "old-1" });
  });

  it("shows a restored message once when the newest page already holds it", async () => {
    const stored = { [KEY]: JSON.stringify([storedMessage("old-1")]) };
    const { pages, memory, chat } = renderChat({ stored, isOpen: false });

    pages[0].answer.resolve({
      messages: [serverMessage("7", { clientId: "old-1", senderId: "asha" })],
      olderCursor: null,
      newerCursor: "at-7",
    });
    await flush();

    expect(chat().messages).toHaveLength(1);
    expect(chat().messages[0]).toMatchObject({ id: "7", status: "sent" });
    expect(memory.items.has(KEY)).toBe(false);
  });

  it("keeps the waiting messages of a conversation the user leaves, and shows them when they come back", async () => {
    const { deps, memory, texts, chat, rerender } = renderChat({ isOpen: false });
    act(() => void chat().send("for c1"));
    const setItem = vi.spyOn(memory.store, "setItem");

    rerender({ id: "c2", deps });
    await flush();
    // Not even for one draw is a message of c1 stored under the key of c2.
    expect(setItem.mock.calls.filter(([key]) => key === outboxKey("asha", "c2"))).toEqual([]);
    expect(texts()).toEqual([]);
    expect(memory.items.has(outboxKey("asha", "c2"))).toBe(false);
    expect(JSON.parse(memory.items.get(KEY) ?? "[]")).toMatchObject([{ text: "for c1" }]);

    act(() => void chat().send("for c2"));
    rerender({ id: "c1", deps });
    await flush();

    expect(texts()).toEqual(["for c1:sending"]);
    expect(JSON.parse(memory.items.get(outboxKey("asha", "c2")) ?? "[]")).toMatchObject([
      { text: "for c2" },
    ]);
  });

  it("never sends a waiting message of the old conversation into the new one", async () => {
    const { deps, sends, connections, chat, rerender } = renderChat({ isOpen: false });
    act(() => void chat().send("for c1"));

    rerender({ id: "c2", deps });
    act(() => connections[0].open());
    await flush();

    expect(sends).toHaveLength(0);
  });

  it("sends nothing of the old conversation when the connection opens in the same draw as the change", async () => {
    const { deps, sends, connections, chat, rerender } = renderChat({ isOpen: false });
    act(() => void chat().send("for c1"));

    act(() => {
      connections[0].open();
      rerender({ id: "c2", deps });
    });
    await flush();

    expect(sends).toHaveLength(0);
  });

  it("stores a message under its own conversation when it is written in the same draw as the change", async () => {
    const { deps, memory, chat, rerender } = renderChat({ isOpen: false });

    act(() => {
      chat().send("for c1");
      rerender({ id: "c2", deps });
    });
    await flush();

    expect(JSON.parse(memory.items.get(KEY) ?? "[]")).toMatchObject([{ text: "for c1" }]);
    expect(memory.items.has(outboxKey("asha", "c2"))).toBe(false);
  });

  it("stores nothing when the store is switched off", () => {
    const fake = createFakeDeps();
    fake.connections[0].open();
    const { result } = renderHook(() => useChat("c1", { ...fake.deps, store: null }));

    act(() => void result.current.send("hello"));

    expect(fake.memory.items.size).toBe(0);
    expect(fake.sends).toHaveLength(1);
  });

  it("still sends when storage throws", () => {
    const fake = createFakeDeps();
    fake.connections[0].open();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const { result } = renderHook(() => useChat("c1", { ...fake.deps, store: broken }));

    act(() => void result.current.send("hello"));

    expect(fake.sends).toHaveLength(1);
  });
});

describe("useChat production: a send that fails while the connection is down", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the message sending, and sends it again with the same clientId after the reconnect", async () => {
    const { sends, connections, events, texts, chat, failSend, answerSend } = renderChat();
    act(() => void chat().send("hello"));

    act(() => connections[0].drop());
    await failSend(0);
    expect(texts()).toEqual(["hello:sending"]);
    expect(events.filter((event) => event.type === "message_failed")).toEqual([]);

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    act(() => connections[1].open());

    expect(sends).toHaveLength(2);
    expect(sends[1].clientId).toBe(sends[0].clientId);
    await answerSend(1, "7");
    expect(texts()).toEqual(["hello:sent"]);
  });

  it("marks the message as failed when the connection is open: then it is the fault of the send", async () => {
    const { texts, chat, failSend } = renderChat();
    act(() => void chat().send("hello"));

    await failSend(0);

    expect(texts()).toEqual(["hello:failed"]);
  });
});

describe("useChat production: two tabs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends nothing for a message that another tab got confirmed while this tab waited for the lock", async () => {
    // The other tab holds the lock until the test lets go of it.
    let letGo = () => {};
    const held = new Promise<void>((resolve) => (letGo = resolve));
    const request = vi.fn((_name: string, _options: unknown, task: () => Promise<unknown>) =>
      held.then(task),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const { sends, connections, texts, chat, confirm } = renderChat();

    act(() => void chat().send("one"));
    act(() => void chat().send("two"));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(`chat-send:${chat().messages[0].clientId}`);
    expect(sends).toHaveLength(0);

    // The other tab sent it. The server pushes its copy to this tab.
    act(() => connections[0].push({ type: "message", message: confirm(chat().messages[0], "7") }));
    letGo();
    await flush();
    await flush();

    expect(sends.map((send) => send.text)).toEqual(["two"]);
    expect(texts()).toEqual(["one:sent", "two:sending"]);
  });

  it("lets go of the lock after the time limit, also when the send function never answers", async () => {
    vi.useFakeTimers();
    let held: Promise<unknown> | undefined;
    const request = vi.fn(
      (_name: string, _options: unknown, task: () => Promise<unknown>) => (held = task()),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const { deps, chat, rerender } = renderChat();
    // This function breaks the contract: it does not reject when its signal is aborted.
    rerender({ id: "c1", deps: { ...deps, sendMessage: () => new Promise<never>(() => {}) } });
    act(() => void chat().send("one"));
    let isFree = false;
    held?.catch(() => (isFree = true));

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    vi.useRealTimers();

    expect(isFree).toBe(true);
  });

  it("sends the message itself when the other tab let go of the lock without a confirmation", async () => {
    let letGo = () => {};
    const held = new Promise<void>((resolve) => (letGo = resolve));
    const request = vi.fn((_name: string, _options: unknown, task: () => Promise<unknown>) =>
      held.then(task),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const { sends, chat } = renderChat();
    act(() => void chat().send("one"));

    letGo();
    await flush();

    expect(sends.map((send) => send.text)).toEqual(["one"]);
  });
});

describe("useChat production: images", () => {
  const made: string[] = [];
  const revoked: string[] = [];
  beforeEach(() => {
    made.length = 0;
    revoked.length = 0;
    URL.createObjectURL = vi.fn(() => {
      made.push(`blob:preview-${made.length + 1}`);
      return made[made.length - 1];
    });
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
  });

  it("shows the image at once from the local file, uploads it, and then sends the address of the server", async () => {
    const { sends, uploads, chat, answerSend } = renderChat();

    let accepted = false;
    act(() => {
      accepted = chat().sendImage(imageFile("cat.png"));
    });

    expect(accepted).toBe(true);
    expect(chat().messages[0]).toMatchObject({
      text: "",
      status: "sending",
      attachment: { url: "blob:preview-1", name: "cat.png" },
      uploadProgress: 0,
    });
    expect(uploads).toHaveLength(1);
    expect(sends).toHaveLength(0);

    act(() => uploads[0].progress(0.5));
    expect(chat().messages[0].uploadProgress).toBe(0.5);

    uploads[0].answer.resolve({ url: "https://files.example/cat.png" });
    await flush();
    expect(sends[0].attachment).toEqual({ url: "https://files.example/cat.png", name: "cat.png" });

    await answerSend(0, "7");
    expect(chat().messages[0]).toMatchObject({
      id: "7",
      status: "sent",
      attachment: { url: "https://files.example/cat.png" },
    });
  });

  it("releases the local preview when the server's copy has replaced it", async () => {
    const { uploads, chat, answerSend } = renderChat();
    act(() => void chat().sendImage(imageFile()));
    expect(revoked).toEqual([]);

    uploads[0].answer.resolve({ url: "https://files.example/a.png" });
    await flush();
    await answerSend(0, "7");

    expect(revoked).toEqual(["blob:preview-1"]);
  });

  it("releases every preview when the hook is removed", () => {
    const { chat, unmount } = renderChat();
    act(() => void chat().sendImage(imageFile("a.png")));
    act(() => void chat().sendImage(imageFile("b.png")));

    unmount();

    expect(revoked.sort()).toEqual(["blob:preview-1", "blob:preview-2"]);
  });

  it.each([
    ["a file that is not an image", new File(["x"], "notes.pdf", { type: "application/pdf" })],
    ["an image over 5 MB", imageFile("huge.png", MAX_IMAGE_BYTES + 1)],
  ])("refuses %s before any byte is sent", (_name, file) => {
    const { uploads, chat } = renderChat();

    let accepted = true;
    act(() => {
      accepted = chat().sendImage(file);
    });

    expect(accepted).toBe(false);
    expect(uploads).toHaveLength(0);
    expect(chat().messages).toHaveLength(0);
    expect(made).toEqual([]);
  });

  it("refuses an image when the parent gave no upload function", () => {
    const fake = createFakeDeps();
    const { result } = renderHook(() => useChat("c1", { ...fake.deps, uploadFile: undefined }));

    let accepted = true;
    act(() => {
      accepted = result.current.sendImage(imageFile());
    });

    expect(accepted).toBe(false);
  });

  it("stops the upload, removes the message and releases the preview on cancel, and reports no failure", async () => {
    const { uploads, events, texts, chat } = renderChat();
    act(() => void chat().sendImage(imageFile()));
    act(() => void chat().send("after the image"));

    act(() => chat().cancel(chat().messages[0].clientId));
    await flush();

    expect(uploads[0].signal.aborted).toBe(true);
    expect(texts()).toEqual(["after the image:sending"]);
    expect(revoked).toEqual(["blob:preview-1"]);
    expect(events.filter((event) => event.type === "message_failed")).toEqual([]);
  });

  it("goes on with the next message after a cancel", async () => {
    const { sends, chat } = renderChat();
    act(() => void chat().sendImage(imageFile()));
    act(() => void chat().send("after the image"));

    act(() => chat().cancel(chat().messages[0].clientId));
    await flush();

    expect(sends.map((send) => send.text)).toEqual(["after the image"]);
  });

  it("marks the image as failed when the upload fails, and uploads again on Retry", async () => {
    const { uploads, events, chat } = renderChat();
    act(() => void chat().sendImage(imageFile()));

    uploads[0].answer.reject(new Error("500"));
    await flush();
    expect(chat().messages[0].status).toBe("failed");
    expect(events).toContainEqual({
      type: "message_failed",
      reason: "upload",
      hasAttachment: true,
    });

    act(() => chat().retry(chat().messages[0].clientId));
    expect(uploads).toHaveLength(2);
    expect(uploads[1].file).toBe(uploads[0].file);
  });

  it("does not upload the image again when only the send failed", async () => {
    const { sends, uploads, chat, failSend } = renderChat();
    act(() => void chat().sendImage(imageFile()));
    uploads[0].answer.resolve({ url: "https://files.example/a.png" });
    await flush();
    await failSend(0);

    act(() => chat().retry(chat().messages[0].clientId));
    await flush();

    expect(uploads).toHaveLength(1);
    expect(sends[1].attachment?.url).toBe("https://files.example/a.png");
    expect(sends[1].clientId).toBe(sends[0].clientId);
  });

  it("sends an image and the texts around it in the order the user made them", async () => {
    const { sends, uploads, chat, answerSend } = renderChat();
    act(() => void chat().send("before"));
    act(() => void chat().sendImage(imageFile()));
    act(() => void chat().send("after"));

    await answerSend(0, "7");
    expect(sends).toHaveLength(1);
    uploads[0].answer.resolve({ url: "https://files.example/a.png" });
    await flush();
    await answerSend(1, "8");
    await answerSend(2, "9");

    expect(sends.map((send) => send.text || "image")).toEqual(["before", "image", "after"]);
  });

  it("does not put a message with an image in storage", () => {
    const { memory, chat } = renderChat();

    act(() => void chat().sendImage(imageFile()));

    expect(memory.items.has(KEY)).toBe(false);
  });
});

describe("useChat production: receipts", () => {
  it("marks my messages as delivered and then as read when the receipts arrive", async () => {
    const { connections, chat, answerSend } = renderChat();
    act(() => void chat().send("hello"));
    await answerSend(0, "7");
    const upTo = chat().messages[0].createdAt;

    act(() =>
      connections[0].push({ type: "receipt", conversationId: "c1", status: "delivered", upTo }),
    );
    expect(chat().messages[0].status).toBe("delivered");

    act(() => connections[0].push({ type: "receipt", conversationId: "c1", status: "read", upTo }));
    expect(chat().messages[0].status).toBe("read");
  });

  it("ignores a receipt of another conversation", async () => {
    const { connections, chat, answerSend } = renderChat();
    act(() => void chat().send("hello"));
    await answerSend(0, "7");

    act(() =>
      connections[0].push({ type: "receipt", conversationId: "c2", status: "read", upTo: 1e15 }),
    );

    expect(chat().messages[0].status).toBe("sent");
  });

  it("tells the server once which message of the other person the user has seen", async () => {
    const { connections, answerPage } = renderChat();
    await answerPage(0, ["1", "2"]);

    const reads = () => connections[0].sent.filter((frame) => frame.type === "read");
    expect(reads()).toEqual([{ type: "read", conversationId: "c1", upTo: 2000 }]);

    act(() => connections[0].push({ type: "message", message: serverMessage("3") }));
    act(() => connections[0].push({ type: "message", message: serverMessage("3") }));
    expect(reads()).toEqual([
      { type: "read", conversationId: "c1", upTo: 2000 },
      { type: "read", conversationId: "c1", upTo: 3000 },
    ]);
  });

  it("does not count my own messages as something to read", async () => {
    const { connections, chat, answerSend } = renderChat();
    act(() => void chat().send("hello"));
    await answerSend(0, "7");

    expect(connections[0].sent.filter((frame) => frame.type === "read")).toEqual([]);
  });

  it("says nothing while the page is hidden, and tells the server when the user comes back", async () => {
    const { connections, answerPage } = renderChat();
    setVisibility("hidden");
    await answerPage(0, ["1"]);
    const reads = () => connections[0].sent.filter((frame) => frame.type === "read");
    expect(reads()).toEqual([]);

    setVisibility("visible");

    expect(reads()).toEqual([{ type: "read", conversationId: "c1", upTo: 1000 }]);
  });
});

describe("useChat production: the typing line", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const typing = (userId = "ravi", conversationId = "c1") =>
    ({ type: "typing", conversationId, userId }) as const;

  it("shows that the other person types, and stops six seconds after the last frame", async () => {
    const { connections, chat } = renderChat();
    expect(chat().isPeerTyping).toBe(false);

    act(() => connections[0].push(typing()));
    expect(chat().isPeerTyping).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(4_000));
    act(() => connections[0].push(typing()));
    await act(() => vi.advanceTimersByTimeAsync(5_999));
    expect(chat().isPeerTyping).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(chat().isPeerTyping).toBe(false);
  });

  it("stops at once when the message of that person arrives", () => {
    const { connections, chat } = renderChat();
    act(() => connections[0].push(typing()));

    act(() => connections[0].push({ type: "message", message: serverMessage("1") }));

    expect(chat().isPeerTyping).toBe(false);
  });

  it("ignores my own typing in another tab, and typing in another conversation", () => {
    const { connections, chat } = renderChat();

    act(() => connections[0].push(typing("asha")));
    act(() => connections[0].push(typing("ravi", "c2")));

    expect(chat().isPeerTyping).toBe(false);
  });

  it("stops when the connection is lost, and when the conversation changes", () => {
    const { connections, deps, chat, rerender } = renderChat();
    act(() => connections[0].push(typing()));
    act(() => connections[0].drop());
    expect(chat().isPeerTyping).toBe(false);

    const second = renderChat();
    act(() => second.connections[0].push(typing()));
    second.rerender({ id: "c2", deps: second.deps });
    expect(second.chat().isPeerTyping).toBe(false);
    rerender({ id: "c1", deps });
  });

  it("tells the server that I type at most once in three seconds", async () => {
    const { connections, chat } = renderChat();
    const typingFrames = () => connections[0].sent.filter((frame) => frame.type === "typing");

    act(() => {
      chat().notifyTyping();
      chat().notifyTyping();
      chat().notifyTyping();
    });
    expect(typingFrames()).toEqual([{ type: "typing", conversationId: "c1" }]);

    await act(() => vi.advanceTimersByTimeAsync(2_999));
    act(() => chat().notifyTyping());
    expect(typingFrames()).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(1));
    act(() => chat().notifyTyping());
    expect(typingFrames()).toHaveLength(2);
  });

  it("tells the server again at the first key press after I sent a message", () => {
    const { connections, chat } = renderChat();
    const typingFrames = () => connections[0].sent.filter((frame) => frame.type === "typing");
    act(() => chat().notifyTyping());

    act(() => void chat().send("hello"));
    act(() => chat().notifyTyping());

    expect(typingFrames()).toHaveLength(2);
  });

  it("leaves no timer of the typing line behind when the hook is removed", () => {
    const { connections, unmount } = renderChat();
    const before = vi.getTimerCount();
    act(() => connections[0].push(typing()));
    expect(vi.getTimerCount()).toBe(before + 1);

    unmount();

    expect(vi.getTimerCount()).toBe(before);
  });
});

describe("useChat production: events for monitoring", () => {
  it("reports a sent message with the time to the answer of the server", async () => {
    const { events, chat, answerSend } = renderChat();
    act(() => void chat().send("hello"));

    await answerSend(0, "7");

    const sent = events.filter((event) => event.type === "message_sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ hasAttachment: false });
    expect(sent[0].type === "message_sent" && sent[0].ackMs).toBeGreaterThanOrEqual(0);
  });

  it("reports a failed message with the reason error", async () => {
    const { events, chat, failSend } = renderChat();
    act(() => void chat().send("hello"));

    await failSend(0);

    expect(events).toContainEqual({
      type: "message_failed",
      reason: "error",
      hasAttachment: false,
    });
  });

  it("reports a time-out with the reason timeout, once", async () => {
    vi.useFakeTimers();
    const { events, chat } = renderChat();
    act(() => void chat().send("hello"));

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    vi.useRealTimers();

    expect(events.filter((event) => event.type === "message_failed")).toEqual([
      { type: "message_failed", reason: "timeout", hasAttachment: false },
    ]);
  });

  it("reports every load of history with its kind and the number of messages", async () => {
    const { pages, events, chat, answerPage } = renderChat();
    await answerPage(0, ["2", "3"], "cursor-2");
    act(() => chat().loadOlder());
    await answerPage(1, ["1"]);
    pages[0].answer.resolve({ messages: [], olderCursor: null, newerCursor: "x" });

    const loads = events.filter((event) => event.type === "history_loaded");
    expect(loads).toMatchObject([
      { kind: "newest", count: 2 },
      { kind: "older", count: 1 },
    ]);
  });

  it("never puts the text of a message, a file name or the id of a person in an event", async () => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    const secret = "my-password-is-hunter2";
    const { uploads, connections, events, chat, answerSend, failSend, answerPage } = renderChat();
    await answerPage(0, ["1"]);

    act(() => void chat().send(secret));
    await answerSend(0, "7");
    act(() => void chat().send(`${secret} again`));
    await failSend(1);
    act(() => void chat().sendImage(imageFile(`${secret}.png`)));
    uploads[0].answer.reject(new Error(secret));
    await flush();
    act(() =>
      connections[0].push({ type: "message", message: serverMessage("9", { text: secret }) }),
    );

    expect(events.length).toBeGreaterThanOrEqual(4);
    const everything = JSON.stringify(events);
    expect(everything).not.toContain("hunter2");
    expect(everything).not.toContain("asha");
    expect(everything).not.toContain("ravi");
    for (const event of events) {
      for (const value of Object.values(event)) {
        expect(["number", "boolean", "string"]).toContain(typeof value);
        if (typeof value === "string") {
          expect(value).toMatch(/^[a-z_]+$/);
        }
      }
    }
  });
});
