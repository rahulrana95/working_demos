/*
 * NOT PART OF THE INTERVIEW: production version.
 * It joins the three sources of messages: history (pages), the live
 * connection, and what the user sends.
 *
 * Why it holds at scale (the first six are the 60-minute answer):
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
 *      last answer of the server.
 *
 * The production version adds:
 *   7. The outbox is kept in `localStorage`. A message written before a
 *      reload, or in a conversation the user left, is still sent.
 *   8. Two tabs do not send the same waiting message at the same time
 *      (`sendLock.ts`).
 *   9. A send that fails while the connection is down is not the fault of
 *      the message. It waits and goes out again after the reconnect.
 *  10. Images: uploaded with progress, shown at once from the local file.
 *  11. Receipts ("delivered", "read"), the typing line, and events.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { newClientId } from "./clientId";
import { messagesReducer } from "./messagesReducer";
import { browserStore, loadOutbox, saveOutbox } from "./outboxStorage";
import type { OutboxStore } from "./outboxStorage";
import { withSendLock } from "./sendLock";
import type { ChatSocket } from "./socket";
import { MAX_IMAGE_BYTES, MAX_MESSAGE_LENGTH } from "./types";
import type {
  Attachment,
  ChatEvent,
  FetchMessages,
  Message,
  SendMessage,
  UploadFile,
} from "./types";

export interface ChatDeps {
  currentUserId: string;
  fetchMessages: FetchMessages;
  sendMessage: SendMessage;
  /** The connection of the app, from `createChatSocket`. */
  socket: ChatSocket;
  /** Leave it out, and images cannot be sent. */
  uploadFile?: UploadFile;
  onEvent?: (event: ChatEvent) => void;
  /** Where messages that are not confirmed are kept. The default is `localStorage`. `null`: nowhere. */
  store?: OutboxStore | null;
}

export type ChatState = ReturnType<typeof useChat>;

/** A send with no answer after this long is cancelled and marked "failed". */
const SEND_TIMEOUT_MS = 10_000;
/** An upload may take longer than a send, but not for ever. */
const UPLOAD_TIMEOUT_MS = 120_000;
/** While the user types, we say so at most this often. */
const TYPING_SEND_EVERY_MS = 3_000;
/** The typing line goes away this long after the last "typing" frame. */
const TYPING_SHOWN_MS = 6_000;

type FailureReason = Extract<ChatEvent, { type: "message_failed" }>["reason"];

function isPageVisible(): boolean {
  return document.visibilityState === "visible";
}

