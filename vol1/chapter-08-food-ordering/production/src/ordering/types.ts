/*
 * NOT PART OF THE INTERVIEW: production version.
 * Write these types first. They are the contract between the pages and the server.
 */

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  /** In paise, as a whole number. 22000 is ₹220.00. Money is never a fraction. */
  price: number;
  isVeg: boolean;
  imageUrl?: string;
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
  courier?: { name: string } & Position;
}

export interface Position {
  lat: number;
  lng: number;
}

/** A cart line as we send it: with the price the user saw on the menu. */
export interface OrderLine extends CartLine {
  unitPrice: number;
}

/*
 * The functions the pages need. The app passes them in, so the pages
 * never see a URL or a status code. Each one must:
 *   - stop its network call when the signal is aborted,
 *   - resolve only with a real answer of the server,
 *   - reject for every failure (a 500, a broken connection, bad JSON).
 */
export type FetchMenu = (restaurantId: string, signal: AbortSignal) => Promise<MenuCategory[]>;

export type FetchOrder = (orderId: string, signal: AbortSignal) => Promise<Order>;

/**
 * The server must create one order for one idempotency key. When it sees a
 * key again, it answers with the order it already created for that key.
 *
 * When a price in `lines` is not the price of the server, or a dish is not
 * available any more, the server creates no order and the function rejects
 * with `new CartChangedError(changes)`. See cartChanges.ts.
 */
export type PlaceOrder = (
  lines: OrderLine[],
  idempotencyKey: string,
  signal: AbortSignal,
) => Promise<Order>;

/**
 * Opens a stream of updates for one order (server-sent events, for example)
 * and returns the function that closes it. The stream must:
 *   - call `onUpdate` for every update, also for a move of the courier,
 *   - call `onError` once when the connection breaks, and not reconnect by
 *     itself (an EventSource must be closed in its `onerror`),
 *   - call nothing before it returns, and nothing after it was closed.
 */
export type SubscribeToOrder = (
  orderId: string,
  onUpdate: (order: Order) => void,
  onError: () => void,
) => () => void;
