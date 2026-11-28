/*
 * NOT PART OF THE INTERVIEW: production version.
 * This hook keeps the newest order we know. It listens to a stream of
 * updates when the app gives one, and asks the server every 5 seconds when
 * there is no stream or the stream keeps breaking.
 *
 * Why it holds at scale:
 *   1. An update older than the one on screen is ignored, and a status that
 *      cannot follow the one on screen is refused and reported. The status
 *      never moves backwards. See orderMachine.ts.
 *   2. Everything stops for ever when the order is delivered or cancelled.
 *   3. A hidden tab sends nothing and holds no connection, unless the user
 *      asked for notifications. A tab that becomes visible, and a browser
 *      that comes back online, connect and ask at once.
 *   4. A failing server is asked less often: after 10, 20, 40, then every 60 seconds.
 *   5. A broken stream is opened again after about 1, 2 and 4 seconds. The
 *      waits are random in part, so a million clients that lost the same
 *      server do not all come back in the same second.
 *   6. After three reconnects that brought no update, we stop trying the
 *      stream and poll. A network that blocks streams still shows the order.
 *   7. A request with no answer in 10 seconds counts as failed.
 */
import { useEffect, useState } from "react";
import type { OnOrderingEvent } from "./events";
import { judgeUpdate } from "./orderMachine";
import type { FetchOrder, Order, OrderStatus, SubscribeToOrder } from "./types";
import { useLatest } from "./useLatest";

export const POLL_MS = 5000;
export const MAX_POLL_MS = 60_000;
export const REQUEST_TIMEOUT_MS = 10_000;
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

export interface OrderStatusOptions {
  /** A stream of updates. Without it, the hook asks the server every 5 seconds. */
  subscribeToOrder?: SubscribeToOrder;
  onEvent?: OnOrderingEvent;
  /** True when the user asked for notifications: the hook then also works in a hidden tab. */
  keepsListeningWhenHidden?: boolean;
}

export interface OrderStatusState {
  /** The newest order we know, or null before the first answer. */
  order: Order | null;
  /** True after a failed request or a broken stream, until the next good update. */
  isReconnecting: boolean;
  /** Our clock when we got the order that is on screen, or null before the first answer. */
  receivedAt: number | null;
}

const NOTHING_YET: OrderStatusState = { order: null, isReconnecting: false, receivedAt: null };

export function useOrderStatus(
  orderId: string,
  fetchOrder: FetchOrder,
  options: OrderStatusOptions = {},
): OrderStatusState {
  const [state, setState] = useState(NOTHING_YET);
  const fetchOrderRef = useLatest(fetchOrder);
  const optionsRef = useLatest(options);
  const hasStream = options.subscribeToOrder !== undefined;

  useEffect(() => {
    let latest: Order | null = null;
    let receivedAt: number | null = null;
    let failures = 0;
    let streamFailures = 0;
    let usesStream = hasStream;
    // One timer: it waits for the next poll, for an answer, or for the next reconnect.
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

    function isPaused(): boolean {
      return document.hidden && optionsRef.current.keepsListeningWhenHidden !== true;
    }

    /** Keeps the update when the state machine allows it, and reports what happened. */
    function take(incoming: Order, source: "stream" | "request"): void {
      const verdict = judgeUpdate(latest, incoming);
      if (verdict === "impossible" && latest !== null) {
        optionsRef.current.onEvent?.({
          type: "update_rejected",
          from: latest.status,
          to: incoming.status,
        });
      }
      if (verdict !== "accepted") {
        return;
      }
      if (incoming.status !== latest?.status) {
        optionsRef.current.onEvent?.({
          type: "status_changed",
          from: latest?.status ?? null,
          to: incoming.status,
          source,
          // The two clocks can differ, so the number is never below zero.
          delayMs: Math.max(0, Date.now() - incoming.updatedAt),
        });
      }
      latest = incoming;
      receivedAt = Date.now();
    }

    /** Shows a good update (or null for a failure). Returns false when the order is finished. */
    function show(incoming: Order | null, source: "stream" | "request"): boolean {
      if (incoming !== null) {
        take(incoming, source);
      }
      setState({ order: latest, isReconnecting: incoming === null, receivedAt });
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
      if (show(incoming, "request") && needsNextPoll && !isPaused()) {
        timerId = setTimeout(poll, pollDelayMs(failures));
      }
    }

    function poll(): void {
      stopPolling();
      const current = new AbortController();
      request = current;
      timerId = setTimeout(() => {
        current.abort();
        settle(null);
      }, REQUEST_TIMEOUT_MS);

      // An aborted request is not a failure. Its answer, good or bad, is dropped.
      const settleIfCurrent = (incoming: Order | null) => {
        if (!current.signal.aborted) {
          clearTimeout(timerId);
          settle(incoming);
        }
      };
      fetchOrderRef
        .current(orderId, current.signal)
        .then(settleIfCurrent, () => settleIfCurrent(null));
    }

    function onStreamError(): void {
      stop();
      streamFailures += 1;
      setState({ order: latest, isReconnecting: true, receivedAt });
      if (streamFailures > MAX_STREAM_RECONNECTS) {
        usesStream = false;
        optionsRef.current.onEvent?.({
          type: "stream_fell_back",
          reconnects: MAX_STREAM_RECONNECTS,
        });
        poll();
      } else if (!isPaused()) {
        timerId = setTimeout(connect, streamRetryDelayMs(streamFailures));
      }
    }

    function connect(): void {
      stop();
      const subscribe = optionsRef.current.subscribeToOrder;
      if (subscribe === undefined) {
        // The app took the stream away between two reconnects.
        poll();
        return;
      }
      let isOpen = true;
      const close = subscribe(
        orderId,
        (incoming) => {
          if (isOpen) {
            // An update proves that the stream works, so the count starts again.
            streamFailures = 0;
            show(incoming, "stream");
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
      if (isPaused()) {
        stop();
      } else if (!document.hidden && !isDone()) {
        start();
      }
    }

    /** The network is back: ask now, and do not sit out a wait of up to 60 seconds. */
    function onOnline(): void {
      if (!isPaused() && !isDone()) {
        start();
      }
    }

    setState(NOTHING_YET);
    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [orderId, hasStream, fetchOrderRef, optionsRef]);

  return state;
}
