/*
 * PART OF THE INTERVIEW: yes (about 7 minutes).
 * Write it right after the types. It is a pure function, so you can explain
 * every case of the message list without a browser.
 *
 * Why it holds at scale:
 *   1. One entry for one `clientId`. The answer to our send, the copy the
 *      server pushes to everyone, and a page of history can all carry the
 *      same message. It is on screen once.
 *   2. Confirmed messages are ordered by the server's clock, never by ours
 *      and never by the order they arrived in.
 *   3. Messages that are not confirmed stay at the bottom, in the order the
 *      user wrote them.
 */
import type { Message, MessageStatus } from "./types";

export type MessagesAction =
  | { type: "reset" }
  /** The user pressed Send. The message has no server `id` yet. */
  | { type: "added"; message: Message }
  /** Confirmed messages from the server: an answer to a send, a live frame, a page of history. */
  | { type: "received"; messages: Message[] }
  | { type: "failed"; clientId: string }
  | { type: "retried"; clientId: string };

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
    byClientId.set(message.clientId, message);
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
