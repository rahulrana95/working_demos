/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * Write it when the interviewer asks: "What if the connection drops?"
 * It has no React in it, so it is tested with a fake clock only.
 *
 * Why it holds at scale:
 *   1. Backoff: every failed try doubles the wait, up to 30 seconds. A
 *      server that is down is not hit harder while it is down.
 *   2. Jitter: the wait is partly random. After a server restart, a million
 *      clients do not all come back in the same second.
 *   3. Heartbeat: a connection can die without a "close" event, for example
 *      when a phone changes network. A page cannot see the ping frames of
 *      the WebSocket protocol, so we send our own "ping" and expect any
 *      frame back before the next one.
 */
import type { Connect, ConnectionHandlers } from "./types";

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
/** A connection that says nothing between two heartbeats is dead. */
export const HEARTBEAT_MS = 15_000;

/** How long to wait before try number `attempt`. The first retry is attempt 0. */
export function backoffDelay(attempt: number, random: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  // Half of the wait is fixed and half is random ("equal jitter").
  return ceiling / 2 + (random * ceiling) / 2;
}

/**
 * Keeps one connection open, and opens a new one when it is lost.
 * `onStatus` gets true when a connection opens and false when one is lost.
 * "pong" frames stay here: `onFrame` gets every other frame.
 * Returns the function that stops everything.
 */
export function openReliableConnection(
  connect: Connect,
  onFrame: ConnectionHandlers["onFrame"],
  onStatus: (isOpen: boolean) => void,
): () => void {
  let attempt = 0;
  let hasHeardServer = true;
  let connection: ReturnType<Connect>;
  let heartbeatId: ReturnType<typeof setInterval>;
  let retryTimerId: ReturnType<typeof setTimeout>;

  function open() {
    hasHeardServer = true;
    connection = connect({
      onOpen: () => onStatus(true),
      onFrame: (frame) => {
        hasHeardServer = true;
        // A frame proves that the connection works. Only now the next wait is short
        // again: a server that opens and closes at once does not reset the backoff.
        attempt = 0;
        if (frame.type !== "pong") {
          onFrame(frame);
        }
      },
      onClose: lose,
    });
    // This also ends a connection that never opens: it never says anything.
    heartbeatId = setInterval(() => {
      if (!hasHeardServer) {
        return lose();
      }
      hasHeardServer = false;
      connection.send({ type: "ping" });
    }, HEARTBEAT_MS);
  }

  function lose() {
    stop();
    onStatus(false);
    retryTimerId = setTimeout(open, backoffDelay(attempt++, Math.random()));
  }

  /** After `close` the connection calls no handler, so `lose` cannot run twice for one connection. */
  function stop() {
    clearInterval(heartbeatId);
    clearTimeout(retryTimerId);
    connection.close();
  }

  open();
  return stop;
}
