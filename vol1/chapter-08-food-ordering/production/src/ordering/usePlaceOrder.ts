/*
 * NOT PART OF THE INTERVIEW: production version.
 * Places the order. The user may tap twice, and the network may fail after
 * the server already created the order. Both must end in one order.
 *
 * Why it holds at scale:
 *   1. A second tap while a request is in flight is ignored.
 *   2. Every request carries an idempotency key. A retry of the same cart
 *      sends the same key, so the server answers with the order it already
 *      has and does not create a second one.
 *   3. A changed cart is a new order, so it gets a new key.
 *   4. When the server says a price changed, the user sees what changed and
 *      must tap again. No order is placed at a price the user did not see.
 *   5. A request with no answer in 15 seconds is a failure the user can
 *      retry. The retry sends the same key, so it is safe.
 */
import { useEffect, useRef, useState } from "react";
import { CartChangedError } from "./cartChanges";
import type { CartChange } from "./cartChanges";
import type { OnOrderingEvent } from "./events";
import { TimeoutError, withTimeout } from "./timeout";
import type { Order, OrderLine, PlaceOrder } from "./types";
import { useLatest } from "./useLatest";

export const PLACE_ORDER_TIMEOUT_MS = 15_000;

export type CheckoutState =
  | { status: "idle" | "placing" }
  | { status: "failed"; reason: "failed" | "timeout" }
  /** The server refused the cart. The user must look at the changes and confirm. */
  | { status: "changed"; changes: CartChange[] };

export interface PlaceOrderCallbacks {
  onPlaced: (order: Order) => void;
  /** Called with what the server changed, so the page can correct its menu. */
  onCartChanged: (changes: CartChange[]) => void;
  onEvent?: OnOrderingEvent;
}

export function usePlaceOrder(
  lines: OrderLine[],
  placeOrder: PlaceOrder,
  callbacks: PlaceOrderCallbacks,
) {
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  const keyRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  /** How many times the user tapped for the order that is not placed yet. */
  const attemptsRef = useRef(0);
  const placeOrderRef = useLatest(placeOrder);
  const callbacksRef = useLatest(callbacks);

  // The key belongs to one cart. When the content of the cart changes, the
  // next tap is a new checkout attempt and makes a new key.
  const cartContent = JSON.stringify(lines);
  useEffect(() => {
    keyRef.current = null;
  }, [cartContent]);

  // The page is gone: stop the request, and never touch state after it.
  useEffect(() => () => requestRef.current?.abort(), []);

  async function submit(): Promise<void> {
    if (requestRef.current !== null || lines.length === 0) {
      return;
    }
    const request = new AbortController();
    requestRef.current = request;
    const key = (keyRef.current ??= crypto.randomUUID());
    const startedAt = performance.now();
    const elapsedMs = () => Math.round(performance.now() - startedAt);
    const emit: OnOrderingEvent = (event) => callbacksRef.current.onEvent?.(event);

    attemptsRef.current += 1;
    setState({ status: "placing" });
    emit({
      type: "checkout_started",
      lineCount: lines.length,
      totalPaise: lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0),
    });

    try {
      const order = await withTimeout(
        (signal) => placeOrderRef.current(lines, key, signal),
        PLACE_ORDER_TIMEOUT_MS,
        request.signal,
      );
      if (!request.signal.aborted) {
        requestRef.current = null;
        setState({ status: "idle" });
        emit({ type: "order_placed", durationMs: elapsedMs(), attempts: attemptsRef.current });
        attemptsRef.current = 0;
        callbacksRef.current.onPlaced(order);
      }
    } catch (error) {
      if (request.signal.aborted) {
        return;
      }
      requestRef.current = null;
      if (error instanceof CartChangedError) {
        // A clear "no": no order exists for this key. The next tap is a new attempt.
        keyRef.current = null;
        setState({ status: "changed", changes: error.changes });
        emit({ type: "order_failed", reason: "cart_changed", durationMs: elapsedMs() });
        callbacksRef.current.onCartChanged(error.changes);
      } else {
        // We do not know if the server created the order. So the key stays,
        // and the next tap asks about the same order.
        const reason = error instanceof TimeoutError ? "timeout" : "failed";
        setState({ status: "failed", reason });
        emit({ type: "order_failed", reason, durationMs: elapsedMs() });
      }
    }
  }

  return { state, submit };
}
