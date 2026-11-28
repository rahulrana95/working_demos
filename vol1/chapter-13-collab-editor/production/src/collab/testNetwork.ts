/*
 * NOT PART OF THE INTERVIEW: production version.
 * A network for the tests. Nothing moves until the test says so, so a test
 * can pick the exact order of every message. It works for both engines.
 */
import type { ServerConnection } from "../server/crdtServer";
import type { CollabEngine } from "./engine";

interface AnyServer<Client, Server> {
  connect(site: string, receive: (message: Server) => void): ServerConnection<Client>;
}

export interface TestLink<Engine, Client, Server> {
  /** The engine at the end of this line. */
  session: Engine;
  /** Messages on their way, oldest first. */
  toServer: Client[];
  toClient: Server[];
  /** Every message that was ever put on the line, for the tests to read. */
  sentToServer: Client[];
  sentToClient: Server[];
  isOpen(): boolean;
  open(): void;
  /** Closes the line. Messages on their way are lost. */
  close(): void;
  /** Delivers the oldest message to the server. Returns false when there is none. */
  deliverToServer(): boolean;
  deliverToClient(): boolean;
}

export function createTestLink<Client, Server, Engine extends CollabEngine<Client, Server>>(
  server: AnyServer<Client, Server>,
  session: Engine,
): TestLink<Engine, Client, Server> {
  let connection: ServerConnection<Client> | null = null;
  const link: TestLink<Engine, Client, Server> = {
    session,
    toServer: [],
    toClient: [],
    sentToServer: [],
    sentToClient: [],
    isOpen: () => connection !== null,
    open() {
      const opened = server.connect(session.site, (message) => {
        // A message of a line that was closed is lost.
        if (connection === opened) {
          link.toClient.push(message);
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

interface Deliverable {
  deliverToServer(): boolean;
  deliverToClient(): boolean;
}

/** Delivers every message on every line, until nothing is on its way. */
export function deliverAll(links: Deliverable[]): void {
  let moved = true;
  while (moved) {
    moved = false;
    for (const link of links) {
      moved = link.deliverToServer() || moved;
      moved = link.deliverToClient() || moved;
    }
  }
}
