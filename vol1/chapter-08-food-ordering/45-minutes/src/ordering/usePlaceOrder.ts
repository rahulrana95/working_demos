/*
 * PART OF THE INTERVIEW: yes (about 7 minutes).
 * Places the order. The user may tap twice, and the network may fail after
 * the server already created the order. Both must end in one order.
 *
 * Why it holds at scale:
 *   1. A second tap while a request is in flight is ignored.
 *   2. Every request carries an idempotency key. A retry of the same cart
 *      sends the same key, so the server answers with the order it already
 *      has and does not create a second one.
 *   3. A changed cart is a new order, so it gets a new key.
 */
import { useEffect, useRef, useState } from "react";
import type { CartLine, Order, PlaceOrder } from "./types";

export type CheckoutStatus = "idle" | "placing" | "failed";

export function usePlaceOrder(
  lines: CartLine[],
  placeOrder: PlaceOrder,
  onPlaced: (order: Order) => void,
) {
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const keyRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

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
    keyRef.current ??= crypto.randomUUID();
    setStatus("placing");

    try {
      const order = await placeOrder(lines, keyRef.current, request.signal);
      if (!request.signal.aborted) {
        requestRef.current = null;
        setStatus("idle");
        onPlaced(order);
      }
    } catch {
      if (!request.signal.aborted) {
        // We do not know if the server created the order. So the key stays,
        // and the next tap asks about the same order.
        requestRef.current = null;
        setStatus("failed");
      }
    }
  }

  return { status, submit };
}
