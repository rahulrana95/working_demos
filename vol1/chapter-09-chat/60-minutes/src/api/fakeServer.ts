/*
 * NOT PART OF THE INTERVIEW.
 * A fake chat server for the demo. It lives in the page. It answers after a
 * random delay, so two frames can arrive in the wrong order. Every screen
 * that joins gets its own network switches.
 */
import type {
  Connect,
  ConnectionHandlers,
  FetchMessages,
  Message,
  SendMessage,
  ServerFrame,
} from "../chat";

export const CONVERSATION_ID = "asha-ravi";

/** The switches of one screen. The demo page changes them. */
export interface FakeNetwork {
  /** Requests fail, the live connection is closed, and a new one cannot open. */
  isDropped: boolean;
  /** Every answer takes about two seconds. */
  isSlow: boolean;
  /** The next send fails before the server stores the message. */
  failNextSend: boolean;
  /** The next send is stored and pushed to everyone, but its answer is lost. */
  loseNextAnswer: boolean;
}

export interface FakeClient {
  userId: string;
  fetchMessages: FetchMessages;
  sendMessage: SendMessage;
  connect: Connect;
  /** Read the switches here. Change them with `setNetwork`. */
  network: Readonly<FakeNetwork>;
  setNetwork: (key: keyof FakeNetwork, value: boolean) => void;
}

export interface FakeServerOptions {
  /** How many old messages the conversation starts with. */
  seedCount?: number;
  pageSize?: number;
  /** Called with one line for every request and every frame. */
  onLog?: (line: string) => void;
  /** Called when the server changed a switch by itself (the two "next send" ones). */
  onNetworkChange?: () => void;
  /** Returns a number from 0 to 1. Tests pass a fixed one. */
  random?: () => number;
}

const SEED_TEXTS = [
  "Are you coming to the review?",
  "Yes, in five minutes.",
  "Bring the numbers from last week.",
  "They are in the shared folder.",
  "नमस्ते, कैसे हो?",
  "Fine. Lunch at one?",
];
const SEED_USERS = ["asha", "ravi"];
const ONE_MINUTE_MS = 60_000;

/** Resolves after `ms`. Rejects at once when the signal is aborted. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timerId = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timerId);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

export function createFakeServer({
  seedCount = 60,
  pageSize = 20,
  onLog = () => {},
  onNetworkChange = () => {},
  random = Math.random,
}: FakeServerOptions = {}) {
  const stored: Message[] = [];
  /** The connections that are open now. */
  const sockets = new Set<{ userId: string; network: FakeNetwork; handlers: ConnectionHandlers }>();
  let lastTime = 0;

  /** Ids grow with time, and they sort as text because of the zeros in front. */
  function store(fields: Pick<Message, "clientId" | "senderId" | "text">, time: number): Message {
    lastTime = Math.max(time, lastTime + 1);
    const message: Message = {
      ...fields,
      id: String(stored.length + 1).padStart(8, "0"),
      conversationId: CONVERSATION_ID,
      createdAt: lastTime,
      status: "sent",
    };
    stored.push(message);
    return message;
  }

  const now = Date.now();
  for (let index = 0; index < seedCount; index += 1) {
    const fields = {
      clientId: `seed-${index}`,
      senderId: SEED_USERS[index % SEED_USERS.length],
      text: `${SEED_TEXTS[index % SEED_TEXTS.length]} (${index + 1})`,
    };
    store(fields, now - (seedCount - index) * ONE_MINUTE_MS);
  }

  function delayFor(network: FakeNetwork): number {
    return network.isSlow ? 1500 + random() * 1000 : 80 + random() * 320;
  }

  /** Sends one frame on one connection. It arrives later, if the connection is still open then. */
  function push(socket: typeof sockets extends Set<infer S> ? S : never, frame: ServerFrame) {
    setTimeout(() => {
      if (sockets.has(socket)) {
        onLog(
          `server → ${socket.userId}: ${frame.type === "message" ? `message ${frame.message.id}` : frame.type}`,
        );
        socket.handlers.onFrame(frame);
      }
    }, delayFor(socket.network));
  }

  /** Pushes a frame to every open screen, also to the one that sent the message. */
  function broadcast(frame: ServerFrame) {
    sockets.forEach((socket) => push(socket, frame));
  }

  function join(userId: string): FakeClient {
    const network: FakeNetwork = {
      isDropped: false,
      isSlow: false,
      failNextSend: false,
      loseNextAnswer: false,
    };

    async function request(name: string, signal: AbortSignal): Promise<void> {
      onLog(`${userId} → server: ${name}`);
      await wait(delayFor(network), signal);
      if (network.isDropped) {
        throw new Error("The network is down.");
      }
    }

    const client: FakeClient = {
      userId,
      network,

      async fetchMessages(conversationId, cursor, signal) {
        const isCatchUp = "after" in cursor;
        await request(
          isCatchUp
            ? `catch up after ${cursor.after}`
            : `load a page before ${cursor.before ?? "the end"}`,
          signal,
        );
        const all = stored.filter((message) => message.conversationId === conversationId);
        // The newest id the server has now. "0" sorts before every id.
        const newerCursor = all[all.length - 1]?.id ?? "0";
        if (isCatchUp) {
          const missed = all.filter((message) => (message.id ?? "") > cursor.after);
          return { messages: missed, olderCursor: null, newerCursor };
        }
        const end =
          cursor.before === null ? all.length : all.findIndex((m) => m.id === cursor.before);
        const start = Math.max(0, end - pageSize);
        const page = all.slice(start, end);
        return {
          messages: page,
          olderCursor: start > 0 ? (page[0].id ?? null) : null,
          newerCursor,
        };
      },

      async sendMessage({ clientId, text }, signal) {
        await request(`send ${clientId.slice(0, 8)}`, signal);
        if (network.failNextSend) {
          network.failNextSend = false;
          onNetworkChange();
          throw new Error("The server said no.");
        }

        // The same clientId again: answer with the stored message, store nothing new.
        let message = stored.find((candidate) => candidate.clientId === clientId);
        if (message === undefined) {
          message = store({ clientId, senderId: userId, text }, Date.now());
          broadcast({ type: "message", message });
        } else {
          onLog(`server: ${clientId.slice(0, 8)} is a repeat, nothing new is stored`);
        }

        if (network.loseNextAnswer) {
          network.loseNextAnswer = false;
          onNetworkChange();
          throw new Error("The answer was lost on the way.");
        }
        return message;
      },

      connect(handlers) {
        const socket = { userId, network, handlers };
        // A real connection needs a moment to open, or to find out that it cannot.
        const timerId = setTimeout(
          () => {
            if (network.isDropped) {
              handlers.onClose();
            } else {
              sockets.add(socket);
              onLog(`${userId} ⇄ server: connection open`);
              handlers.onOpen();
            }
          },
          delayFor(network) / 2,
        );
        return {
          send: (frame) => {
            if (sockets.has(socket) && frame.type === "ping") {
              push(socket, { type: "pong" });
            }
          },
          close: () => {
            clearTimeout(timerId);
            sockets.delete(socket);
          },
        };
      },

      setNetwork(key, value) {
        network[key] = value;
        if (network.isDropped) {
          // The connection of this screen dies. The screen is told so.
          for (const socket of sockets) {
            if (socket.network === network) {
              sockets.delete(socket);
              onLog(`${userId} ⇄ server: connection lost`);
              socket.handlers.onClose();
            }
          }
        }
      },
    };
    return client;
  }

  return { join, storedCount: () => stored.length };
}
