/* NOT PART OF THE INTERVIEW. */
import { act, renderHook } from "@testing-library/react";
import { createDeferred, makeOrder } from "../testUtils";
import type { Deferred } from "../testUtils";
import type { CartLine, Order, PlaceOrder } from "./types";
import { usePlaceOrder } from "./usePlaceOrder";

const CART: CartLine[] = [{ itemId: "tikka", quantity: 2 }];
const PLACED = makeOrder("placed", 100);

function createFakePlaceOrder() {
  const calls: { cart: CartLine[]; key: string; signal: AbortSignal; answer: Deferred<Order> }[] =
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
  const hook = renderHook(({ lines }) => usePlaceOrder(lines, placeOrder, onPlaced), {
    initialProps: { lines: cart },
  });
  return { ...hook, onPlaced };
}

describe("usePlaceOrder", () => {
  it("sends the cart with an idempotency key and says it is placing", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());

    expect(calls).toHaveLength(1);
    expect(calls[0].cart).toEqual(CART);
    expect(calls[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.status).toBe("placing");
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
    expect(result.current.status).toBe("idle");
  });

  it("says it failed, and sends the same key when the user tries again", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, onPlaced } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new Error("timeout")));
    expect(result.current.status).toBe("failed");

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
    rerender({ lines: [{ itemId: "tikka", quantity: 2 }] });
    await act(async () => void result.current.submit());

    expect(calls[1].key).toBe(calls[0].key);
  });

  it("makes a new key when the cart changed after a failure", async () => {
    const { calls, placeOrder } = createFakePlaceOrder();
    const { result, rerender } = renderCheckout(placeOrder);

    await act(async () => void result.current.submit());
    await act(async () => calls[0].answer.reject(new Error("timeout")));
    rerender({ lines: [{ itemId: "tikka", quantity: 3 }] });
    await act(async () => void result.current.submit());

    expect(calls[1].key).not.toBe(calls[0].key);
    expect(calls[1].cart).toEqual([{ itemId: "tikka", quantity: 3 }]);
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
    expect(result.current.status).toBe("idle");
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
});
