/*
 * NOT PART OF THE INTERVIEW.
 * A fake chat server for the demo. It lives in the page. It answers after a
 * random delay. Every screen that joins gets its own network switches.
 *
 * Three people: Asha, Ravi and Meera. Each pair has one conversation. The
 * demo page shows the screens of Asha and Ravi, and a button lets Meera write.
 */
import type {
  Connect,
  ConnectionHandlers,
  ConversationSummary,
  FetchConversations,
  FetchMessages,
  Message,
  Poll,
  SendMessage,
  ServerFrame,
  UploadFile,
} from "../chat";

export const NAMES: Record<string, string> = { asha: "Asha", ravi: "Ravi", meera: "Meera" };
const CONVERSATION_IDS = ["asha-ravi", "asha-meera", "meera-ravi"];

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
  /** A WebSocket cannot open, as behind some proxies. Requests still work. */
  isSocketBlocked: boolean;
}

export interface FakeClient {
  userId: string;
  fetchMessages: FetchMessages;
  sendMessage: SendMessage;
  fetchConversations: FetchConversations;
  uploadFile: UploadFile;
  connect: Connect;
  poll: Poll;
  /** Read the switches here. Change them with `setNetwork`. */
  network: Readonly<FakeNetwork>;
  setNetwork: (key: keyof FakeNetwork, value: boolean) => void;
}

export interface FakeServerOptions {
  /** How many old messages the conversation of Asha and Ravi starts with. */
  seedCount?: number;
  pageSize?: number;
  /** Called with one line for every request and every frame. */
  onLog?: (line: string) => void;
  /** Called when the server changed a switch by itself (the two "next send" ones). */
  onNetworkChange?: () => void;
  /** Returns a number from 0 to 1. Tests pass a fixed one. */
  random?: () => number;
  /** Makes the address of an uploaded file. Tests pass a fake one. */
  makeUrl?: (file: File) => string;
}

const SEED_TEXTS = [
  "Are you coming to the review?",
  "Yes, in five minutes.",
  "The numbers are here: https://example.com/numbers?week=47.",
  "They are in the shared folder.",
  "नमस्ते, कैसे हो?",
  "Fine. Lunch at one?",
];
const ONE_MINUTE_MS = 60_000;
/** How long a long-polling request waits for a frame. A real server waits about 25 seconds. */
const POLL_WAIT_MS = 5_000;

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

const membersOf = (conversationId: string) => conversationId.split("-");

interface Socket {
  userId: string;
  network: FakeNetwork;
  handlers: ConnectionHandlers;
}

