/*
 * NOT PART OF THE INTERVIEW: production version.
 * The server of the OT engine. It is not a relay: it puts every submit in
 * one order, and transforms each one against the entries its site had not
 * seen. Without this server the OT engine cannot work.
 */
import { transformLists } from "../collab/ot/transform";
import type { OtClientMessage, OtEntry, OtServerMessage } from "../collab/ot/types";
import type { ServerConnection } from "./crdtServer";

export interface OtServer {
  connect(
    site: string,
    receive: (message: OtServerMessage) => void,
  ): ServerConnection<OtClientMessage>;
  /** Every entry, oldest first. Entry n has revision n. */
  getHistory(): OtEntry[];
}

export function createOtServer(): OtServer {
  const history: OtEntry[] = [];
  /** For each site, the id of its last submit in the history. */
  const lastId: Record<string, number> = {};
  const ready = new Map<string, (message: OtServerMessage) => void>();

  function handle(
    site: string,
    receive: (message: OtServerMessage) => void,
    message: OtClientMessage,
  ): void {
    if (message.type === "hello") {
      ready.set(site, receive);
      receive({ type: "sync", entries: history.slice(message.revision) });
      return;
    }
    // A submit that is in the history already was sent twice. Not stored twice.
    if (message.id !== (lastId[site] ?? 0) + 1 || message.revision > history.length) {
      return;
    }
    // Move the operations over everything the site had not seen. Two inserts
    // at the same place: the lower site name stays on the left, as in the engine.
    let ops = message.ops;
    for (const earlier of history.slice(message.revision)) {
      [ops] = transformLists(ops, earlier.ops, site < earlier.site);
    }
    const entry = { site, id: message.id, revision: history.length + 1, ops };
    lastId[site] = message.id;
    history.push(entry);
    ready.forEach((send) => send({ type: "entry", entry }));
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
    getHistory: () => history,
  };
}
