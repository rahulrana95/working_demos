/*
 * NOT PART OF THE INTERVIEW: production version.
 * One live connection for the whole app. The 60-minute answer opens a
 * connection in the hook of one conversation. Here the conversation list and
 * the open conversation listen to the same one.
 *
 * It is the reconnecting connection of the 60-minute answer (backoff, jitter,
 * heartbeat), plus:
 *   1. Many listeners.
 *   2. Long polling when the WebSocket cannot open, for example behind a
 *      proxy that blocks it. The WebSocket is tried again once a minute.
 *   3. A new try at once when the browser says the network is back.
 *   4. A "reconnect" event for monitoring.
 */
import type { ChatEvent, ClientFrame, Connect, Poll, ServerFrame } from "./types";

export interface ChatSocketOptions {
  connect: Connect;
  /** Leave it out to never fall back to long polling. */
  poll?: Poll;
  onEvent?: (event: ChatEvent) => void;
}

export interface SocketListener {
  /** Called for every frame of the server, but not for "pong". */
  onFrame?: (frame: ServerFrame) => void;
  /**
   * Called with true every time a connection opens, and with false when the
   * connection is lost. After true, a listener asks for what it missed.
   */
  onStatus?: (isOpen: boolean) => void;
}

export interface ChatSocket {
  /** Returns the function that removes the listener. */
  subscribe: (listener: SocketListener) => () => void;
  /** Sends a frame when a WebSocket is open. Otherwise the frame is dropped. */
  send: (frame: ClientFrame) => void;
  isOpen: () => boolean;
  /** Stops everything. The socket cannot be used after it. */
  close: () => void;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
/** A connection that says nothing between two heartbeats is dead. */
export const HEARTBEAT_MS = 15_000;
/** After this many failed tries in a row we start long polling. */
export const POLL_AFTER_FAILED_TRIES = 3;
/** While we poll, the WebSocket is tried again this often. */
export const SOCKET_RETRY_WHILE_POLLING_MS = 60_000;

/** How long to wait before try number `attempt`. The first retry is attempt 0. */
export function backoffDelay(attempt: number, random: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  // Half of the wait is fixed and half is random ("equal jitter").
  return ceiling / 2 + (random * ceiling) / 2;
}

export function createChatSocket({ connect, poll, onEvent }: ChatSocketOptions): ChatSocket {
  const listeners = new Set<SocketListener>();
  let isOpen = false;
  let isSocketOpen = false;
  /** Failed tries of the WebSocket in a row. It sets the wait and starts the polling. */
  let failedTries = 0;
  /** Tries since the connection was lost, for the "reconnect" event. 0: it was never lost. */
  let triesSinceLoss = 0;
  let hasHeardServer = true;
  let connection: ReturnType<Connect> | undefined;
  let heartbeatId: ReturnType<typeof setInterval> | undefined;
  let retryTimerId: ReturnType<typeof setTimeout> | undefined;
  let polling: AbortController | undefined;

  function announce(isOpenNow: boolean, transport: "socket" | "polling") {
    const wasLost = triesSinceLoss > 0;
    isOpen = isOpenNow;
    if (isOpenNow && wasLost) {
      onEvent?.({ type: "reconnect", attempt: triesSinceLoss, transport });
      triesSinceLoss = 0;
    }
    // A copy: a listener may remove itself while we call it.
    [...listeners].forEach((listener) => listener.onStatus?.(isOpenNow));
  }

  function deliver(frame: ServerFrame) {
    if (frame.type !== "pong") {
      [...listeners].forEach((listener) => listener.onFrame?.(frame));
    }
  }

  function openSocket() {
    retryTimerId = undefined;
    hasHeardServer = true;
    connection = connect({
      onOpen: () => {
        isSocketOpen = true;
        stopPolling();
        announce(true, "socket");
      },
      onFrame: (frame) => {
        hasHeardServer = true;
        // A frame proves that the connection works. Only now the next wait is short
        // again: a server that opens and closes at once does not reset the backoff.
        failedTries = 0;
        deliver(frame);
      },
      onClose: loseSocket,
    });
    // This also ends a connection that never opens: it never says anything.
    heartbeatId = setInterval(() => {
      if (!hasHeardServer) {
        return loseSocket();
      }
      hasHeardServer = false;
      connection?.send({ type: "ping" });
    }, HEARTBEAT_MS);
  }

  function closeSocket() {
    clearInterval(heartbeatId);
    connection?.close();
    connection = undefined;
    isSocketOpen = false;
  }

  function loseSocket() {
    closeSocket();
    failedTries += 1;
    triesSinceLoss += 1;
    if (poll !== undefined && failedTries >= POLL_AFTER_FAILED_TRIES && polling === undefined) {
      startPolling(poll);
    }
    if (polling === undefined) {
      announce(false, "socket");
    }
    const wait =
      polling === undefined
        ? backoffDelay(failedTries - 1, Math.random())
        : SOCKET_RETRY_WHILE_POLLING_MS;
    retryTimerId = setTimeout(openSocket, wait);
  }

  async function startPolling(pollOnce: Poll) {
    const { signal } = (polling = new AbortController());
    let cursor: string | null = null;
    let failures = 0;

    while (!signal.aborted) {
      const answer: Awaited<ReturnType<Poll>> | null = await pollOnce(cursor, signal).catch(
        () => null,
      );
      if (signal.aborted) {
        return;
      }
      if (answer === null) {
        if (isOpen) {
          triesSinceLoss += 1;
          announce(false, "polling");
        }
        // Wait before the next try, with the same backoff as the WebSocket.
        await new Promise((resolve) => {
          const timerId = setTimeout(resolve, backoffDelay(failures, Math.random()));
          signal.addEventListener("abort", () => resolve(clearTimeout(timerId)), { once: true });
        });
        failures += 1;
        continue;
      }
      failures = 0;
      cursor = answer.cursor;
      if (!isOpen) {
        announce(true, "polling");
      }
      answer.frames.forEach(deliver);
    }
  }

  function stopPolling() {
    polling?.abort();
    polling = undefined;
  }

  /** The browser says the network is back. It is only a hint, so we just try now. */
  function retryNow() {
    if (retryTimerId !== undefined && !isSocketOpen) {
      clearTimeout(retryTimerId);
      openSocket();
    }
  }

  window.addEventListener("online", retryNow);
  openSocket();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    send(frame) {
      if (isSocketOpen) {
        connection?.send(frame);
      }
    },
    isOpen: () => isOpen,
    close() {
      window.removeEventListener("online", retryNow);
      clearTimeout(retryTimerId);
      closeSocket();
      stopPolling();
      listeners.clear();
      isOpen = false;
    },
  };
}
