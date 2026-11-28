/* NOT PART OF THE INTERVIEW: production version. The demo menu must be what the README says it is. */
import { createDemoMenu } from "./menuData";

describe("the demo menu", () => {
  const menu = createDemoMenu();
  const dishes = menu.flatMap((category) => category.items);

  it("has 20 categories and 400 dishes", () => {
    expect(menu).toHaveLength(20);
    expect(dishes).toHaveLength(400);
  });

  it("gives every dish its own id and its own name", () => {
    expect(new Set(dishes.map((dish) => dish.id)).size).toBe(400);
    expect(new Set(dishes.map((dish) => dish.name)).size).toBe(400);
  });

  it("has every price in whole paise, and some dishes that are unavailable", () => {
    expect(dishes.every((dish) => Number.isInteger(dish.price) && dish.price > 0)).toBe(true);
    expect(dishes.some((dish) => !dish.available)).toBe(true);
  });
});
