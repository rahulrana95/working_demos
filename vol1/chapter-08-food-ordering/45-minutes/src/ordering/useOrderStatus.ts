/*
 * PART OF THE INTERVIEW: yes (about 14 minutes).
 * This hook is the heart of the answer. It asks the server for the order
 * every 5 seconds and keeps the newest answer.
 *
 * Why it holds at scale:
 *   1. An answer older than the one on screen is ignored, so the status
 *      never moves backwards.
 *   2. Polling stops for ever when the order is delivered or cancelled.
 *   3. A hidden tab sends nothing. A tab that becomes visible asks at once.
 *   4. A failing server is asked less often: after 10, 20, 40, then every 60 seconds.
 */
import { useEffect, useState } from "react";
import type { FetchOrder, Order, OrderStatus } from "./types";

export const POLL_MS = 5000;
export const MAX_POLL_MS = 60_000;

export function isFinalStatus(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}

/** 5 seconds after a good answer. After failures: 10, 20, 40, then 60 seconds. */
export function pollDelayMs(failures: number): number {
  return Math.min(MAX_POLL_MS, POLL_MS * 2 ** failures);
}

/** Keeps the order the server changed last. An old answer can arrive late. */
export function newerOrder(current: Order | null, incoming: Order): Order {
  return current !== null && incoming.updatedAt < current.updatedAt ? current : incoming;
}

export interface OrderStatusState {
  /** The newest order we know, or null before the first answer. */
  order: Order | null;
  /** True after a failed request, until the next good answer. */
  isReconnecting: boolean;
}

export function useOrderStatus(orderId: string, fetchOrder: FetchOrder): OrderStatusState {
  const [state, setState] = useState<OrderStatusState>({ order: null, isReconnecting: false });

  useEffect(() => {
    let latest: Order | null = null;
    let failures = 0;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;

    function stop(): void {
      clearTimeout(timerId);
      request?.abort();
    }

    function isDone(): boolean {
      return latest !== null && isFinalStatus(latest.status);
    }

    /** Takes the answer of one poll (null for a failure) and plans the next poll. */
    function settle(incoming: Order | null): void {
      failures = incoming === null ? failures + 1 : 0;
      latest = incoming === null ? latest : newerOrder(latest, incoming);
      setState({ order: latest, isReconnecting: incoming === null });

      if (!isDone() && !document.hidden) {
        timerId = setTimeout(poll, pollDelayMs(failures));
      }
    }

    function poll(): void {
      stop();
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

    function onVisibilityChange(): void {
      if (document.hidden) {
        stop();
      } else if (!isDone()) {
        poll();
      }
    }

    setState({ order: null, isReconnecting: false });
    poll();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [orderId, fetchOrder]);

  return state;
}
