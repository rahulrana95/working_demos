/*
 * NOT PART OF THE INTERVIEW: production version.
 * Keeps the messages that are not confirmed in `localStorage`, so they
 * survive a reload and a closed tab. Storage can be full, switched off or
 * changed by anyone with the developer tools: every call may fail, and what
 * comes back is checked before it is used.
 */
import { MAX_MESSAGE_LENGTH } from "./types";
import type { Message } from "./types";

/** The part of `Storage` we use. Tests pass a fake one. */
export type OutboxStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MAX_STORED = 100;

/** One key for one person and one conversation. Another account on the same computer gets other keys. */
export function outboxKey(userId: string, conversationId: string): string {
  return `chat-outbox:${userId}:${conversationId}`;
}

function isStoredMessage(
  value: unknown,
  conversationId: string,
  senderId: string,
): value is Message {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    typeof message.clientId === "string" &&
    message.clientId !== "" &&
    typeof message.text === "string" &&
    message.text.length <= MAX_MESSAGE_LENGTH &&
    typeof message.createdAt === "number" &&
    Number.isFinite(message.createdAt) &&
    message.conversationId === conversationId &&
    message.senderId === senderId &&
    (message.status === "sending" || message.status === "failed")
  );
}

/** The messages that were not confirmed when the page was closed. An empty list when anything is wrong. */
export function loadOutbox(store: OutboxStore, userId: string, conversationId: string): Message[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(outboxKey(userId, conversationId)) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value) => isStoredMessage(value, conversationId, userId))
      .slice(0, MAX_STORED)
      .map(({ clientId, text, createdAt, status }) => ({
        clientId,
        conversationId,
        senderId: userId,
        text,
        createdAt,
        status,
      }));
  } catch {
    return [];
  }
}

/**
 * Stores the messages that are not confirmed. A message with an image is
 * left out: a file cannot be kept in `localStorage`.
 */
export function saveOutbox(
  store: OutboxStore,
  userId: string,
  conversationId: string,
  messages: Message[],
): void {
  const waiting = messages
    .filter((message) => message.id === undefined && message.attachment === undefined)
    .slice(-MAX_STORED);
  try {
    if (waiting.length === 0) {
      store.removeItem(outboxKey(userId, conversationId));
    } else {
      store.setItem(outboxKey(userId, conversationId), JSON.stringify(waiting));
    }
  } catch {
    // Storage is full or switched off. The messages still go out from memory.
  }
}

/** `localStorage`, or nothing when the browser does not give it (private mode, a blocked cookie setting). */
export function browserStore(): OutboxStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
