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
import type { ServerFrame } from "./types";

/** Lets the promises that are already settled run, and React with them. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Starts the hook. The live connection is open, unless the test says `isOpen: false`. */
function renderChat({ isOpen = true } = {}) {
  const fake = createFakeDeps();
  const view = renderHook(({ id, deps }: { id: string; deps: ChatDeps }) => useChat(id, deps), {
    initialProps: { id: "c1", deps: fake.deps },
  });
  const chat = () => view.result.current;
  const texts = () => chat().messages.map((message) => `${message.text}:${message.status}`);
  if (isOpen) {
    act(() => fake.connections[0].open());
  }

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
      expect(vi.getTimerCount()).toBe(timersOfTheConnection + 1);

      await answerSend(0, "7");
      expect(vi.getTimerCount()).toBe(timersOfTheConnection + 1);

      unmount();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
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

    it("uses the newest connect function of the parent for a reconnect", async () => {
      const { deps, connections, rerender } = renderChat();
      const newConnect = vi.fn(deps.connect);
      rerender({ id: "c1", deps: { ...deps, connect: newConnect } });

      act(() => connections[0].drop());
      await act(() => vi.advanceTimersByTimeAsync(1_000));

      expect(newConnect).toHaveBeenCalledTimes(1);
    });
  });
});

describe("useChat: catching up after a reconnect", () => {
  it("asks for nothing extra when the connection opens before the first page arrived", () => {
    const { pages } = renderChat();

    expect(pages).toHaveLength(1);
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
    expect(chat().isOpen).toBe(false);
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
