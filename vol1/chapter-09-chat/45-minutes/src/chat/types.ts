/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Write these types first. They are the contract with the server.
 */

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface Message {
  /** Given by the server. It is absent until the server has confirmed the message. */
  id?: string;
  /** Made by the client that wrote the message. It never changes. */
  clientId: string;
  conversationId: string;
  senderId: string;
  text: string;
  /** Milliseconds. Our own clock while the message is sending, the server's clock after. */
  createdAt: number;
  status: MessageStatus;
}

/**
 * Loads one page of history. `beforeCursor` is `null` for the newest page.
 * Resolves with confirmed messages, in any order, and with `olderCursor`:
 * pass it back to get the page before this one. `null` means there is
 * nothing older. Throws on every failure.
 */
export type FetchMessages = (
  conversationId: string,
  beforeCursor: string | null,
  signal: AbortSignal,
) => Promise<{ messages: Message[]; olderCursor: string | null }>;

/**
 * Stores one message and resolves with the confirmed copy: with its `id`, the
 * server's `createdAt` and the status "sent". Throws on every failure, and
 * when the signal is aborted, as `fetch` does.
 *
 * The server must remember the `clientId`. When it gets the same `clientId`
 * again, it answers with the message it already stored and stores nothing new.
 * This is what makes "Retry" safe after an answer that was lost on the way.
 */
export type SendMessage = (
  message: Pick<Message, "clientId" | "conversationId" | "text">,
  signal: AbortSignal,
) => Promise<Message>;

/**
 * What the server pushes to us. It sends every new message to everyone in
 * the conversation, also back to the sender, always with its `clientId`.
 */
export type ServerFrame = { type: "message"; message: Message };

/**
 * Opens the live connection, for example a WebSocket. After `close`, the
 * function must never call `onFrame` again. A WebSocket can still deliver a
 * message while it closes, so a wrapper must remove its listener in `close`.
 */
export type Connect = (handlers: { onFrame: (frame: ServerFrame) => void }) => {
  close: () => void;
};

export const MAX_MESSAGE_LENGTH = 2000;
