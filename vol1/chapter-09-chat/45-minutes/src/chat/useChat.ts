/*
 * PART OF THE INTERVIEW: yes (about 14 minutes).
 * Write it after the reducer. It joins the three sources of messages:
 * history (pages), the live connection, and what the user sends.
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
 */
import { useEffect, useReducer, useRef, useState } from "react";
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

  const pageRequest = useRef<AbortController | null>(null);
  /** One entry for each send that waits for its answer. */
  const sendsInFlight = useRef(new Set<AbortController>());

  async function loadPage(beforeCursor: string | null) {
    if (pageRequest.current !== null) {
      return; // One page at a time. A second call while one loads is ignored.
    }
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadStatus("loading");

    const request = deps.fetchMessages(conversationId, beforeCursor, controller.signal);
    const page = await request.catch(() => null);
    if (controller.signal.aborted) {
      return; // The user has left this conversation. Its answer is not needed.
    }
    pageRequest.current = null;
    setLoadStatus(page === null ? "error" : "ready");
    if (page !== null) {
      dispatch({ type: "received", messages: page.messages });
      setOlderCursor(page.olderCursor);
    }
  }

  // This effect runs again only for a new conversation. It may read `deps`
  // and `loadPage` of the render it runs in: they are the newest ones then.
  useEffect(() => {
    dispatch({ type: "reset" });
    setOlderCursor(undefined);
    loadPage(null);

    const connection = deps.connect({
      onFrame: (frame) => {
        // A server can add new kinds of frames. We skip what we do not know.
        if (frame.type === "message" && frame.message.conversationId === conversationId) {
          dispatch({ type: "received", messages: [frame.message] });
        }
      },
    });

    return () => {
      connection.close();
      pageRequest.current?.abort();
      pageRequest.current = null;
      sendsInFlight.current.forEach((controller) => controller.abort());
      sendsInFlight.current.clear();
    };
  }, [conversationId]);

  async function deliver({ clientId, text }: Message) {
    const controller = new AbortController();
    sendsInFlight.current.add(controller);
    // `sendMessage` rejects when its signal is aborted, so a time-out ends as a failure.
    const timerId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    const request = deps.sendMessage({ clientId, conversationId, text }, controller.signal);
    const confirmed = await request.catch(() => null);
    clearTimeout(timerId);
    // `delete` gives false when the conversation changed: the message is not on screen any more.
    if (sendsInFlight.current.delete(controller)) {
      dispatch(
        confirmed ? { type: "received", messages: [confirmed] } : { type: "failed", clientId },
      );
    }
  }

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
    dispatch({ type: "added", message });
    deliver(message);
    return true;
  }

  /**
   * Sends a failed message again, with the same `clientId`. A second click
   * does nothing: React has drawn the message as "sending" before it runs.
   */
  function retry(clientId: string) {
    const message = messages.find((candidate) => candidate.clientId === clientId);
    if (message?.status === "failed") {
      dispatch({ type: "retried", clientId });
      deliver(message);
    }
  }

  /** Loads the page before the oldest one we have. After an error, it asks for the same page again. */
  function loadOlder() {
    if (olderCursor !== null) {
      loadPage(olderCursor ?? null);
    }
  }

  // `messages`: the confirmed ones in server order, then the ones not confirmed yet.
  return { messages, loadStatus, hasOlder: olderCursor !== null, loadOlder, send, retry };
}
