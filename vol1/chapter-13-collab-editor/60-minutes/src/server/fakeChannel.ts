/*
 * NOT PART OF THE INTERVIEW.
 * The line between one session and the fake server, with a delay in both
 * directions and an on/off switch. Going offline closes the line: messages
 * that are on their way are lost, as on a real network.
 */
import type { ClientMessage, CollabSession, ServerMessage } from "../collab";
import type { FakeServer, ServerConnection } from "./fakeServer";

export interface ChannelStats {
  /** Operations this side has sent, counting an operation again when it is sent again. */
  sent: number;
  /** Operations this side has received. */
  received: number;
}

export interface FakeChannel {
  setDelay(ms: number): void;
  setOnline(online: boolean): void;
  getStats(): ChannelStats;
  /** Calls the listener when the numbers change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Closes the line and stops every timer. */
  dispose(): void;
}

/** Runs tasks after a delay, in the order they were given. */
function createDelayLine(getDelay: () => number) {
  const queue: { run: () => void; dueAt: number }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function pump(): void {
    timer = null;
    while (queue.length > 0 && queue[0].dueAt <= Date.now()) {
      // The check above says the queue is not empty.
      queue.shift()!.run();
    }
    if (queue.length > 0) {
      timer = setTimeout(pump, queue[0].dueAt - Date.now());
    }
  }

  return {
    push(run: () => void): void {
      // Never earlier than the task before it: the line keeps its order.
      const last = queue[queue.length - 1];
      queue.push({ run, dueAt: Math.max(Date.now() + getDelay(), last?.dueAt ?? 0) });
      if (timer === null) {
        pump();
      }
    },
    clear(): void {
      queue.length = 0;
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = null;
    },
  };
}

function countOps(message: ClientMessage | ServerMessage): number {
  return "ops" in message ? message.ops.length : 0;
}

export function createFakeChannel(server: FakeServer, session: CollabSession): FakeChannel {
  let delayMs = 0;
  let stats: ChannelStats = { sent: 0, received: 0 };
  let connection: ServerConnection | null = null;
  const listeners = new Set<() => void>();
  const toServer = createDelayLine(() => delayMs);
  const toClient = createDelayLine(() => delayMs);

  function count(change: Partial<ChannelStats>): void {
    stats = { ...stats, ...change };
    listeners.forEach((listener) => listener());
  }

  function open(): void {
    const opened = server.connect(session.site, (message) =>
      toClient.push(() => {
        count({ received: stats.received + countOps(message) });
        session.receive(message);
      }),
    );
    connection = opened;
    session.connect({
      send(message) {
        count({ sent: stats.sent + countOps(message) });
        toServer.push(() => opened.send(message));
      },
    });
  }

  function close(): void {
    toServer.clear();
    toClient.clear();
    connection?.close();
    connection = null;
    session.disconnect();
  }

  open();

  return {
    setDelay(ms) {
      delayMs = ms;
    },
    setOnline(online) {
      if (online && connection === null) {
        open();
      } else if (!online && connection !== null) {
        close();
      }
    },
    getStats: () => stats,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      close();
      listeners.clear();
    },
  };
}
