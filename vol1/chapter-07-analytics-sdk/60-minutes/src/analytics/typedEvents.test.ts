/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the types of `track`. The compiler does the checking:
 * `npm run typecheck` fails when a line marked `@ts-expect-error` compiles.
 */
import { createAnalytics } from "./createAnalytics";
import { createFakeTransport } from "./testHelpers";

type ShopEvents = {
  product_viewed: { productId: string; price: number };
  cart_opened: Record<string, never>;
  search_used: { resultCount?: number };
};

interface CheckoutEvents {
  order_placed: { total: number };
}

const options = { endpoint: "/collect", writeKey: "k", transport: createFakeTransport().transport };

describe("typed events", () => {
  it("accepts the known names with the right properties", () => {
    const analytics = createAnalytics<ShopEvents>(options);

    expect(() => {
      analytics.track("product_viewed", { productId: "p1", price: 499 });
      analytics.track("cart_opened");
      analytics.track("search_used");
      analytics.track("search_used", { resultCount: 3 });
    }).not.toThrow();
  });

  it("refuses an unknown name, a missing property and a wrong type", () => {
    const analytics = createAnalytics<ShopEvents>(options);

    expect(() => {
      // @ts-expect-error: "product_seen" is not an event of this product.
      analytics.track("product_seen", { productId: "p1", price: 499 });
      // @ts-expect-error: `price` is missing.
      analytics.track("product_viewed", { productId: "p1" });
      // @ts-expect-error: `price` must be a number.
      analytics.track("product_viewed", { productId: "p1", price: "499" });
      // @ts-expect-error: the properties are required for this event.
      analytics.track("product_viewed");
    }).not.toThrow();
  });

  it("works with an interface as the event map", () => {
    const analytics = createAnalytics<CheckoutEvents>(options);

    expect(() => {
      analytics.track("order_placed", { total: 1200 });
      // @ts-expect-error: `total` must be a number.
      analytics.track("order_placed", { total: "1200" });
    }).not.toThrow();
  });

  it("accepts any name and any properties when no event map is given", () => {
    const analytics = createAnalytics(options);

    expect(() => {
      analytics.track("anything");
      analytics.track("anything", { any: "thing" });
    }).not.toThrow();
  });
});
