/*
 * PART OF THE INTERVIEW: yes (about 3 minutes).
 * Write these types first. They are the contract between the pages and the server.
 */

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  /** In paise, as a whole number. 22000 is ₹220.00. Money is never a fraction. */
  price: number;
  isVeg: boolean;
  available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

/** The cart holds no price. The price always comes from the menu. */
export interface CartLine {
  itemId: string;
  quantity: number;
}

/** The steps of an order, in the order they happen. An order can also be cancelled. */
export const ORDER_STEPS = [
  "placed",
  "accepted",
  "preparing",
  "picked_up",
  "arriving",
  "delivered",
] as const;

export type OrderStatus = (typeof ORDER_STEPS)[number] | "cancelled";

export interface Order {
  id: string;
  status: OrderStatus;
  etaMinutes: number;
  /** The server's clock in milliseconds when the order last changed. It only grows. */
  updatedAt: number;
}

/*
 * The three functions the pages need. The app passes them in, so the pages
 * never see a URL or a status code. Each one must:
 *   - stop its network call when the signal is aborted,
 *   - resolve only with a real answer of the server,
 *   - reject for every failure (a 500, a broken connection, bad JSON),
 *   - be the same function on every render (define it outside the
 *     component, or wrap it in useCallback). A new function starts the
 *     loading or the polling again.
 */
export type FetchMenu = (restaurantId: string, signal: AbortSignal) => Promise<MenuCategory[]>;

export type FetchOrder = (orderId: string, signal: AbortSignal) => Promise<Order>;

/**
 * The server must create one order for one idempotency key. When it sees a
 * key again, it answers with the order it already created for that key.
 */
export type PlaceOrder = (
  cart: CartLine[],
  idempotencyKey: string,
  signal: AbortSignal,
) => Promise<Order>;
