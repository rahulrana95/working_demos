/*
 * NOT PART OF THE INTERVIEW.
 * A server that lives in the page. It keeps every operation in a log, in
 * the order they arrived, and passes them on. It never looks inside an
 * operation and never changes one: with a CRDT the server only relays.
 */
import type { ClientMessage, Op, ServerMessage, VersionVector } from "../collab";

export interface ServerConnection {
  send(message: ClientMessage): void;
  close(): void;
}

export interface FakeServer {
  /** Opens a line for one site. `receive` gets every message for that site. */
  connect(site: string, receive: (message: ServerMessage) => void): ServerConnection;
  /** Every operation the server has, oldest first. */
  getLog(): Op[];
}

export function createFakeServer(): FakeServer {
  const log: Op[] = [];
  /** For each site, the `seq` of its last operation in the log. */
  const lastSeq: VersionVector = {};
  /** The sites that have said hello, and so can take new operations. */
  const ready = new Map<string, (message: ServerMessage) => void>();

  function handle(
    site: string,
    receive: (message: ServerMessage) => void,
    message: ClientMessage,
  ): void {
    if (message.type === "hello") {
      const missing = log.filter(
        (op) => op.site !== site && op.seq > (message.vector[op.site] ?? 0),
      );
      ready.set(site, receive);
      receive({ type: "sync", ack: lastSeq[site] ?? 0, ops: missing });
      return;
    }

    // Take only the next number of this site. An operation that was sent
    // twice, for example after a reconnect, is not stored twice.
    const fresh: Op[] = [];
    for (const op of message.ops) {
      if (op.site === site && op.seq === (lastSeq[site] ?? 0) + 1) {
        lastSeq[site] = op.seq;
        log.push(op);
        fresh.push(op);
      }
    }
    receive({ type: "ack", seq: lastSeq[site] ?? 0 });
    if (fresh.length > 0) {
      for (const [other, send] of ready) {
        if (other !== site) {
          send({ type: "ops", ops: fresh });
        }
      }
    }
  }

  return {
    connect(site, receive) {
      let isOpen = true;
      return {
        send(message) {
          if (isOpen) {
            handle(site, receive, message);
          }
        },
        close() {
          isOpen = false;
          if (ready.get(site) === receive) {
            ready.delete(site);
          }
        },
      };
    },
    getLog: () => log,
  };
}
