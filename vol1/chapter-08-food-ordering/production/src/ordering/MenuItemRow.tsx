/*
 * NOT PART OF THE INTERVIEW: production version.
 * One dish with its quantity control. It holds no state: the page owns the cart.
 */
import { memo } from "react";
import type { CartAction, FormatPrice } from "./cart";
import { MAX_QUANTITY } from "./cart";
import type { OrderingMessages } from "./messages";
import type { MenuItem } from "./types";

export interface MenuItemRowProps {
  item: MenuItem;
  quantity: number;
  onChange: (action: CartAction, item: MenuItem) => void;
  messages: OrderingMessages;
  formatPrice: FormatPrice;
}

/*
 * memo: the menu can have 400 rows. A change of one quantity must draw one
 * row again, not 400. It works because every prop of a row that did not
 * change is the same value as before.
 */
export const MenuItemRow = memo(function MenuItemRow({
  item,
  quantity,
  onChange,
  messages,
  formatPrice,
}: MenuItemRowProps) {
  const canAdd = item.available && quantity < MAX_QUANTITY;

  return (
    <li className="menu-item">
      {/* The box has a fixed shape, so the page does not jump when a picture loads. */}
      <div className="menu-item__image">
        {item.imageUrl !== undefined && (
          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
        )}
      </div>
      <div className="menu-item__text">
        <h3 className="menu-item__name">{item.name}</h3>
        <p className="menu-item__meta">
          {item.isVeg ? messages.veg : messages.nonVeg} · {formatPrice(item.price)}
          {!item.available && ` · ${messages.unavailable}`}
        </p>
        <p className="menu-item__description">{item.description}</p>
      </div>

      {/*
       * Both buttons are always on the page. A button that cannot be used is
       * aria-disabled, not removed and not disabled. So the keyboard focus is
       * never lost when the quantity reaches 0 or the limit.
       */}
      <div className="stepper">
        <button
          type="button"
          className="stepper__button"
          aria-label={messages.removeOne(item.name)}
          aria-disabled={quantity === 0}
          onClick={() => onChange({ type: "remove", itemId: item.id }, item)}
        >
          −
        </button>
        <input
          className="stepper__input"
          inputMode="numeric"
          aria-label={messages.quantityOf(item.name)}
          value={quantity}
          disabled={!item.available}
          onChange={(event) =>
            onChange(
              { type: "setQuantity", itemId: item.id, quantity: Number(event.target.value) },
              item,
            )
          }
        />
        <button
          type="button"
          className="stepper__button"
          aria-label={messages.addItem(item.name)}
          aria-disabled={!canAdd}
          onClick={() => onChange({ type: "add", item }, item)}
        >
          +
        </button>
      </div>
    </li>
  );
});
