/*
 * NOT PART OF THE INTERVIEW: production version.
 * Saves the cart in sessionStorage, one cart for each restaurant, so a reload
 * does not empty it. Storage can be full, switched off, or changed by hand,
 * so both functions never throw.
 */
import { MAX_QUANTITY } from "./cart";
import type { CartLine } from "./types";

function storageKey(restaurantId: string): string {
  return `cart:${restaurantId}`;
}

export function isCartLine(value: unknown): value is CartLine {
  const { itemId, quantity } = (value ?? {}) as Partial<CartLine>;
  const isWholeNumber = typeof quantity === "number" && Number.isInteger(quantity);
  return typeof itemId === "string" && isWholeNumber && quantity >= 1 && quantity <= MAX_QUANTITY;
}

export function loadCart(restaurantId: string): CartLine[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey(restaurantId)) ?? "[]");
    return Array.isArray(saved) ? saved.filter(isCartLine) : [];
  } catch {
    return [];
  }
}

export function saveCart(restaurantId: string, lines: CartLine[]): void {
  try {
    sessionStorage.setItem(storageKey(restaurantId), JSON.stringify(lines));
  } catch {
    // The cart still works from memory. It is only lost on a reload.
  }
}
