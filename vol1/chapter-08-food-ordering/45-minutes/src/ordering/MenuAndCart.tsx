/*
 * PART OF THE INTERVIEW: yes (about 10 minutes).
 * The menu, the cart and the "Place order" button. It holds almost no logic:
 * the cart rules are in cart.ts, and the order rules are in usePlaceOrder.ts.
 */
import { useReducer } from "react";
import { MAX_QUANTITY, cartReducer, cartTotals, formatPaise, quantityOf } from "./cart";
import type { CartAction } from "./cart";
import type { MenuCategory, Order, PlaceOrder } from "./types";
import { usePlaceOrder } from "./usePlaceOrder";

export interface MenuAndCartProps {
  categories: MenuCategory[];
  placeOrder: PlaceOrder;
  /** Called once, with the order the server created. The cart is empty by then. */
  onOrderPlaced: (order: Order) => void;
}

export function MenuAndCart({ categories, placeOrder, onOrderPlaced }: MenuAndCartProps) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const items = new Map(categories.flatMap((category) => category.items).map((i) => [i.id, i]));
  const totals = cartTotals(lines, items);

  const checkout = usePlaceOrder(lines, placeOrder, (order) => {
    dispatch({ type: "clear" });
    onOrderPlaced(order);
  });
  const isPlacing = checkout.status === "placing";

  // The cart that is on its way to the server must not change.
  const changeCart = (action: CartAction) => !isPlacing && dispatch(action);

  return (
    <>
      {categories.map((category) => (
        <section key={category.id} aria-labelledby={`category-${category.id}`}>
          <h2 id={`category-${category.id}`}>{category.name}</h2>
          <ul className="menu-list">
            {category.items.map((item) => {
              const quantity = quantityOf(lines, item.id);
              return (
                <li key={item.id} className="menu-item">
                  <div>
                    <h3 className="menu-item__name">{item.name}</h3>
                    <p className="menu-item__meta">
                      {item.isVeg ? "Veg" : "Non-veg"} · {formatPaise(item.price)}
                      {!item.available && " · Unavailable"}
                    </p>
                    <p className="menu-item__description">{item.description}</p>
                  </div>
                  {/*
                   * Both buttons are always on the page. A button that cannot
                   * be used is aria-disabled, not removed and not disabled. So
                   * the keyboard focus is never lost at 0 or at the limit.
                   */}
                  <div className="stepper">
                    <button
                      type="button"
                      className="stepper__button"
                      aria-label={`Remove one ${item.name}`}
                      aria-disabled={quantity === 0}
                      onClick={() => changeCart({ type: "remove", itemId: item.id })}
                    >
                      −
                    </button>
                    <span className="stepper__count">{quantity}</span>
                    <button
                      type="button"
                      className="stepper__button"
                      aria-label={`Add ${item.name}`}
                      aria-disabled={!item.available || quantity === MAX_QUANTITY}
                      onClick={() => changeCart({ type: "add", item })}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* A polite live region: a screen reader reads the new count and total after a change. */}
      <div className="cart-bar">
        <p className="cart-bar__total" role="status">
          {totals.count} {totals.count === 1 ? "item" : "items"} · {formatPaise(totals.totalPaise)}
        </p>
        {checkout.status === "failed" && (
          <p className="cart-bar__error" role="alert">
            We could not place the order. Your cart is safe. Try again.
          </p>
        )}
        {/* aria-disabled, not disabled: the button keeps the focus while it is busy. */}
        <button
          type="button"
          className="button button--primary"
          aria-disabled={totals.count === 0 || isPlacing}
          onClick={checkout.submit}
        >
          {isPlacing ? "Placing the order…" : "Place order"}
        </button>
      </div>
    </>
  );
}
