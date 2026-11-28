/*
 * NOT PART OF THE INTERVIEW: production version.
 * What the two pages report to analytics and monitoring.
 *
 * An event holds counts, times and the names of statuses. It never holds an
 * address, a phone number, a name, a position, the text of a search, or the
 * id of an order or a dish.
 */
import type { OrderStatus } from "./types";

export type OrderingEvent =
  /** The menu is on screen. `durationMs` runs from the start of the page to the first dishes. */
  | { type: "menu_viewed"; dishCount: number; durationMs: number; fromCache: boolean }
  | { type: "item_added"; cartCount: number }
  | { type: "checkout_started"; lineCount: number; totalPaise: number }
  /** `attempts` is 1 when the first tap worked. */
  | { type: "order_placed"; durationMs: number; attempts: number }
  | { type: "order_failed"; reason: "failed" | "timeout" | "cart_changed"; durationMs: number }
  | {
      type: "status_changed";
      from: OrderStatus | null;
      to: OrderStatus;
      source: "stream" | "request";
      /** How old the update was when we got it: our clock minus the server's `updatedAt`. */
      delayMs: number;
    }
  /** The stream broke too often, and the page polls from now on. */
  | { type: "stream_fell_back"; reconnects: number }
  /** The server sent a status that cannot follow the one on screen. It was not shown. */
  | { type: "update_rejected"; from: OrderStatus; to: OrderStatus }
  /** The map threw an error and was taken off the page. The rest of the page still works. */
  | { type: "map_failed" };

export type OnOrderingEvent = (event: OrderingEvent) => void;
