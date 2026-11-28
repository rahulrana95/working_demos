/*
 * NOT PART OF THE INTERVIEW: production version.
 * The cart is a pure reducer: old lines and an action go in, new lines come out.
 * Write it before any component, and test it without a browser.
 *
 * Why it holds at scale:
 *   1. Money is whole paise. 3 × ₹33.35 is 10005 paise, never 100.05000000000001.
 *   2. The cart holds ids and quantities only. A price that changes on the
 *      server can never be stale in a saved cart.
 *   3. One function sets a quantity, so the limits hold for every action.
 */
import type { CartLine, MenuItem, OrderLine } from "./types";

export const MAX_QUANTITY = 10;

export type CartAction =
  | { type: "add"; item: MenuItem }
  | { type: "remove"; itemId: string }
  | { type: "setQuantity"; itemId: string; quantity: number }
  | { type: "clear" }
  /** Takes the cart of another tab as it is. See cartSync.ts. */
  | { type: "replace"; lines: CartLine[] };

export function quantityOf(lines: CartLine[], itemId: string): number {
  return lines.find((line) => line.itemId === itemId)?.quantity ?? 0;
}

/** Sets one quantity, kept between 0 and the limit. A line with 0 leaves the cart. */
function withQuantity(lines: CartLine[], itemId: string, quantity: number): CartLine[] {
  if (!Number.isFinite(quantity)) {
    return lines;
  }
  const line = { itemId, quantity: Math.min(MAX_QUANTITY, Math.max(0, Math.trunc(quantity))) };
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
    case "setQuantity":
      return withQuantity(lines, action.itemId, action.quantity);
    case "clear":
      return [];
    case "replace":
      return action.lines;
  }
}

/** The lines we can send to the server: the item is on the menu and available. */
export function orderableLines(lines: CartLine[], items: Map<string, MenuItem>): OrderLine[] {
  return lines.flatMap((line) => {
    const item = items.get(line.itemId);
    return item?.available ? [{ ...line, unitPrice: item.price }] : [];
  });
}

export function cartTotals(lines: CartLine[], items: Map<string, MenuItem>) {
  let count = 0;
  let totalPaise = 0;
  for (const line of orderableLines(lines, items)) {
    count += line.quantity;
    totalPaise += line.quantity * line.unitPrice;
  }
  return { count, totalPaise };
}

export type FormatPrice = (paise: number) => string;

/**
 * Makes the function that writes a price for the user, for example "₹220.50".
 * The division by 100 is the only place where paise become a fraction, and
 * the result is only shown, never used in a sum.
 */
export function createPriceFormatter(locale: string, currency: string): FormatPrice {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  return (paise) => format.format(paise / 100);
}
