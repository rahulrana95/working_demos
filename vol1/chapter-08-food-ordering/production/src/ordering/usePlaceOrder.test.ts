/* NOT PART OF THE INTERVIEW: production version. */
import { act, renderHook } from "@testing-library/react";
import { createDeferred, makeOrder } from "../testUtils";
import type { Deferred } from "../testUtils";
import { CartChangedError } from "./cartChanges";
import type { Order, OrderLine, PlaceOrder } from "./types";
import type { OrderingEvent } from "./events";
import { PLACE_ORDER_TIMEOUT_MS, usePlaceOrder } from "./usePlaceOrder";

const CART: OrderLine[] = [{ itemId: "tikka", quantity: 2, unitPrice: 22000 }];
const PLACED = makeOrder("placed", 100);

function createFakePlaceOrder() {
  const calls: { cart: OrderLine[]; key: string; signal: AbortSignal; answer: Deferred<Order> }[] =
    [];
  const placeOrder: PlaceOrder = (cart, key, signal) => {
    const answer = createDeferred<Order>();
    calls.push({ cart, key, signal, answer });
    return answer.promise;
  };
  return { calls, placeOrder };
}

function renderCheckout(placeOrder: PlaceOrder, cart = CART) {
  const onPlaced = vi.fn();
  const onCartChanged = vi.fn();
  const events: OrderingEvent[] = [];
  const onEvent = (event: OrderingEvent) => events.push(event);
  const hook = renderHook(
    ({ lines }) => usePlaceOrder(lines, placeOrder, { onPlaced, onCartChanged, onEvent }),
    { initialProps: { lines: cart } },
  );
  return { ...hook, onPlaced, onCartChanged, events };
}

