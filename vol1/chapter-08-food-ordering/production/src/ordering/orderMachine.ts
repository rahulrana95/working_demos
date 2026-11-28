/*
 * NOT PART OF THE INTERVIEW: production version.
 * The life of an order, written as data. The table says which status can
 * come directly after which. Everything else is derived from it.
 *
 * Why it holds at scale: with many servers, queues and retries, an update
 * can be late, sent twice, or wrong. The page shows only what the table allows.
 */
import type { Order, OrderStatus } from "./types";

export const NEXT_STATUSES: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["picked_up", "cancelled"],
  picked_up: ["arriving", "cancelled"],
  arriving: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

/**
 * True when `to` can come after `from`, in one step or in several. Several,
 * because the page can miss steps: a poll every 5 seconds does not see a
 * status that lasted 2 seconds.
 */
export function canReach(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUSES[from].some((next) => next === to || canReach(next, to));
}

export type UpdateVerdict = "accepted" | "stale" | "impossible";

/**
 * Decides what to do with an update:
 *   - "stale": the server made it before the one on screen. It is dropped, quietly.
 *   - "impossible": it is newer, but its status cannot follow the one on
 *     screen (delivered, then preparing). It is dropped and reported.
 *   - "accepted": it is shown.
 */
export function judgeUpdate(current: Order | null, incoming: Order): UpdateVerdict {
  if (current === null) {
    return "accepted";
  }
  if (incoming.updatedAt < current.updatedAt) {
    return "stale";
  }
  const isSameStatus = incoming.status === current.status;
  return isSameStatus || canReach(current.status, incoming.status) ? "accepted" : "impossible";
}
