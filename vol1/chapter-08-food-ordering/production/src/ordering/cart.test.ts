/*
 * NOT PART OF THE INTERVIEW: production version.
 * In the interview you say these cases aloud. Here they are tests.
 */
import { BIRYANI, NAAN, TIKKA, makeItem } from "../testUtils";
import {
  MAX_QUANTITY,
  cartReducer,
  cartTotals,
  createPriceFormatter,
  orderableLines,
  quantityOf,
} from "./cart";
import type { CartLine } from "./types";

const items = new Map([TIKKA, NAAN, BIRYANI].map((item) => [item.id, item]));

describe("cartReducer", () => {
  it("adds a new item with quantity 1", () => {
    expect(cartReducer([], { type: "add", item: TIKKA })).toEqual([
      { itemId: "tikka", quantity: 1 },
    ]);
  });

  it("adds one more when the item is already in the cart", () => {
    const lines = cartReducer([{ itemId: "tikka", quantity: 2 }], { type: "add", item: TIKKA });

    expect(lines).toEqual([{ itemId: "tikka", quantity: 3 }]);
  });

  it("does not add an unavailable item", () => {
    expect(cartReducer([], { type: "add", item: BIRYANI })).toEqual([]);
  });

  it("never goes above the quantity limit", () => {
    let lines: CartLine[] = [];
    for (let tap = 0; tap < MAX_QUANTITY + 5; tap++) {
      lines = cartReducer(lines, { type: "add", item: TIKKA });
    }

    expect(lines).toEqual([{ itemId: "tikka", quantity: MAX_QUANTITY }]);
  });

  it("removes one, and keeps the line while some are left", () => {
    const lines = cartReducer([{ itemId: "tikka", quantity: 2 }], {
      type: "remove",
      itemId: "tikka",
    });

    expect(lines).toEqual([{ itemId: "tikka", quantity: 1 }]);
  });

  it("drops the line when the last one is removed", () => {
    const lines = cartReducer([{ itemId: "tikka", quantity: 1 }], {
      type: "remove",
      itemId: "tikka",
    });

    expect(lines).toEqual([]);
  });

  it("does nothing when an item that is not in the cart is removed", () => {
    expect(cartReducer([], { type: "remove", itemId: "tikka" })).toEqual([]);
  });

  it("sets a quantity, and keeps the place of the line in the cart", () => {
    const before = [
      { itemId: "tikka", quantity: 1 },
      { itemId: "naan", quantity: 1 },
    ];

    const lines = cartReducer(before, { type: "setQuantity", itemId: "tikka", quantity: 4 });

    expect(lines).toEqual([
      { itemId: "tikka", quantity: 4 },
      { itemId: "naan", quantity: 1 },
    ]);
  });

  it("keeps a set quantity between 0 and the limit", () => {
    const tooMany = cartReducer([], { type: "setQuantity", itemId: "tikka", quantity: 999 });
    const negative = cartReducer(tooMany, { type: "setQuantity", itemId: "tikka", quantity: -3 });

    expect(tooMany).toEqual([{ itemId: "tikka", quantity: MAX_QUANTITY }]);
    expect(negative).toEqual([]);
  });

  it("drops the fraction of a set quantity", () => {
    const lines = cartReducer([], { type: "setQuantity", itemId: "tikka", quantity: 2.9 });

    expect(lines).toEqual([{ itemId: "tikka", quantity: 2 }]);
  });

  it("ignores a set quantity that is not a number", () => {
    const before = [{ itemId: "tikka", quantity: 2 }];

    expect(cartReducer(before, { type: "setQuantity", itemId: "tikka", quantity: NaN })).toBe(
      before,
    );
  });

  it("takes the cart of another tab as it is", () => {
    const theirs = [{ itemId: "naan", quantity: 3 }];

    expect(
      cartReducer([{ itemId: "tikka", quantity: 1 }], { type: "replace", lines: theirs }),
    ).toBe(theirs);
  });

  it("clears the cart", () => {
    expect(cartReducer([{ itemId: "tikka", quantity: 2 }], { type: "clear" })).toEqual([]);
  });

  it("never changes the old lines", () => {
    const before = Object.freeze([Object.freeze({ itemId: "tikka", quantity: 1 })]) as CartLine[];

    expect(() => cartReducer(before, { type: "add", item: TIKKA })).not.toThrow();
    expect(before).toEqual([{ itemId: "tikka", quantity: 1 }]);
  });
});

describe("cart totals", () => {
  it("reads the quantity of an item, and 0 when it is not in the cart", () => {
    expect(quantityOf([{ itemId: "tikka", quantity: 3 }], "tikka")).toBe(3);
    expect(quantityOf([], "tikka")).toBe(0);
  });

  it("adds prices in whole paise", () => {
    const lines = [
      { itemId: "tikka", quantity: 2 },
      { itemId: "naan", quantity: 3 },
    ];

    expect(cartTotals(lines, items)).toEqual({ count: 5, totalPaise: 62000 });
  });

  it("has no rounding error where rupees as fractions would have one", () => {
    // In rupees this is 3 × 33.35, which JavaScript computes as 100.05000000000001.
    const cheap = makeItem("cheap", 3335);
    const totals = cartTotals([{ itemId: "cheap", quantity: 3 }], new Map([["cheap", cheap]]));

    expect(3 * 33.35).not.toBe(100.05);
    expect(totals.totalPaise).toBe(10005);
  });

  it("leaves out a line whose item is unavailable or not on the menu", () => {
    const lines = [
      { itemId: "tikka", quantity: 1 },
      { itemId: "biryani", quantity: 2 },
      { itemId: "gone", quantity: 4 },
    ];

    expect(orderableLines(lines, items)).toEqual([
      { itemId: "tikka", quantity: 1, unitPrice: 22000 },
    ]);
    expect(cartTotals(lines, items)).toEqual({ count: 1, totalPaise: 22000 });
  });

  it("is zero for an empty cart", () => {
    expect(cartTotals([], items)).toEqual({ count: 0, totalPaise: 0 });
  });
});

describe("createPriceFormatter", () => {
  it.each([
    [0, "₹0.00"],
    [5, "₹0.05"],
    [4550, "₹45.50"],
    [22000, "₹220.00"],
    [10005, "₹100.05"],
    [12345678, "₹1,23,456.78"],
  ])("writes %i paise in rupees for India as %s", (paise, text) => {
    expect(createPriceFormatter("en-IN", "INR")(paise)).toBe(text);
  });

  it("writes the same paise in the way of another locale and currency", () => {
    // Intl puts a no-break space before the euro sign.
    expect(createPriceFormatter("de-DE", "EUR")(123456)).toBe("1.234,56\u00a0€");
  });

  it("adds the price the user saw to every line it sends", () => {
    expect(orderableLines([{ itemId: "naan", quantity: 2 }], items)).toEqual([
      { itemId: "naan", quantity: 2, unitPrice: 6000 },
    ]);
  });
});
