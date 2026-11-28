/*
 * NOT PART OF THE INTERVIEW: production version.
 * The user pays on the page of a payment provider. That page is not ours:
 * the browser leaves our app and comes back later with a full page load, and
 * everything in memory is gone. So before the user leaves, we save the id of
 * the order. When the app starts again, it finds the id and shows the status page.
 *
 * localStorage, not sessionStorage: some in-app browsers open the payment
 * page, or the return page, in a new tab, and a new tab has an empty sessionStorage.
 */

const STORAGE_KEY = "pending-order";
/** A saved id older than this is forgotten. No order takes a day. */
export const PENDING_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingOrder {
  orderId: string;
  savedAt: number;
}

export function savePendingOrder(orderId: string): void {
  try {
    const pending: PendingOrder = { orderId, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Storage is blocked. After the payment the user lands on the menu, not on the status page.
  }
}

export function readPendingOrder(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as PendingOrder | null;
    const isValid =
      typeof saved?.orderId === "string" &&
      typeof saved.savedAt === "number" &&
      Date.now() - saved.savedAt < PENDING_ORDER_MAX_AGE_MS;
    return isValid ? saved.orderId : null;
  } catch {
    return null;
  }
}

export function clearPendingOrder(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the saved id gets too old by itself.
  }
}
