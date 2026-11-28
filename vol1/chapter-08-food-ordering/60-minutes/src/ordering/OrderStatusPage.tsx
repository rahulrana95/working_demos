/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * The order status page. It only draws what useOrderStatus returns.
 */
import { ORDER_STEPS } from "./types";
import type { FetchOrder, OrderStatus, SubscribeToOrder } from "./types";
import { isFinalStatus, useOrderStatus } from "./useOrderStatus";

export interface OrderStatusPageProps {
  orderId: string;
  fetchOrder: FetchOrder;
  /** A stream of updates. Without it, the page asks the server every 5 seconds. */
  subscribeToOrder?: SubscribeToOrder;
}

/** "picked_up" becomes "Order picked up". The production version has real texts. */
const describe = (status: OrderStatus) => `Order ${status.replace("_", " ")}`;

export function OrderStatusPage({ orderId, fetchOrder, subscribeToOrder }: OrderStatusPageProps) {
  const { order, isReconnecting } = useOrderStatus(orderId, fetchOrder, subscribeToOrder);
  // -1 before the first answer and for a cancelled order: no step is the current one.
  const currentIndex = ORDER_STEPS.findIndex((step) => step === order?.status);

  return (
    <section className="order" aria-labelledby="order-heading">
      <h2 id="order-heading">Your order</h2>

      {/* A polite live region: a screen reader reads the new status when it changes. */}
      <p className="order__status" role="status">
        {order === null && !isReconnecting && "Loading your order…"}
        {order !== null && describe(order.status)}
      </p>

      {order !== null && !isFinalStatus(order.status) && (
        <p className="order__eta">Arriving in about {order.etaMinutes} minutes</p>
      )}

      {/* The last status stays on screen. This line only says it may be old. */}
      {isReconnecting && <p className="order__reconnecting">Reconnecting…</p>}

      {order !== null && (
        <ol className="steps">
          {ORDER_STEPS.map((step, index) => (
            <li
              key={step}
              className="steps__step"
              aria-current={index === currentIndex ? "step" : undefined}
            >
              {describe(step)}
              {index < currentIndex && <span className="visually-hidden"> (done)</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