export function useChat(conversationId: string, deps: ChatDeps) {
  const [messages, dispatch] = useReducer(messagesReducer, []);
  /** The state of the last page request: the newest page or an older one. */
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  // `undefined`: no page has loaded yet. `null`: there is nothing older.
  const [olderCursor, setOlderCursor] = useState<string | null>();
  /** False until the live connection is open, and again after it is lost. */
  const [isOpen, setIsOpen] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [isVisible, setIsVisible] = useState(isPageVisible);
  /**
   * The conversation that `messages` belongs to. For one draw after the
   * conversation changed, `messages` still holds the old conversation. No
   * effect may send or store anything in that draw.
   */
  const [messagesOf, setMessagesOf] = useState<string | null>(null);
  /** Changed after every send, so the outbox effect looks for the next message. */
  const [outboxTurn, setOutboxTurn] = useState(0);

  const { socket, currentUserId } = deps;
  const store = deps.store === undefined ? browserStore() : deps.store;

  // The connection and the outbox call our functions long after the render
  // that made them. They read the newest values from here.
  const latest = useRef({ deps, messages });
  useEffect(() => {
    latest.current = { deps, messages };
  });

  /** Aborted when the user leaves the conversation. */
  const left = useRef(new AbortController());
  const isLoadingPage = useRef(false);
  /** Where the last answer of the server ended. The catch-up starts here. */
  const newerCursor = useRef<string>();
  /** The send that is on its way, and its message. There is never more than one. */
  const sending = useRef<{ controller: AbortController; clientId: string } | null>(null);
  /** The files of the images that are not confirmed, by `clientId`. */
  const files = useRef(new Map<string, File>());
  /** Images that are on the server already. A retry does not upload them again. */
  const uploaded = useRef(new Map<string, Attachment>());
  /** The `blob:` addresses we made for previews. Each must be released. */
  const previews = useRef(new Map<string, string>());
  const cancelled = useRef(new Set<string>());
  const lastTypingSentAt = useRef(0);
  const lastReadSent = useRef(0);

  /** Loads a page of history, or everything after a cursor (the catch-up). */
  async function load(cursor: Parameters<FetchMessages>[1]) {
    const isPage = "before" in cursor;
    const isNewest = isPage && cursor.before === null;
    if (isPage && isLoadingPage.current) {
      return; // One page at a time. A second call while one loads is ignored.
    }
    if (isPage) {
      isLoadingPage.current = true;
      setLoadStatus("loading");
    }
    const { signal } = left.current;
    const startedAt = performance.now();
    const wasOpen = socket.isOpen();
    const request = latest.current.deps.fetchMessages(conversationId, cursor, signal);
    const page = await request.catch(() => null);
    if (signal.aborted) {
      return; // The user has left this conversation. Its answer is not needed.
    }
    if (page !== null) {
      dispatch({ type: "received", messages: page.messages });
      // Only the newest page and a catch-up end where the server is now.
      if (!isPage || isNewest) {
        newerCursor.current = page.newerCursor;
      }
      latest.current.deps.onEvent?.({
        type: "history_loaded",
        kind: isNewest ? "newest" : isPage ? "older" : "catch_up",
        count: page.messages.length,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
    if (isPage) {
      isLoadingPage.current = false;
      setLoadStatus(page === null ? "error" : "ready");
      setOlderCursor((current) => (page === null ? current : page.olderCursor));
    }
    // The connection opened while the newest page was on its way. A message
    // stored between the answer and the opening is in neither of them.
    if (page !== null && isNewest && !wasOpen && socket.isOpen()) {
      load({ after: page.newerCursor });
    }
  }

  // This effect runs again only for a new conversation. `load` reads refs,
  // `conversationId` and setters, so an old copy of it does the same as the
  // newest one.
  useEffect(() => {
    const stored = store ? loadOutbox(store, currentUserId, conversationId) : [];
    dispatch({ type: "reset" });
    dispatch({ type: "restored", messages: stored });
    setMessagesOf(conversationId);
    setOlderCursor(undefined);
    setIsPeerTyping(false);
    setIsOpen(socket.isOpen());
    left.current = new AbortController();
    lastReadSent.current = 0;
    lastTypingSentAt.current = 0;
    load({ before: null });

    let typingTimerId: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = socket.subscribe({
      onFrame: (frame) => {
        // A server can add new kinds of frames. We skip what we do not know.
        if (frame.type === "pong") {
          return;
        }
        const frameConversationId =
          frame.type === "message" ? frame.message.conversationId : frame.conversationId;
        if (frameConversationId !== conversationId) {
          return;
        }
        if (frame.type === "message") {
          dispatch({ type: "received", messages: [frame.message] });
        } else if (frame.type === "receipt") {
          const { status, upTo } = frame;
          dispatch({ type: "receipt", senderId: currentUserId, status, upTo });
        }
        // The typing line: shown by a "typing" frame, ended by a message of that person.
        const fromPeer = frame.type === "message" ? frame.message.senderId : undefined;
        if (frame.type === "typing" && frame.userId !== currentUserId) {
          setIsPeerTyping(true);
          clearTimeout(typingTimerId);
          typingTimerId = setTimeout(() => setIsPeerTyping(false), TYPING_SHOWN_MS);
        } else if (fromPeer !== undefined && fromPeer !== currentUserId) {
          setIsPeerTyping(false);
        }
      },
      onStatus: (isOpenNow) => {
        setIsOpen(isOpenNow);
        // Catch up: ask for what the server stored while we were not connected.
        if (isOpenNow && newerCursor.current !== undefined) {
          load({ after: newerCursor.current });
        }
        if (!isOpenNow) {
          setIsPeerTyping(false);
        }
      },
    });

    return () => {
      unsubscribe();
      clearTimeout(typingTimerId);
      left.current.abort();
      sending.current?.controller.abort();
      sending.current = null;
      isLoadingPage.current = false;
      newerCursor.current = undefined;
      files.current.clear();
      uploaded.current.clear();
      cancelled.current.clear();
    };
  }, [conversationId, socket, currentUserId]);

  // The outbox. The messages that wait are in `messages` already: the ones
  // with the status "sending", in the order the user wrote them. This effect
  // sends the first one. Every send ends with a new `outboxTurn`, so the
  // effect runs again and sends the next one. Without a connection they wait.
  useEffect(() => {
    const next = messages.find((message) => message.status === "sending");
    if (
      next === undefined ||
      !isOpen ||
      sending.current !== null ||
      messagesOf !== conversationId
    ) {
      return;
    }
    const controller = new AbortController();
    const { clientId, text } = next;
    sending.current = { controller, clientId };
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let reason: FailureReason = "error";
    let sendStartedAt = 0;

    const settle = (confirmed: Message | null) => {
      clearTimeout(timerId);
      controller.abort();
      // False after a time-out, and when the conversation changed.
      if (sending.current?.controller !== controller) {
        return;
      }
      sending.current = null;
      setOutboxTurn((turn) => turn + 1);
      const { onEvent } = latest.current.deps;
      const hasAttachment = next.attachment !== undefined;
      if (cancelled.current.delete(clientId)) {
        return; // The user removed the message. That is not a failure.
      }
      if (confirmed !== null) {
        files.current.delete(clientId);
        uploaded.current.delete(clientId);
        dispatch({ type: "received", messages: [confirmed] });
        const ackMs = Math.round(performance.now() - sendStartedAt);
        onEvent?.({ type: "message_sent", ackMs, hasAttachment });
      } else if (socket.isOpen()) {
        dispatch({ type: "failed", clientId });
        onEvent?.({ type: "message_failed", reason, hasAttachment });
      }
      // Else the connection is down, so the send could not work. The message
      // stays "sending" and goes out again when the connection is back.
    };

    /** A step that never ends would block every message behind it. So each step has a limit. */
    const limit = (ms: number, why: FailureReason) => {
      clearTimeout(timerId);
      reason = why;
      timerId = setTimeout(() => settle(null), ms);
    };

    const task = async (): Promise<Message | null> => {
      // We may have waited for another tab that was sending this message. If
      // its copy has arrived, the message is confirmed and we send nothing.
      const now = latest.current.messages.find((message) => message.clientId === clientId);
      if (now?.status !== "sending") {
        cancelled.current.add(clientId);
        return null;
      }
      let attachment = uploaded.current.get(clientId);
      const file = files.current.get(clientId);
      const { uploadFile, sendMessage } = latest.current.deps;
      if (next.attachment !== undefined && attachment === undefined) {
        limit(UPLOAD_TIMEOUT_MS, "upload");
        if (file === undefined || uploadFile === undefined) {
          throw new Error("The file of this image is gone.");
        }
        const onProgress = (fraction: number) => dispatch({ type: "progress", clientId, fraction });
        const { url } = await uploadFile(file, { signal: controller.signal, onProgress });
        attachment = { url, name: file.name };
        uploaded.current.set(clientId, attachment);
      }
      limit(SEND_TIMEOUT_MS, "timeout");
      sendStartedAt = performance.now();
      return sendMessage({ clientId, conversationId, text, attachment }, controller.signal);
    };
    // The lock is held until the task ends. A function that does not react to
    // the abort must not hold it, so the abort itself also ends the task.
    const untilAborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("aborted")), {
        once: true,
      });
    });

    withSendLock(clientId, controller.signal, () => Promise.race([task(), untilAborted])).then(
      settle,
      () => {
        // A rejection that is not from a time limit is a plain error. An upload keeps its own word.
        reason = reason === "timeout" ? "error" : reason;
        settle(null);
      },
    );
  }, [messages, isOpen, outboxTurn, messagesOf]);

  // Keeps the messages that are not confirmed, so they survive a reload. They
  // are stored under the conversation they belong to, which for one draw is
  // not the conversation that is open.
  useEffect(() => {
    if (store && messagesOf !== null) {
      saveOutbox(store, currentUserId, messagesOf, messages);
    }
  }, [messages, messagesOf]);

  // Releases the preview of an image when the server's copy has replaced it,
  // and when the message is gone. A `blob:` address keeps its file in memory
  // until it is released or the page is closed.
  useEffect(() => {
    previews.current.forEach((url, clientId) => {
      const message = messages.find((candidate) => candidate.clientId === clientId);
      if (message === undefined || message.id !== undefined) {
        URL.revokeObjectURL(url);
        previews.current.delete(clientId);
      }
    });
  }, [messages]);
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Read receipts. We tell the server once for each new message of the other
  // person, and only while the user can see the page.
  useEffect(() => {
    const update = () => setIsVisible(isPageVisible());
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const newestIncoming = messages.reduce(
    (newest, message) =>
      message.id !== undefined && message.senderId !== currentUserId
        ? Math.max(newest, message.createdAt)
        : newest,
    0,
  );
  useEffect(() => {
    const canSend = isOpen && isVisible && messagesOf === conversationId;
    if (canSend && newestIncoming > lastReadSent.current) {
      lastReadSent.current = newestIncoming;
      socket.send({ type: "read", conversationId, upTo: newestIncoming });
    }
  }, [newestIncoming, isOpen, isVisible, messagesOf]);

  function add(fields: Pick<Message, "text" | "attachment" | "uploadProgress">): string {
    const clientId = newClientId();
    const base = { clientId, conversationId, senderId: currentUserId, createdAt: Date.now() };
    // The outbox effect above sends it.
    dispatch({ type: "added", message: { ...base, ...fields, status: "sending" } });
    // Our message ends the typing line on the other side. The next key press must start it again.
    lastTypingSentAt.current = 0;
    return clientId;
  }

  /** Returns false when the text is empty or too long. Nothing is sent then. */
  function send(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.length > MAX_MESSAGE_LENGTH) {
      return false;
    }
    add({ text: trimmed });
    return true;
  }

  /** Returns false when the file is not an image, is too large, or images are switched off. */
  function sendImage(file: File): boolean {
    const isAllowed = file.type.startsWith("image/") && file.size <= MAX_IMAGE_BYTES;
    if (deps.uploadFile === undefined || !isAllowed) {
      return false;
    }
    // The user sees the image at once, from the file on their own computer.
    const url = URL.createObjectURL(file);
    const clientId = add({ text: "", attachment: { url, name: file.name }, uploadProgress: 0 });
    files.current.set(clientId, file);
    previews.current.set(clientId, url);
    return true;
  }

  /** Puts a failed message back in the outbox. It keeps its `clientId`. */
  function retry(clientId: string) {
    dispatch({ type: "retried", clientId });
  }

  /** Removes a message that is not confirmed, and stops its upload or send. */
  function cancel(clientId: string) {
    if (sending.current?.clientId === clientId) {
      cancelled.current.add(clientId);
      sending.current.controller.abort();
    }
    files.current.delete(clientId);
    uploaded.current.delete(clientId);
    dispatch({ type: "removed", clientId });
  }

  /** Loads the page before the oldest one we have. After an error, it asks for the same page again. */
  function loadOlder() {
    if (olderCursor !== null) {
      load({ before: olderCursor ?? null });
    }
  }

  /** Call it when the user types. The other person is told at most once in three seconds. */
  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAt.current >= TYPING_SEND_EVERY_MS) {
      lastTypingSentAt.current = now;
      socket.send({ type: "typing", conversationId });
    }
  }

  // `messages`: the confirmed ones in server order, then the ones not confirmed yet.
  return {
    messages,
    loadStatus,
    hasOlder: olderCursor !== null,
    isOpen,
    isPeerTyping,
    loadOlder,
    send,
    sendImage,
    retry,
    cancel,
    notifyTyping,
  };
}
