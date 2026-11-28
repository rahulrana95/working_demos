/*
 * PART OF THE INTERVIEW: yes (about 7 minutes).
 * The cart is a pure reducer: old lines and an action go in, new lines come out.
 * Write it before any component, and test it without a browser.
 *
 * Why it holds at scale:
 *   1. Money is whole paise. 3 × ₹33.35 is 10005 paise, never 100.05000000000001.
 *   2. The cart holds ids and quantities only. A price that changes on the
 *      server can never be stale in a saved cart.
 *   3. One function sets a quantity, so the limits hold for every action.

 */
import type { CartLine, MenuItem } from "./types";

export const MAX_QUANTITY = 10;

export type CartAction =
  | { type: "add"; item: MenuItem }
  | { type: "remove"; itemId: string }
  | { type: "clear" };

export function quantityOf(lines: CartLine[], itemId: string): number {
  return lines.find((line) => line.itemId === itemId)?.quantity ?? 0;
}

/** Sets one quantity, kept between 0 and the limit. A line with 0 leaves the cart. */
function withQuantity(lines: CartLine[], itemId: string, quantity: number): CartLine[] {
  const line = { itemId, quantity: Math.min(MAX_QUANTITY, Math.max(0, quantity)) };
  const isInCart = lines.some((other) => other.itemId === itemId);
  const next = isInCart
    ? lines.map((other) => (other.itemId === itemId ? line : other))
    : [...lines, line];
  return next.filter((other) => other.quantity > 0);
}

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const { item } = action;
      return item.available ? withQuantity(lines, item.id, quantityOf(lines, item.id) + 1) : lines;
    }
    case "remove":
      return withQuantity(lines, action.itemId, quantityOf(lines, action.itemId) - 1);
    case "clear":
      return [];
  }
}

/**
 * The lines we can send to the server: the dish is on the menu and available.
 * A saved cart can hold a dish that ran out since it was saved.
 */
export function orderableLines(lines: CartLine[], items: Map<string, MenuItem>): CartLine[] {
  return lines.filter((line) => items.get(line.itemId)?.available === true);
}

export function cartTotals(lines: CartLine[], items: Map<string, MenuItem>) {
  let count = 0;
  let totalPaise = 0;
  for (const line of orderableLines(lines, items)) {
    count += line.quantity;
    // The line passed orderableLines, so the dish is in the map.
    totalPaise += line.quantity * items.get(line.itemId)!.price;
  }
  return { count, totalPaise };
}

/** 22050 becomes "₹220.50". We split the whole number, so no fraction is ever computed. */
export function formatPaise(paise: number): string {
  return `₹${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}
