/*
 * NOT PART OF THE INTERVIEW: production version.
 * Joins the two pages: the restaurant page, the payment on the page of an
 * outside provider, and the status page.
 *
 * The hard part is the way back from the payment. The browser left our app,
 * so nothing in memory is left. The id of the order was saved before the
 * user left (see pendingOrder.ts), and this component reads it when it starts.
 */
import { useRef, useState } from "react";
import { DEFAULT_MESSAGES } from "./messages";
import { OrderStatusPage } from "./OrderStatusPage";
import type { OrderStatusPageProps } from "./OrderStatusPage";
import { clearPendingOrder, readPendingOrder, savePendingOrder } from "./pendingOrder";
import { RestaurantPage } from "./RestaurantPage";
import type { RestaurantPageProps } from "./RestaurantPage";
import type { Order } from "./types";

export interface OrderingFlowProps
  extends
    Omit<RestaurantPageProps, "onOrderPlaced">,
    Omit<OrderStatusPageProps, "orderId" | "onOrderFinished"> {
  /**
   * Sends the user to the payment page, for example with `location.assign`.
   * The id of the order is already saved when this is called. Without this
   * function there is no payment step, and the status page is shown at once.
   */
  startPayment?: (order: Order) => void;
}

export function OrderingFlow({ startPayment, ...props }: OrderingFlowProps) {
  // Read once, when the app starts: also when it starts on the way back from the payment.
  const [orderId, setOrderId] = useState(readPendingOrder);
  const flowRef = useRef<HTMLDivElement>(null);
  const text = { ...DEFAULT_MESSAGES, ...props.messages };

  function showPage(nextOrderId: string | null): void {
    setOrderId(nextOrderId);
    // The page changed. Focus moves to its start, so a keyboard or screen
    // reader user is not left on a button that is gone.
    flowRef.current?.focus();
  }

  function onOrderPlaced(order: Order): void {
    // Saved first: after startPayment this page may be gone at any moment.
    savePendingOrder(order.id);
    startPayment?.(order);
    showPage(order.id);
  }

  function backToMenu(): void {
    clearPendingOrder();
    showPage(null);
  }

  return (
    <div className="ordering-flow" ref={flowRef} tabIndex={-1}>
      {orderId === null ? (
        <RestaurantPage {...props} onOrderPlaced={onOrderPlaced} />
      ) : (
        <>
          {/* A finished order is forgotten, so the next start of the app shows the menu. */}
          <OrderStatusPage {...props} orderId={orderId} onOrderFinished={clearPendingOrder} />
          <button type="button" className="button" onClick={backToMenu}>
            {text.backToMenu}
          </button>
        </>
      )}
    </div>
  );
}
