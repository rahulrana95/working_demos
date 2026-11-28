/*
 * NOT PART OF THE INTERVIEW: production version.
 * The menu, the cart and the "Place order" button. It holds almost no logic:
 * the cart rules are in cart.ts and useCart.ts, and the order rules are in
 * usePlaceOrder.ts.
 *
 * Why it holds at scale (a menu of 400 dishes):
 *   1. The rows are memoised, and the props of a row stay the same values.
 *      One tap draws one row again, not 400.
 *   2. The pictures load only when they come near the screen, into boxes of
 *      a fixed shape. See MenuItemRow.tsx and the CSS.
 *   3. Search and the category links are in MenuNavigator.tsx.
 */
import { useCallback, useMemo, useState } from "react";
import type { CartAction, FormatPrice } from "./cart";
import { cartTotals, orderableLines, quantityOf } from "./cart";
import { applyCartChanges } from "./cartChanges";
import type { CartChange } from "./cartChanges";
import { saveCart } from "./cartStorage";
import { sectionId } from "./CategoryNav";
import type { OnOrderingEvent } from "./events";
import { MenuItemRow } from "./MenuItemRow";
import { MenuNavigator } from "./MenuNavigator";
import type { OrderingMessages } from "./messages";
import type { MenuCategory, MenuItem, Order, PlaceOrder } from "./types";
import { useCart } from "./useCart";
import { useLatest } from "./useLatest";
import { usePlaceOrder } from "./usePlaceOrder";

export interface MenuAndCartProps {
  restaurantId: string;
  categories: MenuCategory[];
  placeOrder: PlaceOrder;
  /** Called once, with the order the server created. The cart is empty by then. */
  onOrderPlaced: (order: Order) => void;
  messages: OrderingMessages;
  formatPrice: FormatPrice;
  onEvent?: OnOrderingEvent;
}

export function MenuAndCart({
  restaurantId,
  categories,
  placeOrder,
  onOrderPlaced,
  messages,
  formatPrice,
  onEvent,
}: MenuAndCartProps) {
  // The cart is saved on every change and is the same in every tab. See useCart.ts.
  const [lines, dispatch] = useCart(restaurantId);
  const linesRef = useLatest(lines);
  const onEventRef = useLatest(onEvent);
  const [lastChanged, setLastChanged] = useState<MenuItem | null>(null);
  const [serverChanges, setServerChanges] = useState<CartChange[]>([]);

  // useMemo, twice: with 400 dishes these two must not be built again on
  // every tap. And the rows are memoised, so they need the same dish objects
  // as in the render before.
  const menu = useMemo(
    () => applyCartChanges(categories, serverChanges),
    [categories, serverChanges],
  );
  const items = useMemo(
    () => new Map(menu.flatMap((category) => category.items).map((item) => [item.id, item])),
    [menu],
  );
  const totals = cartTotals(lines, items);

  const checkout = usePlaceOrder(orderableLines(lines, items), placeOrder, {
    onEvent,
    onPlaced: (order) => {
      dispatch({ type: "clear" });
      // The parent may remove this page at once, before the cart is saved by its effect.
      saveCart(restaurantId, []);
      onOrderPlaced(order);
    },
    onCartChanged: (changes) => {
      setServerChanges((known) => [...known, ...changes]);
      for (const change of changes) {
        if (change.reason === "unavailable") {
          dispatch({ type: "setQuantity", itemId: change.itemId, quantity: 0 });
        }
      }
    },
  });
  const { state } = checkout;
  const isPlacing = state.status === "placing";

  // useCallback: the rows are memoised. A new function on every render would
  // draw all 400 rows again.
  const changeCart = useCallback(
    (action: CartAction, item: MenuItem) => {
      // The cart that is on its way to the server must not change.
      if (isPlacing) {
        return;
      }
      dispatch(action);
      setLastChanged(item);
      if (action.type === "add" && item.available) {
        // The count after this tap. It is not exact at the quantity limit, which is fine for a count.
        const cartCount = linesRef.current.reduce((count, line) => count + line.quantity, 0) + 1;
        onEventRef.current?.({ type: "item_added", cartCount });
      }
    },
    [isPlacing, dispatch, linesRef, onEventRef],
  );

  /*
   * The cart comes before the dishes in the page, and the CSS draws it at the
   * bottom of the screen. With 400 dishes there are 1,200 buttons and fields
   * to tab through. The cart must not be behind them.
   */
  const cartBar = (
    <section className="cart-bar" aria-label={messages.cartLabel}>
      <p className="cart-bar__total">
        {messages.itemCount(totals.count)} · {formatPrice(totals.totalPaise)}
      </p>
      {state.status === "failed" && (
        <p className="cart-bar__error" role="alert">
          {state.reason === "timeout" ? messages.orderTimedOut : messages.orderFailed}
        </p>
      )}
      {state.status === "changed" && (
        <div className="cart-bar__error" role="alert">
          <p>{messages.cartChanged}</p>
          <ul>
            {state.changes.map((change) => {
              const name = items.get(change.itemId)?.name ?? change.itemId;
              return (
                <li key={change.itemId}>
                  {change.reason === "unavailable"
                    ? messages.itemUnavailable(name)
                    : messages.priceChanged(name, formatPrice(change.newPrice))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {/* aria-disabled, not disabled: the button keeps the focus while it is busy. */}
      <button
        type="button"
        className="button button--primary"
        aria-disabled={totals.count === 0 || isPlacing}
        onClick={checkout.submit}
      >
        {isPlacing && messages.placingOrder}
        {state.status === "changed" && messages.confirmOrder}
        {(state.status === "idle" || state.status === "failed") && messages.placeOrder}
      </button>
    </section>
  );

  return (
    <div className="menu-layout">
      <MenuNavigator categories={menu} messages={messages}>
        {(shownCategories) => (
          <>
            {cartBar}
            {shownCategories.map((category) => (
              <section
                key={category.id}
                id={sectionId(category.id)}
                className="menu-category"
                aria-labelledby={`${sectionId(category.id)}-name`}
              >
                <h2 id={`${sectionId(category.id)}-name`}>{category.name}</h2>
                <ul className="menu-list">
                  {category.items.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      quantity={quantityOf(lines, item.id)}
                      onChange={changeCart}
                      messages={messages}
                      formatPrice={formatPrice}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </MenuNavigator>

      {/* A screen reader reads this text every time the cart changes. */}
      <p className="visually-hidden" role="status">
        {lastChanged !== null &&
          messages.cartChange(
            lastChanged.name,
            quantityOf(lines, lastChanged.id),
            formatPrice(totals.totalPaise),
          )}
      </p>
    </div>
  );
}
