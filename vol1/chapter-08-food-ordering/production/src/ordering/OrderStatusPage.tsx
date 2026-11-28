/*
 * NOT PART OF THE INTERVIEW: production version.
 * The order status page. It draws what useOrderStatus returns, and adds what
 * a real page needs around it: how old the status is, an offline hint, a
 * short message for a new status, and the button for notifications.
 */
import { useEffect, useId } from "react";
import { CourierMap } from "./CourierMap";
import type { OnOrderingEvent } from "./events";
import { distanceKm } from "./geo";
import { MapBoundary } from "./MapBoundary";
import { DEFAULT_MESSAGES } from "./messages";
import type { OrderingMessages } from "./messages";
import { OfflineBanner } from "./OfflineBanner";
import { Skeleton } from "./Skeleton";
import { ORDER_STEPS } from "./types";
import type { FetchOrder, Position, SubscribeToOrder } from "./types";
import { useLatest } from "./useLatest";
import { useNow } from "./useNow";
import { useOnlineHint } from "./useOnlineHint";
import { isFinalStatus, useOrderStatus } from "./useOrderStatus";
import { useNotificationPermission, useStatusNotifications } from "./useStatusNotifications";

const SKELETON_ROWS = 4;
/** The text "Updated 2 minutes ago" is worked out again this often. */
const AGE_REFRESH_MS = 15_000;
const MINUTE_MS = 60_000;

export interface OrderStatusPageProps {
  orderId: string;
  fetchOrder: FetchOrder;
  /** A stream of updates. Without it, the page asks the server every 5 seconds. */
  subscribeToOrder?: SubscribeToOrder;
  /** Where the food goes. With it, the page draws the courier on a map. */
  destination?: Position;
  messages?: Partial<OrderingMessages>;
  /** Decides how numbers and times are written, for example "en-IN" or "hi-IN". */
  locale?: string;
  /** Receives the events for analytics and monitoring. They hold no personal data. */
  onEvent?: OnOrderingEvent;
  /** Called once, when the order is delivered or cancelled. */
  onOrderFinished?: () => void;
}

export function OrderStatusPage({
  orderId,
  fetchOrder,
  subscribeToOrder,
  destination,
  messages,
  locale = "en-IN",
  onEvent,
  onOrderFinished,
}: OrderStatusPageProps) {
  const text = { ...DEFAULT_MESSAGES, ...messages };
  const headingId = useId();
  const isOnline = useOnlineHint();
  const now = useNow(AGE_REFRESH_MS);
  const { permission, enable } = useNotificationPermission();

  const { order, isReconnecting, receivedAt } = useOrderStatus(orderId, fetchOrder, {
    subscribeToOrder,
    onEvent,
    // The user asked to be told, so the page keeps listening in a hidden tab.
    keepsListeningWhenHidden: permission === "granted",
  });
  const toast = useStatusNotifications(order?.status, permission, (status) => text.status[status]);

  // -1 before the first answer and for a cancelled order: no step is the current one.
  const currentIndex = ORDER_STEPS.findIndex((step) => step === order?.status);
  const isFinished = order !== null && isFinalStatus(order.status);
  const isOnTheWay = order !== null && !isFinished;

  const onOrderFinishedRef = useLatest(onOrderFinished);
  useEffect(() => {
    if (isFinished) {
      onOrderFinishedRef.current?.();
    }
  }, [isFinished, onOrderFinishedRef]);

  /** "Updated 2 minutes ago", in the words of the user's language. */
  function describeAge(receivedAtMs: number): string {
    const minutes = Math.floor(Math.max(0, now - receivedAtMs) / MINUTE_MS);
    if (minutes === 0) {
      return text.updatedJustNow;
    }
    return text.updatedAgo(new Intl.RelativeTimeFormat(locale).format(-minutes, "minute"));
  }

  function describeDistance(name: string, to: Position, from: Position): string {
    const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    return text.courierDistance(name, format.format(distanceKm(from, to)));
  }

  return (
    <section className="order" aria-labelledby={headingId}>
      <h2 id={headingId}>{text.orderHeading}</h2>
      <OfflineBanner text={text.offline} />

      {order === null && !isReconnecting && (
        <Skeleton rows={SKELETON_ROWS} label={text.loadingOrder} />
      )}

      {/* A polite live region: a screen reader reads the new status when it changes. */}
      <p className="order__status" role="status">
        {order !== null && text.status[order.status]}
      </p>

      {isOnTheWay && <p className="order__eta">{text.eta(order.etaMinutes)}</p>}

      {/*
       * The last status stays on screen. These lines say that it may be old,
       * and how old it is. They are not a live region: they change too often.
       */}
      {(isReconnecting || !isOnline) && (
        <p className="order__reconnecting">
          {isReconnecting && text.reconnecting}{" "}
          {receivedAt !== null && isOnTheWay && describeAge(receivedAt)}
        </p>
      )}

      {/*
       * A short message for a new status. The live region above already read
       * the same text to a screen reader, so this copy is hidden from it.
       */}
      {toast !== null && (
        <p className="toast" aria-hidden="true">
          {toast}
        </p>
      )}

      {order !== null && (
        <ol className="steps">
          {ORDER_STEPS.map((step, index) => (
            <li
              key={step}
              className="steps__step"
              aria-current={index === currentIndex ? "step" : undefined}
            >
              {text.status[step]}
              {index < currentIndex && <span className="visually-hidden"> {text.stepDone}</span>}
            </li>
          ))}
        </ol>
      )}

      {isOnTheWay && order.courier !== undefined && destination !== undefined && (
        <figure className="courier-map">
          <MapBoundary
            fallback={<p className="courier-map__fallback">{text.mapUnavailable}</p>}
            onError={() => onEvent?.({ type: "map_failed" })}
          >
            <CourierMap courier={order.courier} destination={destination} />
          </MapBoundary>
          {/* Outside the boundary: the distance stays when the map breaks. Not a live region. */}
          <figcaption>
            {describeDistance(order.courier.name, destination, order.courier)}
          </figcaption>
        </figure>
      )}

      {/* The permission is asked only after a tap on this button, never on page load. */}
      {isOnTheWay && permission === "default" && (
        <button type="button" className="button" onClick={enable}>
          {text.notifyMe}
        </button>
      )}
      {isOnTheWay && permission === "granted" && <p>{text.notificationsOn}</p>}
      {isOnTheWay && permission === "denied" && <p>{text.notificationsBlocked}</p>}
    </section>
  );
}
