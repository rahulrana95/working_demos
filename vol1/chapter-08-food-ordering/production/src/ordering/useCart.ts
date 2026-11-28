/*
 * NOT PART OF THE INTERVIEW: production version.
 * The cart of one restaurant: read from sessionStorage, saved on every
 * change, and kept the same in every tab.
 */
import { useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import type { CartAction } from "./cart";
import { cartReducer } from "./cart";
import { loadCart, saveCart } from "./cartStorage";
import { openCartChannel } from "./cartSync";
import type { CartChannel } from "./cartSync";
import type { CartLine } from "./types";
import { useLatest } from "./useLatest";

export function useCart(restaurantId: string): [CartLine[], Dispatch<CartAction>] {
  // The saved cart is read once, on the first render.
  const [lines, dispatch] = useReducer(cartReducer, restaurantId, loadCart);
  const linesRef = useLatest(lines);
  const channelRef = useRef<CartChannel | null>(null);
  // The cart that the other tabs already know, as text. It starts as our
  // own first cart, so a new and empty tab does not empty the others.
  const knownByOthersRef = useRef(JSON.stringify(lines));

  useEffect(() => {
    const channel = openCartChannel(
      restaurantId,
      () => linesRef.current,
      (theirLines) => {
        knownByOthersRef.current = JSON.stringify(theirLines);
        dispatch({ type: "replace", lines: theirLines });
      },
    );
    channelRef.current = channel;
    return () => channel.close();
  }, [restaurantId, linesRef]);

  useEffect(() => {
    saveCart(restaurantId, lines);
    // A cart that came from another tab is not sent back, or two tabs would
    // send the same cart to each other for ever.
    const content = JSON.stringify(lines);
    if (content !== knownByOthersRef.current) {
      knownByOthersRef.current = content;
      channelRef.current?.send(lines);
    }
  }, [restaurantId, lines]);

  return [lines, dispatch];
}
