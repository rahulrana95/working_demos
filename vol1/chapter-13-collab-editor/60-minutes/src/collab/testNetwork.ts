/*
 * NOT PART OF THE INTERVIEW.
 * A network for the tests. Nothing moves until the test says so, so a test
 * can pick the exact order of every message.
 */
import { createFakeServer } from "../server/fakeServer";
import type { FakeServer, ServerConnection } from "../server/fakeServer";
import type { CollabSession } from "./session";
import type { ClientMessage, ServerMessage } from "./types";

export interface TestLink {
  session: CollabSession;
  /** Messages on their way, oldest first. */
  toServer: ClientMessage[];
  toClient: ServerMessage[];
  /** Every message that was ever put on the line, for the tests to read. */
  sentToServer: ClientMessage[];
  sentToClient: ServerMessage[];
  isOpen(): boolean;
  open(): void;
  /** Closes the line. Messages on their way are lost. */
  close(): void;
  /** Delivers the oldest message to the server. Returns false when there is none. */
  deliverToServer(): boolean;
  deliverToClient(): boolean;
}

export function createTestLink(server: FakeServer, session: CollabSession): TestLink {
  let connection: ServerConnection | null = null;
  const link: TestLink = {
    session,
    toServer: [],
    toClient: [],
    sentToServer: [],
    sentToClient: [],
    isOpen: () => connection !== null,
    open() {
      const toClient = link.toClient;
      const opened = server.connect(session.site, (message) => {
        // A message of a line that was closed is lost.
        if (connection === opened) {
          toClient.push(message);
          link.sentToClient.push(message);
        }
      });
      connection = opened;
      session.connect({
        send(message) {
          if (connection === opened) {
            link.toServer.push(message);
            link.sentToServer.push(message);
          }
        },
      });
    },
    close() {
      connection?.close();
      connection = null;
      link.toServer.length = 0;
      link.toClient.length = 0;
      session.disconnect();
    },
    deliverToServer() {
      const message = link.toServer.shift();
      if (message !== undefined) {
        connection?.send(message);
      }
      return message !== undefined;
    },
    deliverToClient() {
      const message = link.toClient.shift();
      if (message !== undefined) {
        session.receive(message);
      }
      return message !== undefined;
    },
  };
  return link;
}

/** Delivers every message on every line, until nothing is on its way. */
export function deliverAll(links: TestLink[]): void {
  let moved = true;
  while (moved) {
    moved = false;
    for (const link of links) {
      moved = link.deliverToServer() || moved;
      moved = link.deliverToClient() || moved;
    }
  }
}

export { createFakeServer };
