/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the React wrapper.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { createAnalytics } from "./createAnalytics";
import { AnalyticsProvider, useAnalytics } from "./react";
import { createFakeTransport } from "./testHelpers";

type ShopEvents = { cart_opened: { itemCount: number } };

function CartButton() {
  const analytics = useAnalytics<ShopEvents>();
  return (
    <button type="button" onClick={() => analytics.track("cart_opened", { itemCount: 2 })}>
      Open cart
    </button>
  );
}

describe("useAnalytics", () => {
  it("gives a component the client of the provider", () => {
    const { transport, calls } = createFakeTransport();
    const client = createAnalytics<ShopEvents>({
      endpoint: "/collect",
      writeKey: "k",
      transport,
      trackPages: false,
    });
    render(
      <AnalyticsProvider client={client}>
        <CartButton />
      </AnalyticsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open cart" }));
    void client.flush();

    expect(calls[0].batch.events[0]).toMatchObject({
      name: "cart_opened",
      properties: { itemCount: 2 },
    });
  });

  it("does not break the page when there is no provider: the click does nothing", () => {
    render(<CartButton />);

    expect(() => fireEvent.click(screen.getByRole("button", { name: "Open cart" }))).not.toThrow();
  });

  it("keeps the same client between renders, so an effect that uses it does not run again", () => {
    const client = createAnalytics({ endpoint: "/collect", writeKey: "k" });
    const seen = new Set<unknown>();
    function Probe() {
      seen.add(useAnalytics());
      return null;
    }
    const { rerender } = render(
      <AnalyticsProvider client={client}>
        <Probe />
      </AnalyticsProvider>,
    );

    rerender(
      <AnalyticsProvider client={client}>
        <Probe />
      </AnalyticsProvider>,
    );

    expect(seen.size).toBe(1);
  });
});
