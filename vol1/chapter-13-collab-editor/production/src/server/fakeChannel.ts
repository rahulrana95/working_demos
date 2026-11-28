/*
 * NOT PART OF THE INTERVIEW: production version.
 * The line between one engine and a fake server, with a delay in both
 * directions and an on/off switch. Going offline closes the line: messages
 * that are on their way are lost, as on a real network. It works for both
 * engines.
 */
import type { CollabEngine } from "../collab";
import type { ServerConnection } from "./crdtServer";

interface AnyServer<Client, Server> {
  connect(site: string, receive: (message: Server) => void): ServerConnection<Client>;
}

export interface FakeChannel {
  setDelay(ms: number): void;
  setOnline(online: boolean): void;
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

export function createFakeChannel<Client, Server>(
  server: AnyServer<Client, Server>,
  engine: CollabEngine<Client, Server>,
): FakeChannel {
  let delayMs = 0;
  let connection: ServerConnection<Client> | null = null;
  const toServer = createDelayLine(() => delayMs);
  const toClient = createDelayLine(() => delayMs);

  function open(): void {
    const opened = server.connect(engine.site, (message) =>
      toClient.push(() => engine.receive(message)),
    );
    connection = opened;
    engine.connect({ send: (message) => toServer.push(() => opened.send(message)) });
  }

  function close(): void {
    toServer.clear();
    toClient.clear();
    connection?.close();
    connection = null;
    engine.disconnect();
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
    dispose: close,
  };
}
