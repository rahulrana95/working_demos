/*
 * NOT PART OF THE INTERVIEW: production version.
 * The shell of the restaurant page. It loads the menu, shows a skeleton or
 * an error, and then draws MenuAndCart.
 */
import { useEffect, useMemo, useRef } from "react";
import { createPriceFormatter } from "./cart";
import type { OnOrderingEvent } from "./events";
import { MenuAndCart } from "./MenuAndCart";
import { countItems } from "./menuSearch";
import { DEFAULT_MESSAGES } from "./messages";
import type { OrderingMessages } from "./messages";
import { OfflineBanner } from "./OfflineBanner";
import { Skeleton } from "./Skeleton";
import type { FetchMenu, Order, PlaceOrder } from "./types";
import { useLatest } from "./useLatest";
import { useMenu } from "./useMenu";

const SKELETON_ROWS = 6;

export interface RestaurantPageProps {
  restaurantId: string;
  fetchMenu: FetchMenu;
  placeOrder: PlaceOrder;
  /** Called once, with the order the server created. The cart is empty by then. */
  onOrderPlaced: (order: Order) => void;
  /** Replace any text. Keep the object the same between renders, or all rows draw again. */
  messages?: Partial<OrderingMessages>;
  /** Decides how prices are written, for example "en-IN" or "hi-IN". */
  locale?: string;
  /** An ISO 4217 code with 100 small units in one large unit, like INR. */
  currency?: string;
  /** Receives the events for analytics and monitoring. They hold no personal data. */
  onEvent?: OnOrderingEvent;
}

export function RestaurantPage({
  restaurantId,
  fetchMenu,
  placeOrder,
  onOrderPlaced,
  messages,
  locale = "en-IN",
  currency = "INR",
  onEvent,
}: RestaurantPageProps) {
  const { menu, retry } = useMenu(restaurantId, fetchMenu);
  const pageRef = useRef<HTMLElement>(null);
  const onEventRef = useLatest(onEvent);

  // useMemo, twice: the rows of the menu are memoised, and these two values
  // are props of every row. They must stay the same between renders.
  const text = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messages }), [messages]);
  const formatPrice = useMemo(() => createPriceFormatter(locale, currency), [locale, currency]);

  // One "menu_viewed" for each visit of a restaurant: when its first dishes are on screen.
  const categories = menu.status === "ready" ? menu.categories : null;
  const isSaved = menu.status === "ready" && menu.isSaved;
  const visitRef = useRef({ restaurantId: "", startedAt: 0, isReported: false });
  useEffect(() => {
    if (visitRef.current.restaurantId !== restaurantId) {
      visitRef.current = { restaurantId, startedAt: performance.now(), isReported: false };
    }
    if (categories !== null && !visitRef.current.isReported) {
      visitRef.current.isReported = true;
      onEventRef.current?.({
        type: "menu_viewed",
        dishCount: countItems(categories),
        durationMs: Math.round(performance.now() - visitRef.current.startedAt),
        fromCache: isSaved,
      });
    }
  }, [restaurantId, categories, isSaved, onEventRef]);

  function retryMenu(): void {
    retry();
    // The button is about to leave the page. Focus moves to the page, not to nowhere.
    pageRef.current?.focus();
  }

  return (
    <section className="restaurant" ref={pageRef} tabIndex={-1} aria-label={text.menuLabel}>
      <OfflineBanner text={text.offline} />

      {menu.status === "loading" && <Skeleton rows={SKELETON_ROWS} label={text.loadingMenu} />}

      {menu.status === "error" && (
        <div role="alert">
          <p>{text.menuError}</p>
          <button type="button" className="button" onClick={retryMenu}>
            {text.retry}
          </button>
        </div>
      )}

      {menu.status === "ready" && (
        <>
          {/* Shown while the fresh menu is on its way, and when it could not be loaded. */}
          {menu.isSaved && <p className="restaurant__note">{text.savedMenu}</p>}
          {/* The key gives every restaurant its own cart and its own checkout state. */}
          <MenuAndCart
            key={restaurantId}
            restaurantId={restaurantId}
            categories={menu.categories}
            placeOrder={placeOrder}
            onOrderPlaced={onOrderPlaced}
            messages={text}
            formatPrice={formatPrice}
            onEvent={onEvent}
          />
        </>
      )}
    </section>
  );
}
