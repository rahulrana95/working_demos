/* NOT PART OF THE INTERVIEW. Helpers that the tests share. */
import { createChatSocket } from "./socket";
import type { OutboxStore } from "./outboxStorage";
import type { ChatDeps } from "./useChat";
import type {
  ChatEvent,
  ClientFrame,
  Connect,
  ConversationSummary,
  Message,
  Poll,
  ServerFrame,
} from "./types";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

/** A promise that the test resolves by hand, to control the order of answers. */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A confirmed message, as the server sends it. */
export function serverMessage(id: string, fields: Partial<Message> = {}): Message {
  return {
    id,
    clientId: `client-${id}`,
    conversationId: "c1",
    senderId: "ravi",
    text: `text ${id}`,
    createdAt: Number(id) * 1000,
    status: "sent",
    ...fields,
  };
}

type Page = Awaited<ReturnType<ChatDeps["fetchMessages"]>>;
type Cursor = Parameters<ChatDeps["fetchMessages"]>[1];
type PollAnswer = Awaited<ReturnType<Poll>>;

export interface FakeConnection {
  isClosed: boolean;
  /** The frames that were sent on it. */
  sent: ClientFrame[];
  /** The server accepts the connection. */
  open: () => void;
  /** The connection dies: the server or the network closes it. */
  drop: () => void;
  push: (frame: ServerFrame) => void;
}

/** A store in memory, with the part of `localStorage` that the outbox uses. */
export function createMemoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const store: OutboxStore = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  return { store, items };
}

/** A fake transport: connections and long-polling calls that the test answers by hand. */
export function createFakeTransport() {
  const connections: FakeConnection[] = [];
  const polls: { cursor: string | null; signal: AbortSignal; answer: Deferred<PollAnswer> }[] = [];

  const connect: Connect = (handlers) => {
    const connection: FakeConnection = {
      isClosed: false,
      sent: [],
      open: handlers.onOpen,
      drop: handlers.onClose,
      push: handlers.onFrame,
    };
    connections.push(connection);
    return {
      send: (frame) => void connection.sent.push(frame),
      close: () => void (connection.isClosed = true),
    };
  };

  const poll: Poll = (cursor, signal) => {
    const answer = createDeferred<PollAnswer>();
    signal.addEventListener("abort", () => answer.reject(new Error("aborted")));
    polls.push({ cursor, signal, answer });
    return answer.promise;
  };

  return { connections, polls, connect, poll };
}

/** Fake server functions. Every call waits until the test answers it. */
export function createFakeDeps() {
  const pages: {
    conversationId: string;
    cursor: Cursor;
    signal: AbortSignal;
    answer: Deferred<Page>;
  }[] = [];
  const sends: {
    clientId: string;
    conversationId: string;
    text: string;
    attachment?: Message["attachment"];
    signal: AbortSignal;
    answer: Deferred<Message>;
  }[] = [];
  const uploads: {
    file: File;
    signal: AbortSignal;
    progress: (fraction: number) => void;
    answer: Deferred<{ url: string }>;
  }[] = [];
  const events: ChatEvent[] = [];
  const { connections, connect } = createFakeTransport();
  const socket = createChatSocket({ connect, onEvent: (event) => events.push(event) });
  const memory = createMemoryStore();

  const deps: ChatDeps = {
    currentUserId: "asha",
    socket,
    store: memory.store,
    onEvent: (event) => events.push(event),
    fetchMessages: (conversationId, cursor, signal) => {
      const answer = createDeferred<Page>();
      pages.push({ conversationId, cursor, signal, answer });
      return answer.promise;
    },
    sendMessage: (message, signal) => {
      const answer = createDeferred<Message>();
      // Like `fetch`: an aborted request rejects.
      signal.addEventListener("abort", () => answer.reject(new Error("aborted")));
      sends.push({ ...message, signal, answer });
      return answer.promise;
    },
    uploadFile: (file, { signal, onProgress }) => {
      const answer = createDeferred<{ url: string }>();
      signal.addEventListener("abort", () => answer.reject(new Error("aborted")));
      uploads.push({ file, signal, progress: onProgress, answer });
      return answer.promise;
    },
  };

  /** The confirmed copy of a send, as the server would answer it. */
  function confirm(
    send: Pick<Message, "clientId" | "conversationId" | "text" | "attachment">,
    id: string,
  ): Message {
    const { clientId, conversationId, text, attachment } = send;
    return serverMessage(id, { clientId, conversationId, text, attachment, senderId: "asha" });
  }

  /** One answer of `fetchMessages`. */
  function page(ids: string[], olderCursor: string | null = null, newerCursor = "newest"): Page {
    return { messages: ids.map((id) => serverMessage(id)), olderCursor, newerCursor };
  }

  return { deps, socket, pages, sends, uploads, events, connections, memory, confirm, page };
}

export function conversation(
  id: string,
  fields: Partial<ConversationSummary> = {},
): ConversationSummary {
  return { id, title: `Person ${id}`, unreadCount: 0, ...fields };
}

/** A small image file. */
export function imageFile(name = "photo.png", size = 1000): File {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}
