/*
 * NOT PART OF THE INTERVIEW.
 * The shell of the restaurant page. It loads the menu, shows "loading" and
 * "error", and then draws MenuAndCart, which is the part you write.
 */
import { useRef } from "react";
import { MenuAndCart } from "./MenuAndCart";
import type { FetchMenu, Order, PlaceOrder } from "./types";
import { useMenu } from "./useMenu";

export interface RestaurantPageProps {
  restaurantId: string;
  fetchMenu: FetchMenu;
  placeOrder: PlaceOrder;
  /** Called once, with the order the server created. The cart is empty by then. */
  onOrderPlaced: (order: Order) => void;
}

export function RestaurantPage({
  restaurantId,
  fetchMenu,
  placeOrder,
  onOrderPlaced,
}: RestaurantPageProps) {
  const { menu, retry } = useMenu(restaurantId, fetchMenu);
  const pageRef = useRef<HTMLElement>(null);

  function retryMenu(): void {
    retry();
    // The button is about to leave the page. Focus moves to the page, not to nowhere.
    pageRef.current?.focus();
  }

  return (
    <section className="restaurant" ref={pageRef} tabIndex={-1} aria-label="Menu">
      {menu.status === "loading" && <p role="status">Loading the menu…</p>}

      {menu.status === "error" && (
        <div role="alert">
          <p>We could not load the menu.</p>
          <button type="button" className="button" onClick={retryMenu}>
            Try again
          </button>
        </div>
      )}

      {menu.status === "ready" && (
        // The key gives every restaurant its own cart and its own checkout state.
        <MenuAndCart
          key={restaurantId}
          categories={menu.categories}
          placeOrder={placeOrder}
          onOrderPlaced={onOrderPlaced}
        />
      )}
    </section>
  );
}
