/*
 * PART OF THE INTERVIEW: yes (about 3 minutes).
 * Write these types first. They are the contract with the server.
 * The 60-minute answer adds: the cursor "after", `newerCursor`, the "ping"
 * and "pong" frames, and `onOpen`, `onClose` and `send` on the connection.
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
 * Loads history. Throws on every failure.
 *
 * `{ before: null }` asks for the newest page and `{ before: olderCursor }`
 * for the page before one we have. `{ after: newerCursor }` asks for
 * everything the server stored after an earlier answer: we use it to catch
 * up after the connection was lost.
 *
 * Resolves with confirmed messages, in any order. `olderCursor` is `null`
 * when there is nothing older.
 */
export type FetchMessages = (
  conversationId: string,
  cursor: { before: string | null } | { after: string },
  signal: AbortSignal,
) => Promise<{ messages: Message[]; olderCursor: string | null; newerCursor: string }>;

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
 * It answers every "ping" with a "pong".
 */
export type ServerFrame = { type: "message"; message: Message } | { type: "pong" };

/** What we send on the connection. Messages do not go this way: they use `sendMessage`. */
export type ClientFrame = { type: "ping" };

export interface ConnectionHandlers {
  onOpen: () => void;
  onFrame: (frame: ServerFrame) => void;
  /** The connection closed, or it could not open. */
  onClose: () => void;
}

/**
 * Opens one live connection, for example a WebSocket. Three rules:
 *   a. It never calls a handler before it has returned.
 *   b. After `close`, and after it called `onClose`, it never calls a
 *      handler again. A WebSocket can still deliver a message while it
 *      closes, so a wrapper removes its listeners.
 *   c. `send` never throws. It drops the frame when the connection is not open.
 */
export type Connect = (handlers: ConnectionHandlers) => {
  send: (frame: ClientFrame) => void;
  close: () => void;
};

export const MAX_MESSAGE_LENGTH = 2000;
