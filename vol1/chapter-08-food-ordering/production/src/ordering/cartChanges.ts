/*
 * NOT PART OF THE INTERVIEW: production version.
 * A price can change, or a dish can run out, between the moment the user
 * reads the menu and the moment the order reaches the server. The server
 * then creates no order and tells us what changed.
 */
import type { MenuCategory } from "./types";

export type CartChange =
  | { itemId: string; reason: "price_changed"; newPrice: number }
  | { itemId: string; reason: "unavailable" };

/** `placeOrder` rejects with this error when the server did not accept the cart as sent. */
export class CartChangedError extends Error {
  constructor(readonly changes: CartChange[]) {
    super("The cart changed on the server");
    this.name = "CartChangedError";
  }
}

/**
 * Returns the menu with the changes of the server in it. A dish that did not
 * change is the same object as before, so its row is not drawn again.
 */
export function applyCartChanges(
  categories: MenuCategory[],
  changes: CartChange[],
): MenuCategory[] {
  if (changes.length === 0) {
    return categories;
  }
  // A later change of the same dish wins.
  const byItem = new Map(changes.map((change) => [change.itemId, change]));
  return categories.map((category) => ({
    ...category,
    items: category.items.map((item) => {
      const change = byItem.get(item.id);
      if (change === undefined) {
        return item;
      }
      return change.reason === "unavailable"
        ? { ...item, available: false }
        : { ...item, price: change.newPrice };
    }),
  }));
}
