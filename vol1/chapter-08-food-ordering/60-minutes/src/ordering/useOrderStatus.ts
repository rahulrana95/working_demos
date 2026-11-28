/*
 * PART OF THE INTERVIEW: yes (about 22 minutes).
 * This hook is the heart of the answer. It keeps the newest order we know.
 * It listens to a stream of updates when the app gives one, and asks the
 * server every 5 seconds when there is no stream or the stream keeps breaking.
 *
 * Why it holds at scale:
 *   1. An update older than the one on screen is ignored, so the status
 *      never moves backwards. The stream and a request can answer in any order.
 *   2. Everything stops for ever when the order is delivered or cancelled.
 *   3. A hidden tab sends nothing and holds no connection. A tab that
 *      becomes visible connects and asks at once.
 *   4. A failing server is asked less often: after 10, 20, 40, then every 60 seconds.
 *   5. A broken stream is opened again after about 1, 2 and 4 seconds. The
 *      waits are random in part, so a million clients that lost the same
 *      server do not all come back in the same second.
 *   6. After three reconnects that brought no update, we stop trying the
 *      stream and poll. A network that blocks streams still shows the order.
 */
import { useEffect, useState } from "react";
import type { FetchOrder, Order, OrderStatus, SubscribeToOrder } from "./types";

export const POLL_MS = 5000;
export const MAX_POLL_MS = 60_000;
export const STREAM_RETRY_MS = 1000;
export const MAX_STREAM_RECONNECTS = 3;

export function isFinalStatus(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}

/** 5 seconds after a good answer. After failures: 10, 20, 40, then 60 seconds. */
export function pollDelayMs(failures: number): number {
  return Math.min(MAX_POLL_MS, POLL_MS * 2 ** failures);
}

/**
 * The wait before reconnect number 1, 2, 3: at most 1, 2, 4 seconds, and at
 * least half of that. `random` is a number from 0 to 1.
 */
export function streamRetryDelayMs(reconnect: number, random = Math.random()): number {
  const longest = STREAM_RETRY_MS * 2 ** (reconnect - 1);
  return longest / 2 + (random * longest) / 2;
}

/** Keeps the order the server changed last. An old answer can arrive late. */
export function newerOrder(current: Order | null, incoming: Order): Order {
  return current !== null && incoming.updatedAt < current.updatedAt ? current : incoming;
}

export interface OrderStatusState {
  /** The newest order we know, or null before the first answer. */
  order: Order | null;
  /** True after a failed request or a broken stream, until the next good update. */
  isReconnecting: boolean;
}

export function useOrderStatus(
  orderId: string,
  fetchOrder: FetchOrder,
  subscribeToOrder?: SubscribeToOrder,
): OrderStatusState {
  const [state, setState] = useState<OrderStatusState>({ order: null, isReconnecting: false });

  useEffect(() => {
    let latest: Order | null = null;
    let failures = 0;
    let streamFailures = 0;
    let usesStream = subscribeToOrder !== undefined;
    // One timer: it waits for the next poll or for the next reconnect.
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;
    let closeStream: (() => void) | null = null;

    function stopPolling(): void {
      clearTimeout(timerId);
      request?.abort();
    }

    function stop(): void {
      stopPolling();
      closeStream?.();
      closeStream = null;
    }

    function isDone(): boolean {
      return latest !== null && isFinalStatus(latest.status);
    }

    /** Shows a good update (or null for a failure). Returns false when the order is finished. */
    function show(incoming: Order | null): boolean {
      latest = incoming === null ? latest : newerOrder(latest, incoming);
      setState({ order: latest, isReconnecting: incoming === null });
      if (isDone()) {
        stop();
      }
      return !isDone();
    }

    /** Takes the answer of one request (null for a failure) and plans the next one. */
    function settle(incoming: Order | null): void {
      failures = incoming === null ? failures + 1 : 0;
      // With a live stream, a good answer needs no next request. A failed one is tried again.
      const needsNextPoll = incoming === null || !usesStream;
      if (show(incoming) && needsNextPoll && !document.hidden) {
        timerId = setTimeout(poll, pollDelayMs(failures));
      }
    }

    function poll(): void {
      stopPolling();
      const current = new AbortController();
      request = current;

      // An aborted request is not a failure. Its answer, good or bad, is dropped.
      const settleIfCurrent = (incoming: Order | null) => {
        if (!current.signal.aborted) {
          settle(incoming);
        }
      };
      fetchOrder(orderId, current.signal).then(settleIfCurrent, () => settleIfCurrent(null));
    }

    function onStreamError(): void {
      stop();
      streamFailures += 1;
      setState({ order: latest, isReconnecting: true });
      if (streamFailures > MAX_STREAM_RECONNECTS) {
        usesStream = false;
        poll();
      } else if (!document.hidden) {
        timerId = setTimeout(connect, streamRetryDelayMs(streamFailures));
      }
    }

    function connect(): void {
      stop();
      let isOpen = true;
      // usesStream is only true when the app gave a subscribe function, so "!" is safe.
      const close = subscribeToOrder!(
        orderId,
        (incoming) => {
          if (isOpen) {
            // An update proves that the stream works, so the count starts again.
            streamFailures = 0;
            show(incoming);
          }
        },
        () => isOpen && onStreamError(),
      );
      closeStream = () => {
        isOpen = false;
        close();
      };
      // The stream only sends what changes from now on. One request catches
      // up with what we missed while we were not connected.
      poll();
    }

    function start(): void {
      if (usesStream) {
        connect();
      } else {
        poll();
      }
    }

    function onVisibilityChange(): void {
      if (document.hidden) {
        stop();
      } else if (!isDone()) {
        start();
      }
    }

    setState({ order: null, isReconnecting: false });
    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [orderId, fetchOrder, subscribeToOrder]);

  return state;
}
