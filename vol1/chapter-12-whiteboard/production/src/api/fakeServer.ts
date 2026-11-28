/*
 * NOT PART OF THE INTERVIEW.
 * A fake server for the demo and the tests. It lives in the page, takes a
 * random time for every message, and does the two things a real server must
 * do for the whiteboard:
 *   1. Put all operations in one order and number them.
 *   2. Ignore an operation whose id it has already taken, so a client can
 *      send again after a lost connection without drawing a shape twice.
 */
import type { Operation, Presence } from "../whiteboard";

export interface ServerHandlers {
  onOperation: (seq: number, operation: Operation) => void;
  onPresence: (presence: Presence) => void;
  onPeerLeft: (userId: string) => void;
}

export interface FakeConnection {
  send: (operation: Operation) => void;
  sendPresence: (presence: Presence) => void;
  /** Stops all messages to this client. Messages on their way to it are lost. */
  close: () => void;
}

export interface FakeServerOptions {
  /** How long one message takes, in milliseconds. Called for every message. */
  delayMs?: () => number;
  /** Called when the log of the server grows. For the demo panel. */
  onLog?: (log: Operation[]) => void;
}

export interface FakeServer {
  /** `lastSeq` is the last number the client already has. Everything after it is sent first. */
  connect: (userId: string, lastSeq: number, handlers: ServerHandlers) => FakeConnection;
  /** Every operation the server took, in its order. The sequence number is the place plus one. */
  getLog: () => Operation[];
}

interface Client {
  handlers: ServerHandlers;
  isOpen: boolean;
  /** Messages on their way to this client, oldest first, each with the time it arrives. */
  queue: { arrivesAt: number; run: () => void }[];
  isTimerRunning: boolean;
}

export function createFakeServer(options: FakeServerOptions = {}): FakeServer {
  const delayMs = options.delayMs ?? (() => 50 + Math.random() * 250);
  const log: Operation[] = [];
  const takenIds = new Set<string>();
  const clients = new Map<string, Client>();

  /** Hands over the oldest message when its time has come, and then waits for the next one. */
  function pump(client: Client) {
    const next = client.queue[0];
    if (next === undefined || client.isTimerRunning) {
      return;
    }
    client.isTimerRunning = true;
    setTimeout(
      () => {
        client.isTimerRunning = false;
        client.queue.shift();
        if (client.isOpen) {
          next.run();
          pump(client);
        }
      },
      Math.max(0, next.arrivesAt - Date.now()),
    );
  }

  /**
   * Delivers after a random time. One queue per client keeps the order: a
   * message never arrives before a message that was sent to that client earlier.
   */
  function deliver(client: Client, run: () => void) {
    client.queue.push({ arrivesAt: Date.now() + delayMs(), run });
    pump(client);
  }

  function take(operation: Operation) {
    if (takenIds.has(operation.id)) {
      // A second delivery of the same operation. The first one is already in
      // the log, and every client gets it from there. Nothing more to do.
      return;
    }
    takenIds.add(operation.id);
    log.push(operation);
    options.onLog?.([...log]);
    const seq = log.length;
    for (const client of clients.values()) {
      deliver(client, () => client.handlers.onOperation(seq, operation));
    }
  }

  return {
    connect(userId, lastSeq, handlers) {
      const client: Client = { handlers, isOpen: true, queue: [], isTimerRunning: false };
      clients.set(userId, client);
      // First everything the client missed, in order.
      log.slice(lastSeq).forEach((operation, index) => {
        deliver(client, () => handlers.onOperation(lastSeq + index + 1, operation));
      });

      return {
        send(operation) {
          // The way up takes time too. An operation that left before the
          // connection closed still arrives.
          setTimeout(() => take(operation), delayMs());
        },
        sendPresence(presence) {
          for (const [otherId, other] of clients) {
            if (otherId !== userId && client.isOpen) {
              deliver(other, () => other.handlers.onPresence(presence));
            }
          }
        },
        close() {
          client.isOpen = false;
          if (clients.get(userId) === client) {
            clients.delete(userId);
          }
          for (const other of clients.values()) {
            deliver(other, () => other.handlers.onPeerLeft(userId));
          }
        },
      };
    },
    getLog: () => [...log],
  };
}
