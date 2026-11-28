/*
 * NOT PART OF THE INTERVIEW: production version.
 * The interview versions have the message, the two request functions and the
 * connection. The production version adds attachments, receipts, typing,
 * long polling, the conversation list and the events for monitoring.
 */

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface Attachment {
  /** Where the image is. A `blob:` address of this page while it uploads, the server's address after. */
  url: string;
  /** The file name. It is the text alternative of the image. */
  name: string;
}

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
  attachment?: Attachment;
  /** From 0 to 1 while the image uploads. Only this page knows it. */
  uploadProgress?: number;
}

/**
 * Loads history. Throws on every failure, and when the signal is aborted.
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
 * This is what makes "Retry" safe after an answer that was lost on the way,
 * and what makes two tabs that send the same message harmless.
 */
export type SendMessage = (
  message: Pick<Message, "clientId" | "conversationId" | "text" | "attachment">,
  signal: AbortSignal,
) => Promise<Message>;

/**
 * Uploads one file and resolves with its address on the server. Throws on
 * failure and when the signal is aborted. `onProgress` gets a number from 0
 * to 1. `fetch` cannot report the progress of an upload, so a real function
 * uses `XMLHttpRequest`: see `src/api/xhrUpload.ts`.
 */
export type UploadFile = (
  file: File,
  options: { signal: AbortSignal; onProgress: (fraction: number) => void },
) => Promise<{ url: string }>;

/** One row of the conversation list, as the server gives it. */
export interface ConversationSummary {
  id: string;
  /** The name of the other person. */
  title: string;
  /** Absent for a conversation with no message yet. */
  lastMessage?: Pick<Message, "senderId" | "text" | "createdAt" | "attachment">;
  unreadCount: number;
}

export type FetchConversations = (signal: AbortSignal) => Promise<ConversationSummary[]>;

/**
 * What the server pushes to us.
 *   - "message": a new message, sent to everyone in the conversation, also
 *     back to the sender, always with its `clientId`.
 *   - "receipt": every message of ours in that conversation with a server
 *     time up to `upTo` was delivered to, or read by, the other person.
 *   - "typing": the other person is typing now.
 *   - "pong": the answer to our "ping".
 */
export type ServerFrame =
  | { type: "message"; message: Message }
  | { type: "receipt"; conversationId: string; status: "delivered" | "read"; upTo: number }
  | { type: "typing"; conversationId: string; userId: string }
  | { type: "pong" };

/** What we send on the connection. Messages do not go this way: they use `sendMessage`. */
export type ClientFrame =
  | { type: "ping" }
  | { type: "typing"; conversationId: string }
  /** We have shown every message with a server time up to `upTo`. */
  | { type: "read"; conversationId: string; upTo: number };

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

/**
 * Long polling, for networks where a WebSocket cannot open. The request stays
 * open until the server has frames for us, or for about 25 seconds. Resolves
 * with the frames (maybe none) and the cursor for the next call. Throws on
 * failure and when the signal is aborted. `cursor` is `null` for the first call.
 */
export type Poll = (
  cursor: string | null,
  signal: AbortSignal,
) => Promise<{ frames: ServerFrame[]; cursor: string }>;

/**
 * What the chat reports to analytics and monitoring.
 *
 * An event holds numbers and fixed words only. It never holds the text of a
 * message, a file name, an address or the id of a person.
 */
export type ChatEvent =
  /** `ackMs`: from the start of the send (after the wait in the outbox) to the answer of the server. */
  | { type: "message_sent"; ackMs: number; hasAttachment: boolean }
  | { type: "message_failed"; reason: "timeout" | "error" | "upload"; hasAttachment: boolean }
  /** A connection opened after one or more were lost. `attempt` is 1 when the first try worked. */
  | { type: "reconnect"; attempt: number; transport: "socket" | "polling" }
  | {
      type: "history_loaded";
      kind: "newest" | "older" | "catch_up";
      count: number;
      durationMs: number;
    };

export const MAX_MESSAGE_LENGTH = 2000;
/** A larger image is refused before any byte is sent. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
