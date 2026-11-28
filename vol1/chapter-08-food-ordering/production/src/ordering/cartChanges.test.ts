/* NOT PART OF THE INTERVIEW: production version. */
import { MENU, NAAN, TIKKA } from "../testUtils";
import { CartChangedError, applyCartChanges } from "./cartChanges";

describe("applyCartChanges", () => {
  it("returns the same menu when nothing changed", () => {
    expect(applyCartChanges(MENU, [])).toBe(MENU);
  });

  it("puts a new price on the dish", () => {
    const menu = applyCartChanges(MENU, [
      { itemId: "tikka", reason: "price_changed", newPrice: 24000 },
    ]);

    expect(menu[0].items[0]).toEqual({ ...TIKKA, price: 24000 });
  });

  it("marks a dish as unavailable", () => {
    const menu = applyCartChanges(MENU, [{ itemId: "naan", reason: "unavailable" }]);

    expect(menu[1].items[0]).toEqual({ ...NAAN, available: false });
  });

  it("keeps the same object for a dish that did not change, and never changes the old menu", () => {
    const menu = applyCartChanges(MENU, [
      { itemId: "tikka", reason: "price_changed", newPrice: 24000 },
    ]);

    expect(menu[1].items[0]).toBe(NAAN);
    expect(MENU[0].items[0].price).toBe(22000);
  });

  it("lets a later change of the same dish win", () => {
    const menu = applyCartChanges(MENU, [
      { itemId: "tikka", reason: "price_changed", newPrice: 24000 },
      { itemId: "tikka", reason: "price_changed", newPrice: 25000 },
    ]);

    expect(menu[0].items[0].price).toBe(25000);
  });

  it("ignores a change for a dish that is not on the menu", () => {
    const menu = applyCartChanges(MENU, [{ itemId: "gone", reason: "unavailable" }]);

    expect(menu).toEqual(MENU);
  });
});

describe("CartChangedError", () => {
  it("is an error that carries the changes", () => {
    const changes = [{ itemId: "naan", reason: "unavailable" as const }];
    const error = new CartChangedError(changes);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CartChangedError");
    expect(error.changes).toBe(changes);
  });
});
