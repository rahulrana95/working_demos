/*
 * NOT PART OF THE INTERVIEW.
 * A fake chat server for the demo. It lives in the page. It answers after a
 * random delay, so two frames can arrive in the wrong order, like on a real
 * network. Every screen that joins gets its own network switches.
 */
import type { Connect, FetchMessages, Message, SendMessage, ServerFrame } from "../chat";

export const CONVERSATION_ID = "asha-ravi";

/** The switches of one screen. The demo page changes them. */
export interface FakeNetwork {
  /** Requests fail, and frames pushed by the server are lost. */
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
  network: FakeNetwork;
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
  const sockets = new Set<{ client: FakeClient; onFrame: (frame: ServerFrame) => void }>();
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

  /** Pushes a frame to every open screen, also to the one that sent the message. */
  function broadcast(frame: ServerFrame) {
    for (const socket of sockets) {
      setTimeout(() => {
        // The check is made at arrival: a connection can drop while a frame is on its way.
        if (sockets.has(socket) && !socket.client.network.isDropped) {
          onLog(`server → ${socket.client.userId}: message ${frame.message.id}`);
          socket.onFrame(frame);
        }
      }, delayFor(socket.client.network));
    }
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

      async fetchMessages(conversationId, beforeCursor, signal) {
        await request(`load a page before ${beforeCursor ?? "the end"}`, signal);
        const all = stored.filter((message) => message.conversationId === conversationId);
        const end =
          beforeCursor === null ? all.length : all.findIndex((m) => m.id === beforeCursor);
        const start = Math.max(0, end - pageSize);
        const page = all.slice(start, end);
        return { messages: page, olderCursor: start > 0 ? (page[0].id ?? null) : null };
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

      connect({ onFrame }) {
        const socket = { client, onFrame };
        sockets.add(socket);
        return { close: () => sockets.delete(socket) };
      },
    };
    return client;
  }

  return { join, storedCount: () => stored.length };
}
