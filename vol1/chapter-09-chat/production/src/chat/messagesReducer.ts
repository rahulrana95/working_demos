/*
 * NOT PART OF THE INTERVIEW: production version.
 * The interview versions have "reset", "added", "received", "failed" and
 * "retried". The production version adds receipts, a status that never goes
 * back, messages restored from storage, upload progress and "removed".
 *
 * Why it holds at scale:
 *   1. One entry for one `clientId`. The answer to our send, the copy the
 *      server pushes to everyone, and a page of history can all carry the
 *      same message. It is on screen once.
 *   2. Confirmed messages are ordered by the server's clock, never by ours
 *      and never by the order they arrived in.
 *   3. Messages that are not confirmed stay at the bottom, in the order the
 *      user wrote them.
 *   4. A status only moves forward. A copy that says "sent" and arrives
 *      after the receipt "read" changes nothing.
 */
import type { Message, MessageStatus } from "./types";

export type MessagesAction =
  | { type: "reset" }
  /** The user pressed Send. The message has no server `id` yet. */
  | { type: "added"; message: Message }
  /** Confirmed messages from the server: an answer to a send, a live frame, a page of history. */
  | { type: "received"; messages: Message[] }
  | { type: "failed"; clientId: string }
  | { type: "retried"; clientId: string }
  /** Messages that were not confirmed when the page was closed. They come from storage. */
  | { type: "restored"; messages: Message[] }
  /** The other person got, or read, every message of `senderId` up to the server time `upTo`. */
  | { type: "receipt"; senderId: string; status: "delivered" | "read"; upTo: number }
  | { type: "progress"; clientId: string; fraction: number }
  /** The user cancelled a message that was not confirmed. */
  | { type: "removed"; clientId: string };

/** A higher number is further along. "failed" and "sending" are before every confirmed status. */
const STATUS_RANK: Record<MessageStatus, number> = {
  failed: 0,
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export function messagesReducer(state: Message[], action: MessagesAction): Message[] {
  switch (action.type) {
    case "reset":
      return [];
    case "added":
      return [...state, action.message];
    case "received":
      return mergeConfirmed(state, action.messages);
    case "failed":
      // Only a message that is still sending can fail. If the server's copy
      // came first, the message is confirmed and a late error must not hide that.
      return changeStatus(state, action.clientId, "sending", "failed");
    case "retried":
      return changeStatus(state, action.clientId, "failed", "sending");
    case "restored": {
      const known = new Set(state.map((message) => message.clientId));
      return [...state, ...action.messages.filter((message) => !known.has(message.clientId))];
    }
    case "receipt":
      return state.map((message) =>
        message.id !== undefined &&
        message.senderId === action.senderId &&
        message.createdAt <= action.upTo &&
        STATUS_RANK[message.status] < STATUS_RANK[action.status]
          ? { ...message, status: action.status }
          : message,
      );
    case "progress":
      return state.map((message) =>
        message.clientId === action.clientId && message.id === undefined
          ? { ...message, uploadProgress: action.fraction }
          : message,
      );
    case "removed":
      return state.filter(
        (message) => message.clientId !== action.clientId || message.id !== undefined,
      );
  }
}

function changeStatus(state: Message[], clientId: string, from: MessageStatus, to: MessageStatus) {
  return state.map((message) =>
    message.clientId === clientId && message.status === from ? { ...message, status: to } : message,
  );
}

function mergeConfirmed(state: Message[], incoming: Message[]): Message[] {
  const byClientId = new Map(state.map((message) => [message.clientId, message]));
  for (const message of incoming) {
    const known = byClientId.get(message.clientId);
    // The status never goes back: keep the higher one of the two copies.
    const isBehind = known !== undefined && STATUS_RANK[known.status] > STATUS_RANK[message.status];
    byClientId.set(message.clientId, isBehind ? { ...message, status: known.status } : message);
  }

  const all = [...byClientId.values()];
  const confirmed = all.filter((message) => message.id !== undefined).sort(byServerOrder);
  // A Map keeps the order of insertion, so these stay in the order the user wrote them.
  const waiting = all.filter((message) => message.id === undefined);
  return [...confirmed, ...waiting];
}

/** Server time first. Two messages of the same millisecond are ordered by `id`. */
function byServerOrder(a: Message, b: Message): number {
  return a.createdAt - b.createdAt || ((a.id ?? "") < (b.id ?? "") ? -1 : 1);
}