export function createFakeServer({
  seedCount = 60,
  pageSize = 20,
  onLog = () => {},
  onNetworkChange = () => {},
  random = Math.random,
  makeUrl = (file) => URL.createObjectURL(file),
}: FakeServerOptions = {}) {
  const stored: Message[] = [];
  /** The connections that are open now. */
  const sockets = new Set<Socket>();
  /** Every frame for one person, for long polling. The cursor is a place in this list. */
  const frameLogs: Record<string, ServerFrame[]> = {};
  const pollWaiters: Record<string, Set<() => void>> = {};
  /** `"asha/asha-ravi"` → the server time up to which Asha got, or read, the messages. */
  const deliveredUpTo: Record<string, number> = {};
  const readUpTo: Record<string, number> = {};
  let lastTime = 0;

  const seenKey = (userId: string, conversationId: string) => `${userId}/${conversationId}`;

  /** Ids grow with time, and they sort as text because of the zeros in front. */
  function store(
    fields: Pick<Message, "clientId" | "conversationId" | "senderId" | "text" | "attachment">,
    time: number,
  ): Message {
    lastTime = Math.max(time, lastTime + 1);
    const message: Message = {
      ...fields,
      id: String(stored.length + 1).padStart(8, "0"),
      createdAt: lastTime,
      status: "sent",
    };
    stored.push(message);
    return message;
  }

  const now = Date.now();
  const seeds = [seedCount, 3, 2];
  CONVERSATION_IDS.forEach((conversationId, which) => {
    const members = membersOf(conversationId);
    for (let index = 0; index < seeds[which]; index += 1) {
      const fields = {
        clientId: `seed-${conversationId}-${index}`,
        conversationId,
        senderId: members[index % 2],
        text: `${SEED_TEXTS[index % SEED_TEXTS.length]} (${index + 1})`,
      };
      // The long conversation starts two days ago, so the demo shows the lines between days.
      const age = (seeds[which] - index) * (which === 0 ? 48 : 1) * ONE_MINUTE_MS + which * 1000;
      store(fields, now - age);
    }
    // Everything old was read by everyone.
    members.forEach((userId) => (readUpTo[seenKey(userId, conversationId)] = now));
  });

  function delayFor(network: FakeNetwork): number {
    return network.isSlow ? 1500 + random() * 1000 : 80 + random() * 320;
  }

  /** The status the sender sees: how far the other person is. */
  function statusFor(message: Message, readerId: string): Message["status"] {
    if (message.senderId !== readerId) {
      return "sent";
    }
    const other = membersOf(message.conversationId).find((userId) => userId !== readerId) ?? "";
    const key = seenKey(other, message.conversationId);
    if (message.createdAt <= (readUpTo[key] ?? 0)) {
      return "read";
    }
    return message.createdAt <= (deliveredUpTo[key] ?? 0) ? "delivered" : "sent";
  }

  const describe = (frame: ServerFrame) =>
    frame.type === "message" ? `message ${frame.message.id}` : frame.type;

  /** A frame reached a person, on a connection or in a poll answer. */
  function arrived(userId: string, frame: ServerFrame) {
    onLog(`server → ${userId}: ${describe(frame)}`);
    if (frame.type !== "message" || frame.message.senderId === userId) {
      return;
    }
    // Tell the sender that the message was delivered.
    const { conversationId, createdAt, senderId } = frame.message;
    const key = seenKey(userId, conversationId);
    if (createdAt > (deliveredUpTo[key] ?? 0)) {
      deliveredUpTo[key] = createdAt;
      sendTo(senderId, { type: "receipt", conversationId, status: "delivered", upTo: createdAt });
    }
  }

  /** Sends one frame to one person: on every open connection, and into the list for polling. */
  function sendTo(userId: string, frame: ServerFrame) {
    (frameLogs[userId] ??= []).push(frame);
    pollWaiters[userId]?.forEach((wake) => wake());
    for (const socket of sockets) {
      if (socket.userId === userId) {
        setTimeout(() => {
          if (sockets.has(socket)) {
            arrived(userId, frame);
            socket.handlers.onFrame(frame);
          }
        }, delayFor(socket.network));
      }
    }
  }

  /** Stores a message once for a `clientId`, and pushes it to everyone in the conversation. */
  function accept(
    fields: Pick<Message, "clientId" | "conversationId" | "senderId" | "text" | "attachment">,
  ): Message {
    const known = stored.find((candidate) => candidate.clientId === fields.clientId);
    if (known !== undefined) {
      onLog(`server: ${fields.clientId.slice(0, 8)} is a repeat, nothing new is stored`);
      return known;
    }
    const message = store(fields, Date.now());
    membersOf(message.conversationId).forEach((userId) =>
      sendTo(userId, { type: "message", message }),
    );
    return message;
  }

  function join(userId: string): FakeClient {
    const network: FakeNetwork = {
      isDropped: false,
      isSlow: false,
      failNextSend: false,
      loseNextAnswer: false,
      isSocketBlocked: false,
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
        const name = isCatchUp
          ? `catch up after ${cursor.after}`
          : `load a page before ${cursor.before ?? "the end"}`;
        await request(`${name} (${conversationId})`, signal);
        const all = stored
          .filter((message) => message.conversationId === conversationId)
          .map((message) => ({ ...message, status: statusFor(message, userId) }));
        // Whoever loads the history has got its messages: tell their sender.
        const newest = all.filter((message) => message.senderId !== userId).pop();
        const key = seenKey(userId, conversationId);
        if (newest !== undefined && newest.createdAt > (deliveredUpTo[key] ?? 0)) {
          deliveredUpTo[key] = newest.createdAt;
          const receipt = { conversationId, status: "delivered", upTo: newest.createdAt } as const;
          sendTo(newest.senderId, { type: "receipt", ...receipt });
        }
        // The newest id the server has now. "0" sorts before every id.
        const newerCursor = stored[stored.length - 1]?.id ?? "0";
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

      async fetchConversations(signal) {
        await request("load the conversations", signal);
        return CONVERSATION_IDS.filter((id) => membersOf(id).includes(userId)).map((id) => {
          const all = stored.filter((message) => message.conversationId === id);
          const seenUpTo = readUpTo[seenKey(userId, id)] ?? 0;
          const other = membersOf(id).find((member) => member !== userId) ?? "";
          const summary: ConversationSummary = {
            id,
            title: NAMES[other],
            lastMessage: all[all.length - 1],
            unreadCount: all.filter((m) => m.senderId !== userId && m.createdAt > seenUpTo).length,
          };
          return summary;
        });
      },

      async sendMessage({ clientId, conversationId, text, attachment }, signal) {
        await request(`send ${clientId.slice(0, 8)}`, signal);
        if (network.failNextSend) {
          network.failNextSend = false;
          onNetworkChange();
          throw new Error("The server said no.");
        }
        const message = accept({ clientId, conversationId, senderId: userId, text, attachment });
        if (network.loseNextAnswer) {
          network.loseNextAnswer = false;
          onNetworkChange();
          throw new Error("The answer was lost on the way.");
        }
        return message;
      },

      async uploadFile(file, { signal, onProgress }) {
        onLog(`${userId} → server: upload ${file.size} bytes`);
        const steps = 5;
        for (let step = 1; step <= steps; step += 1) {
          await wait(delayFor(network), signal);
          if (network.isDropped) {
            throw new Error("The network is down.");
          }
          onProgress(step / steps);
        }
        return { url: makeUrl(file) };
      },

      connect(handlers) {
        const socket: Socket = { userId, network, handlers };
        // A real connection needs a moment to open, or to find out that it cannot.
        const timerId = setTimeout(
          () => {
            if (network.isDropped || network.isSocketBlocked) {
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
            if (!sockets.has(socket)) {
              return;
            }
            if (frame.type === "ping") {
              setTimeout(() => sockets.has(socket) && handlers.onFrame({ type: "pong" }), 50);
              return;
            }
            onLog(`${userId} → server: ${frame.type}`);
            const { conversationId } = frame;
            const others = membersOf(conversationId).filter((member) => member !== userId);
            if (frame.type === "typing") {
              others.forEach((other) => sendTo(other, { type: "typing", conversationId, userId }));
            } else if (frame.upTo > (readUpTo[seenKey(userId, conversationId)] ?? 0)) {
              readUpTo[seenKey(userId, conversationId)] = frame.upTo;
              const receipt = { type: "receipt", conversationId, status: "read", upTo: frame.upTo };
              others.forEach((other) => sendTo(other, receipt as ServerFrame));
            }
          },
          close: () => {
            clearTimeout(timerId);
            sockets.delete(socket);
          },
        };
      },

      async poll(cursor, signal) {
        await request("poll", signal);
        const log = (frameLogs[userId] ??= []);
        // The first call starts at the end: what came before is loaded as history.
        const from = cursor === null ? log.length : Number(cursor);
        if (log.length === from) {
          // Nothing yet. Hold the request until a frame comes, or the wait is over.
          const waiters = (pollWaiters[userId] ??= new Set());
          let wake = () => {};
          const woken = new Promise<void>((resolve) => (wake = resolve));
          waiters.add(wake);
          await Promise.race([woken, wait(POLL_WAIT_MS, signal)]).finally(() =>
            waiters.delete(wake),
          );
        }
        if (network.isDropped) {
          throw new Error("The network is down.");
        }
        const frames = log.slice(from);
        frames.forEach((frame) => arrived(userId, frame));
        return { frames, cursor: String(log.length) };
      },

      setNetwork(key, value) {
        network[key] = value;
        if (network.isDropped || network.isSocketBlocked) {
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

  /** A message from a person who has no screen in the demo. */
  function sendAs(userId: string, conversationId: string, text: string): Message {
    const clientId = `${userId}-${stored.length}`;
    return accept({ clientId, conversationId, senderId: userId, text });
  }

  return { join, sendAs, storedCount: () => stored.length };
}
