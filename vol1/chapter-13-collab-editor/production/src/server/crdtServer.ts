/*
 * NOT PART OF THE INTERVIEW: production version.
 * A server that lives in the page. It keeps every operation in a log, in
 * the order they arrived, and passes them on. It never looks at the text
 * and never changes an operation: with a CRDT the server only relays.
 *
 * It does one more thing: it works out which tombstones no site will ever
 * need again, and tells the sites to remove them. See `collectIfSafe`.
 */
import type { ClientMessage, Id, Op, Presence, ServerMessage } from "../collab/crdt/types";
import type { VersionVector } from "../collab/crdt/types";

export interface ServerConnection<Message> {
  send(message: Message): void;
  close(): void;
}

export interface CrdtServer {
  /** Opens a line for one site. `receive` gets every message for that site. */
  connect(site: string, receive: (message: ServerMessage) => void): ServerConnection<ClientMessage>;
  /** Every operation the server has, oldest first. */
  getLog(): Op[];
  /** How many tombstones the server has told the sites to remove. */
  getCollectedCount(): number;
}

/** True when `a` has everything that `b` has. */
function covers(a: VersionVector, b: VersionVector): boolean {
  return Object.keys(b).every((site) => (a[site] ?? 0) >= b[site]);
}

export function createCrdtServer(): CrdtServer {
  const log: Op[] = [];
  /** For each site, the `seq` of its last operation in the log. */
  const lastSeq: VersionVector = {};
  /** The sites that have said hello, and so can take new operations. */
  const ready = new Map<string, (message: ServerMessage) => void>();
  const presences = new Map<string, Presence>();
  /** For every site that was ever here: what it said it has from the others. */
  const seenBy = new Map<string, VersionVector>();
  /** Deletes whose tombstones are still in the lists of the sites. */
  let liveDeletes: Op[] = [];
  let collectedCount = 0;
  /** The first half of the two-step check below. */
  let mark: { stable: VersionVector; top: VersionVector } | null = null;

  function sendToOthers(site: string, message: ServerMessage): void {
    for (const [other, send] of ready) {
      if (other !== site) {
        send(message);
      }
    }
  }

  /** What every known site has, as far as it told us. A site that is away counts too. */
  function stableVector(): VersionVector {
    const stable: VersionVector = {};
    for (const site of Object.keys(lastSeq)) {
      const haveIt = [...seenBy].map(([reader, vector]) =>
        reader === site ? lastSeq[site] : (vector[site] ?? 0),
      );
      stable[site] = Math.min(...haveIt);
    }
    return stable;
  }

  /**
   * Tells the sites which tombstones they can remove.
   *
   * "Every site has seen the delete" is not enough. A site that had not seen
   * the delete yet may have typed right after the doomed character, and that
   * insert finds its place by comparing ids with the tombstone and with what
   * hangs under it. So we wait for two steps:
   *   1. Every site has seen the delete. We note the top of the log at this
   *      moment (`mark`). A site sends its own edits before it says what it
   *      has seen, so everything typed next to the doomed character is in
   *      the log by now.
   *   2. Every site has seen everything up to that top. From here on, no
   *      site can make an edit that needs the tombstone.
   * A site that never comes back holds this up for ever. That is on purpose.
   */
  function collectIfSafe(): void {
    const stable = stableVector();
    // Twice: when every site has seen the whole log, both steps hold at once.
    for (let step = 0; step < 2; step += 1) {
      mark ??= { stable, top: { ...lastSeq } };
      if (!covers(stable, mark.top)) {
        return;
      }
      const safe = mark.stable;
      const isSafe = (op: Op) => op.seq <= (safe[op.site] ?? 0);
      const ids: Id[] = liveDeletes
        .filter(isSafe)
        .flatMap((op) => (op.type === "delete" ? op.ids : []));
      liveDeletes = liveDeletes.filter((op) => !isSafe(op));
      mark = null;
      if (ids.length > 0) {
        collectedCount += ids.length;
        ready.forEach((send) => send({ type: "collect", ids }));
      }
    }
  }

  function handle(
    site: string,
    receive: (message: ServerMessage) => void,
    message: ClientMessage,
  ): void {
    switch (message.type) {
      case "hello": {
        const missing = log.filter(
          (op) => op.site !== site && op.seq > (message.vector[op.site] ?? 0),
        );
        ready.set(site, receive);
        // A new site has seen nothing yet. What hello says does not count:
        // the site may still hold edits that it has not sent.
        seenBy.set(site, seenBy.get(site) ?? {});
        receive({ type: "sync", ack: lastSeq[site] ?? 0, ops: missing });
        for (const presence of presences.values()) {
          if (presence.site !== site) {
            receive({ type: "presence", presence });
          }
        }
        break;
      }
      case "ops": {
        // Take only the next number of this site. An operation that was sent
        // twice, for example after a reconnect, is not stored twice.
        const fresh: Op[] = [];
        for (const op of message.ops) {
          if (op.site === site && op.seq === (lastSeq[site] ?? 0) + 1) {
            lastSeq[site] = op.seq;
            log.push(op);
            fresh.push(op);
            if (op.type === "delete") {
              liveDeletes.push(op);
            }
          }
        }
        receive({ type: "ack", seq: lastSeq[site] ?? 0 });
        if (fresh.length > 0) {
          sendToOthers(site, { type: "ops", ops: fresh });
        }
        break;
      }
      case "presence":
        presences.set(site, { ...message.presence, site });
        sendToOthers(site, { type: "presence", presence: { ...message.presence, site } });
        break;
      case "seen":
        seenBy.set(site, message.digest.vector);
        sendToOthers(site, { type: "digest", digest: { ...message.digest, site } });
        collectIfSafe();
        break;
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
            presences.delete(site);
            sendToOthers(site, { type: "left", site });
          }
        },
      };
    },
    getLog: () => log,
    getCollectedCount: () => collectedCount,
  };
}
