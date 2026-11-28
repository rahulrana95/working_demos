/*
 * NOT PART OF THE INTERVIEW: production version.
 * Keeps the cart of one restaurant the same in every tab. sessionStorage
 * belongs to one tab, and its "storage" event never reaches another tab, so
 * the tabs talk over a BroadcastChannel.
 *
 * A tab says "hello" when it opens. A tab that has a cart answers with it.
 * Every later change is sent to the other tabs.
 */
import { isCartLine } from "./cartStorage";
import type { CartLine } from "./types";

type CartMessage = { type: "hello" } | { type: "cart"; lines: unknown };

export interface CartChannel {
  /** Tells the other tabs about the cart of this tab. */
  send: (lines: CartLine[]) => void;
  close: () => void;
}

export function openCartChannel(
  restaurantId: string,
  getLines: () => CartLine[],
  onLines: (lines: CartLine[]) => void,
): CartChannel {
  // An old browser has no BroadcastChannel. The cart then lives in one tab.
  if (typeof BroadcastChannel === "undefined") {
    return { send: () => {}, close: () => {} };
  }
  const channel = new BroadcastChannel(`cart:${restaurantId}`);

  channel.onmessage = (event: MessageEvent<CartMessage>) => {
    const message = event.data;
    if (message?.type === "hello") {
      // Only a tab with something in the cart answers, so an empty new tab
      // never empties the others.
      if (getLines().length > 0) {
        channel.postMessage({ type: "cart", lines: getLines() });
      }
    } else if (message?.type === "cart" && Array.isArray(message.lines)) {
      // Another tab can run an older version of the app. Its lines are checked.
      onLines(message.lines.filter(isCartLine));
    }
  };
  channel.postMessage({ type: "hello" });

  return {
    send: (lines) => channel.postMessage({ type: "cart", lines }),
    close: () => channel.close(),
  };
}