describe("usePlaceOrder", () => {
  it("sends the cart with an idempotency key and says it is placing", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());

    expect(calls).toHaveLength(1);
    expect(calls[0].cart).toEqual(CART);
    expect(calls[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.state.status).toBe("placing");
  });

  it("sends one request when the user taps twice", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result } = renderCheckout(placeOrder);

    await act(async () => {
      // Both taps come before React draws again.
      void result.current.submit();
      void result.current.submit();
    });
    await act(async () => void result.current.submit());

    expect(calls).toHaveLength(1);
  });

  it("gives the order to the page, once", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, onPlaced } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.resolve(PLACED));

    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(onPlaced).toHaveBeenCalledWith(PLACED);
    expect(result.current.state.status).toBe("idle");
  });

  it("says it failed, and sends the same key when the user tries again", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, onPlaced } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new Error("timeout")));
    expect(result.current.state.status).toBe("failed");

    await act(async () => void result.current.submit());

    expect(calls).toHaveLength(2);
    expect(calls[1].key).toBe(calls[0].key);
    expect(onPlaced).not.toHaveBeenCalled();
  });

  it("keeps the same key when the page draws again with an equal cart", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, rerender } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new Error("timeout")));
    // A new array with the same content, as a page makes on every render.
    rerender({ lines: [{ itemId: "tikka", quantity: 2, unitPrice: 22000 }] });
    await act(async () => void result.current.submit());

    expect(calls[1].key).toBe(calls[0].key);
  });

  it("makes a new key when the cart changed after a failure", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, rerender } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new Error("timeout")));
    rerender({ lines: [{ itemId: "tikka", quantity: 3, unitPrice: 22000 }] });
    await act(async () => void result.current.submit());

    expect(calls[1].key).not.toBe(calls[0].key);
    expect(calls[1].cart).toEqual([{ itemId: "tikka", quantity: 3, unitPrice: 22000 }]);
  });

  it("makes a new key for the next order after a success", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, rerender } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.resolve(PLACED));
    // The page clears the cart, and the user fills it again with the same dish.
    rerender({ lines: [] });
    rerender({ lines: CART });
    await act(async () => void result.current.submit());

    expect(calls).toHaveLength(2);
    expect(calls[1].key).not.toBe(calls[0].key);
  });

  it("sends nothing for an empty cart", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result } = renderCheckout(placeOrder, []);

    await act(async () => void result.current.submit());

    expect(calls).toHaveLength(0);
    expect(result.current.state.status).toBe("idle");
  });

  it("aborts the request when the page is removed, and ignores its answer", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, unmount, onPlaced } = renderCheckout(placeOrder);
    await act(async () => void result.current.submit());

    unmount();
    await act(async () => calls[0].answer.resolve(PLACED));

    expect(calls[0].signal.aborted).toBe(true);
    expect(onPlaced).not.toHaveBeenCalled();
  });

  it("tells the page what the server changed, and creates no order", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, onPlaced, onCartChanged } = renderCheckout(placeOrder);
    const changes = [{ itemId: "tikka", reason: "price_changed" as const, newPrice: 24000 }];

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new CartChangedError(changes)));

    expect(result.current.state).toEqual({ status: "changed", changes });
    expect(onCartChanged).toHaveBeenCalledWith(changes);
    expect(onPlaced).not.toHaveBeenCalled();
  });

  it("sends the new price with a new key when the user confirms", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, rerender } = renderCheckout(placeOrder);
    const changes = [{ itemId: "tikka", reason: "price_changed" as const, newPrice: 24000 }];
    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new CartChangedError(changes)));

    // The page corrected its menu, so the line now has the new price.
    rerender({ lines: [{ itemId: "tikka", quantity: 2, unitPrice: 24000 }] });
    await act(async () => void result.current.submit());

    expect(calls[1].cart).toEqual([{ itemId: "tikka", quantity: 2, unitPrice: 24000 }]);
    expect(calls[1].key).not.toBe(calls[0].key);
    expect(result.current.state.status).toBe("placing");
  });

  it("makes a new key after a refusal also when the lines did not change", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result } = renderCheckout(placeOrder);
    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new CartChangedError([])));

    await act(async () => void result.current.submit());

    expect(calls[1].key).not.toBe(calls[0].key);
  });

  it("does not treat a refusal as a failure, and a failure as a refusal", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, onCartChanged } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new Error("500")));

    expect(result.current.state).toEqual({ status: "failed", reason: "failed" });
    expect(onCartChanged).not.toHaveBeenCalled();
  });

  it("fails with “timeout” after 15 seconds, aborts the request, and keeps the key", async () => {
    vi.useFakeTimers();
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result } = renderCheckout(placeOrder);
    await act(async () => void result.current.submit());

    await act(async () => void (await vi.advanceTimersByTimeAsync(PLACE_ORDER_TIMEOUT_MS)));
    expect(result.current.state).toEqual({ status: "failed", reason: "timeout" });
    expect(calls[0].signal.aborted).toBe(true);

    await act(async () => void result.current.submit());
    expect(calls[1].key).toBe(calls[0].key);
    vi.useRealTimers();
  });

  it("ignores an answer that arrives after the timeout", async () => {
    vi.useFakeTimers();
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, onPlaced } = renderCheckout(placeOrder);
    await act(async () => void result.current.submit());
    await act(async () => void (await vi.advanceTimersByTimeAsync(PLACE_ORDER_TIMEOUT_MS)));

    await act(async () => calls[0].answer.resolve(PLACED));

    expect(onPlaced).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("failed");
    vi.useRealTimers();
  });

  it("reports the start, a failure and the success with the number of attempts", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, events } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new Error("500")));
    await act(async () => void result.current.submit());
    await act(async () => calls[1].answer.resolve(PLACED));

    expect(events.map((event) => event.type)).toEqual([
      "checkout_started",
      "order_failed",
      "checkout_started",
      "order_placed",
    ]);
    expect(events[0]).toEqual({ type: "checkout_started", lineCount: 1, totalPaise: 44000 });
    expect(events[1]).toMatchObject({ reason: "failed" });
    expect(events[3]).toMatchObject({ attempts: 2 });
  });

  it("reports a refusal of the server as “cart_changed”", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, events } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new CartChangedError([])));

    expect(events[1]).toMatchObject({ type: "order_failed", reason: "cart_changed" });
  });
});
