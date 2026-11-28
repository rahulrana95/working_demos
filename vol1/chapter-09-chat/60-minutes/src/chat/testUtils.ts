/* NOT PART OF THE INTERVIEW. Helpers that the tests share. */
import type { ChatDeps } from "./useChat";
import type { Message, ServerFrame } from "./types";

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

export interface FakeConnection {
  isClosed: boolean;
  /** How many "ping" frames were sent on it. */
  pings: number;
  /** The server accepts the connection. */
  open: () => void;
  /** The connection dies: the server or the network closes it. */
  drop: () => void;
  push: (frame: ServerFrame) => void;
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
    signal: AbortSignal;
    answer: Deferred<Message>;
  }[] = [];
  const connections: FakeConnection[] = [];

  const deps: ChatDeps = {
    currentUserId: "asha",
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
    connect: (handlers) => {
      const connection: FakeConnection = {
        isClosed: false,
        pings: 0,
        open: handlers.onOpen,
        drop: handlers.onClose,
        push: handlers.onFrame,
      };
      connections.push(connection);
      return {
        send: () => void (connection.pings += 1),
        close: () => void (connection.isClosed = true),
      };
    },
  };

  /** The confirmed copy of a send, as the server would answer it. */
  function confirm(
    send: { clientId: string; conversationId: string; text: string },
    id: string,
  ): Message {
    return serverMessage(id, { ...send, senderId: "asha" });
  }

  /** One answer of `fetchMessages`. */
  function page(ids: string[], olderCursor: string | null = null, newerCursor = "newest"): Page {
    return { messages: ids.map((id) => serverMessage(id)), olderCursor, newerCursor };
  }

  return { deps, pages, sends, connections, confirm, page };
}
