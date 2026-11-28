/*
 * PART OF THE INTERVIEW: yes (about 19 minutes).
 * Write it after the reducer. It joins the three sources of messages:
 * history (pages), the live connection, and what the user sends.
 * The 60-minute answer adds the outbox and the catch-up after a reconnect.
 *
 * Why it holds at scale:
 *   1. History comes in pages. We load the newest page first and an older
 *      one only when the user asks.
 *   2. A message is on screen at once, before the server answers. The
 *      `clientId` then joins the answer to it, so it is never shown twice.
 *   3. A send that gets no answer fails after a time limit. "Retry" sends the
 *      same `clientId`, so the server can tell a repeat from a new message.
 *   4. Every request is cancelled when the conversation changes, and an
 *      answer that still arrives is ignored.
 *   5. Outbox: one send at a time, in the order the user wrote them. Without
 *      a connection the messages wait, and go out when it is back.
 *   6. Catch-up: after a reconnect we ask for everything stored since the
 *      last answer of the server, so a message pushed while we were away is
 *      not lost.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { openReliableConnection } from "./connection";
import { messagesReducer } from "./messagesReducer";
import { MAX_MESSAGE_LENGTH } from "./types";
import type { Connect, FetchMessages, Message, SendMessage } from "./types";

export interface ChatDeps {
  currentUserId: string;
  fetchMessages: FetchMessages;
  sendMessage: SendMessage;
  connect: Connect;
}

export type ChatState = ReturnType<typeof useChat>;

/** A send with no answer after this long is cancelled and marked "failed". */
const SEND_TIMEOUT_MS = 10_000;

export function useChat(conversationId: string, deps: ChatDeps) {
  const [messages, dispatch] = useReducer(messagesReducer, []);
  /** The state of the last page request: the newest page or an older one. */
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  // `undefined`: no page has loaded yet. `null`: there is nothing older.
  const [olderCursor, setOlderCursor] = useState<string | null>();
  /** False until the live connection is open, and again after it is lost. */
  const [isOpen, setIsOpen] = useState(false);

  // The connection calls our functions long after the render that made
  // them. They read the newest functions of the parent from here.
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  /** Aborted when the user leaves the conversation. */
  const left = useRef(new AbortController());
  const isLoadingPage = useRef(false);
  /** Where the last answer of the server ended. The catch-up starts here. */
  const newerCursor = useRef<string>();
  /** The send that is on its way. There is never more than one. */
  const sending = useRef<AbortController | null>(null);

  /** Loads a page of history, or everything after a cursor (the catch-up). */
  async function load(cursor: Parameters<FetchMessages>[1]) {
    const isPage = "before" in cursor;
    if (isPage && isLoadingPage.current) {
      return; // One page at a time. A second call while one loads is ignored.
    }
    if (isPage) {
      isLoadingPage.current = true;
      setLoadStatus("loading");
    }
    const { signal } = left.current;
    const request = depsRef.current.fetchMessages(conversationId, cursor, signal);
    const page = await request.catch(() => null);
    if (signal.aborted) {
      return; // The user has left this conversation. Its answer is not needed.
    }
    if (page !== null) {
      dispatch({ type: "received", messages: page.messages });
      // Only the newest page and a catch-up end where the server is now.
      newerCursor.current =
        isPage && cursor.before !== null ? newerCursor.current : page.newerCursor;
    }
    if (isPage) {
      isLoadingPage.current = false;
      setLoadStatus(page === null ? "error" : "ready");
      setOlderCursor((current) => (page === null ? current : page.olderCursor));
    }
  }

  // This effect runs again only for a new conversation. `load` reads refs,
  // `conversationId` and setters, so an old copy of it does the same as the
  // newest one.
  useEffect(() => {
    dispatch({ type: "reset" });
    setOlderCursor(undefined);
    left.current = new AbortController();
    load({ before: null });

    const closeConnection = openReliableConnection(
      (handlers) => depsRef.current.connect(handlers),
      (frame) => {
        // A server can add new kinds of frames. We skip what we do not know.
        if (frame.type === "message" && frame.message.conversationId === conversationId) {
          dispatch({ type: "received", messages: [frame.message] });
        }
      },
      (isOpenNow) => {
        setIsOpen(isOpenNow);
        // Catch up: ask for what the server stored while we were not connected.
        if (isOpenNow && newerCursor.current !== undefined) {
          load({ after: newerCursor.current });
        }
      },
    );

    return () => {
      closeConnection();
      setIsOpen(false);
      left.current.abort();
      sending.current?.abort();
      sending.current = null;
      isLoadingPage.current = false;
      newerCursor.current = undefined;
    };
  }, [conversationId]);

  // The outbox. The messages that wait are in `messages` already: the ones
  // with the status "sending", in the order the user wrote them. This effect
  // sends the first one. The answer changes the list, so the effect runs
  // again and sends the next one. Without a connection they all wait.
  useEffect(() => {
    const next = messages.find((message) => message.status === "sending");
    // For one draw after the conversation changed, `messages` still holds the
    // old conversation. Its messages must not go out under the new one.
    if (next?.conversationId !== conversationId || !isOpen || sending.current !== null) {
      return;
    }
    const controller = new AbortController();
    sending.current = controller;
    const { clientId, text } = next;

    const settle = (confirmed: Message | null) => {
      clearTimeout(timerId);
      controller.abort();
      // False after a time-out, and when the conversation changed.
      if (sending.current === controller) {
        sending.current = null;
        dispatch(
          confirmed ? { type: "received", messages: [confirmed] } : { type: "failed", clientId },
        );
      }
    };
    // A send that never ends would block every message behind it. So the time
    // limit ends the wait itself, and does not trust `sendMessage` to reject.
    // `settle` also aborts the request: after an answer that does nothing.
    const timerId = setTimeout(() => settle(null), SEND_TIMEOUT_MS);
    const request = deps.sendMessage({ clientId, conversationId, text }, controller.signal);
    request.then(settle, () => settle(null));
  }, [messages, isOpen]);

  /** Returns false when the text is empty or too long. Nothing is sent then. */
  function send(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.length > MAX_MESSAGE_LENGTH) {
      return false;
    }
    const message: Message = {
      clientId: crypto.randomUUID(),
      conversationId,
      senderId: deps.currentUserId,
      text: trimmed,
      createdAt: Date.now(),
      status: "sending",
    };
    // The outbox effect below sends it.
    dispatch({ type: "added", message });
    return true;
  }

  /** Puts a failed message back in the outbox. It keeps its `clientId`. */
  function retry(clientId: string) {
    dispatch({ type: "retried", clientId });
  }

  /** Loads the page before the oldest one we have. After an error, it asks for the same page again. */
  function loadOlder() {
    if (olderCursor !== null) {
      load({ before: olderCursor ?? null });
    }
  }

  // `messages`: the confirmed ones in server order, then the ones not confirmed yet.
  return { messages, loadStatus, hasOlder: olderCursor !== null, isOpen, loadOlder, send, retry };
}
