/*
 * NOT PART OF THE INTERVIEW.
 * The hook is tested without drawing anything. The clock is fake, and every
 * answer of the server is given by hand, so each race is forced.
 */
import { renderHook } from "@testing-library/react";
import { createDeferred, flush, makeOrder, setTabHidden, wait } from "../testUtils";
import type { Deferred } from "../testUtils";
import type { FetchOrder, Order } from "./types";
import {
  MAX_POLL_MS,
  POLL_MS,
  isFinalStatus,
  newerOrder,
  pollDelayMs,
  useOrderStatus,
} from "./useOrderStatus";

/** A fake fetchOrder. The test answers each call by hand. */
function createFakeFetch() {
  const calls: { answer: Deferred<Order>; signal: AbortSignal }[] = [];
  const fetchOrder: FetchOrder = (_orderId, signal) => {
    const answer = createDeferred<Order>();
    calls.push({ answer, signal });
    return answer.promise;
  };
  /** Answers the newest call, or fails it. */
  async function answerLast(order: Order | Error): Promise<void> {
    const { answer } = calls[calls.length - 1];
    if (order instanceof Error) {
      answer.reject(order);
    } else {
      answer.resolve(order);
    }
    await flush();
  }
  return { calls, fetchOrder, answerLast };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await setTabHidden(false);
  vi.useRealTimers();
});

describe("pure parts", () => {
  it("knows which statuses end an order", () => {
    expect(isFinalStatus("delivered")).toBe(true);
    expect(isFinalStatus("cancelled")).toBe(true);
    expect(isFinalStatus("arriving")).toBe(false);
  });

  it("waits 5 seconds after a good answer, then 10, 20, 40 and at most 60 after failures", () => {
    expect([0, 1, 2, 3, 4, 5, 50].map(pollDelayMs)).toEqual([
      5000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ]);
  });

  it("keeps the order with the later updatedAt", () => {
    const older = makeOrder("preparing", 100);
    const newer = makeOrder("picked_up", 200);

    expect(newerOrder(null, older)).toBe(older);
    expect(newerOrder(older, newer)).toBe(newer);
    expect(newerOrder(newer, older)).toBe(newer);
  });
});

describe("useOrderStatus: polling", () => {
  it("asks the server at once, and has no order before the first answer", () => {
    const { calls, fetchOrder } = createFakeFetch();

    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    expect(calls).toHaveLength(1);
    expect(result.current).toEqual({ order: null, isReconnecting: false });
  });

  it("asks again 5 seconds after each answer", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(makeOrder("placed", 100));
    await wait(POLL_MS - 1);
    expect(calls).toHaveLength(1);

    await wait(1);
    expect(calls).toHaveLength(2);

    await answerLast(makeOrder("accepted", 200));
    expect(result.current.order?.status).toBe("accepted");
  });

  it.each(["delivered", "cancelled"] as const)(
    "stops for ever when the order is %s",
    async (status) => {
      const { calls, fetchOrder, answerLast } = createFakeFetch();
      renderHook(() => useOrderStatus("1001", fetchOrder));

      await answerLast(makeOrder(status, 100));
      await wait(10 * MAX_POLL_MS);

      expect(calls).toHaveLength(1);
    },
  );

  it("sends no second request while the first one has no answer", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder));

    // No answer yet: one request is in flight, and no second one is sent.
    await wait(10 * POLL_MS);
    expect(calls).toHaveLength(1);

    await answerLast(makeOrder("placed", 100));
    await wait(POLL_MS);
    expect(calls).toHaveLength(2);
  });
});

describe("useOrderStatus: old answers", () => {
  it("ignores an answer that is older than the one on screen", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(makeOrder("picked_up", 300));
    await wait(POLL_MS);
    await answerLast(makeOrder("preparing", 200));

    expect(result.current.order?.status).toBe("picked_up");
  });

  it("keeps polling after an old answer", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(makeOrder("picked_up", 300));
    await wait(POLL_MS);
    await answerLast(makeOrder("preparing", 200));
    await wait(POLL_MS);

    expect(calls).toHaveLength(3);
  });

  it("does not ask again for a delivered order when the tab comes back", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(makeOrder("arriving", 400));
    await wait(POLL_MS);
    await answerLast(makeOrder("delivered", 500));
    // The tab comes back. A finished order is not asked for again.
    await setTabHidden(true);
    await setTabHidden(false);

    expect(calls).toHaveLength(2);
    expect(result.current.order?.status).toBe("delivered");
  });
});

describe("useOrderStatus: failures", () => {
  it("says “reconnecting” after a failure and keeps the last order", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(makeOrder("preparing", 200));
    await wait(POLL_MS);
    await answerLast(new Error("500"));

    expect(result.current.isReconnecting).toBe(true);
    expect(result.current.order?.status).toBe("preparing");
  });

  it("waits 10, 20, 40, 60 and 60 seconds between failed polls", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder));

    for (const delayMs of [10_000, 20_000, 40_000, 60_000, 60_000]) {
      const callsBefore = calls.length;
      await answerLast(new Error("500"));

      await wait(delayMs - 1);
      expect(calls).toHaveLength(callsBefore);
      await wait(1);
      expect(calls).toHaveLength(callsBefore + 1);
    }
  });

  it("stops saying “reconnecting” and polls every 5 seconds again after a good answer", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(new Error("500"));
    await wait(10_000);
    await answerLast(new Error("500"));
    await wait(20_000);
    await answerLast(makeOrder("accepted", 200));

    expect(result.current).toEqual({ order: makeOrder("accepted", 200), isReconnecting: false });
    await wait(POLL_MS);
    expect(calls).toHaveLength(4);
  });

  it("says “reconnecting” with no order when the first request fails", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(new Error("500"));

    expect(result.current).toEqual({ order: null, isReconnecting: true });
  });
});

describe("useOrderStatus: hidden tab", () => {
  it("sends nothing while the tab is hidden", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder));
    await answerLast(makeOrder("preparing", 200));

    await setTabHidden(true);
    await wait(10 * MAX_POLL_MS);

    expect(calls).toHaveLength(1);
  });

  it("asks at once when the tab becomes visible", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder));
    await answerLast(makeOrder("preparing", 200));
    await setTabHidden(true);
    await wait(60_000);

    await setTabHidden(false);

    expect(calls).toHaveLength(2);
  });

  it("aborts the request in flight when the tab is hidden, and drops its answer", async () => {
    const { calls, fetchOrder } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await setTabHidden(true);
    expect(calls[0].signal.aborted).toBe(true);

    // This fetch function did not stop on abort, and answers anyway.
    calls[0].answer.resolve(makeOrder("preparing", 200));
    await flush();

    expect(result.current.order).toBeNull();
  });

  it("does not show an error for a request that was aborted", async () => {
    const { calls, fetchOrder } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await setTabHidden(true);
    calls[0].answer.reject(new DOMException("Aborted", "AbortError"));
    await flush();

    expect(result.current.isReconnecting).toBe(false);
  });

  it("replaces the request in flight when the tab becomes visible twice quickly", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    // Some browsers send "visible" without a "hidden" before it.
    await setTabHidden(false);
    expect(calls).toHaveLength(2);
    expect(calls[0].signal.aborted).toBe(true);

    await answerLast(makeOrder("accepted", 200));
    calls[0].answer.resolve(makeOrder("placed", 100));
    await flush();

    expect(result.current.order?.status).toBe("accepted");
    // One timer is running, not two: the next poll is one request.
    await wait(POLL_MS);
    expect(calls).toHaveLength(3);
  });
});

describe("useOrderStatus: life of the hook", () => {
  it("aborts the request and sends nothing more when the page is removed", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { unmount } = renderHook(() => useOrderStatus("1001", fetchOrder));
    await answerLast(makeOrder("preparing", 200));
    await wait(POLL_MS);

    unmount();
    await wait(10 * MAX_POLL_MS);

    expect(calls).toHaveLength(2);
    expect(calls[1].signal.aborted).toBe(true);
  });

  it("starts again with no order when the order id changes", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { result, rerender } = renderHook(({ id }) => useOrderStatus(id, fetchOrder), {
      initialProps: { id: "1001" },
    });
    await answerLast(makeOrder("preparing", 200));

    rerender({ id: "1002" });

    expect(result.current.order).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("starts again when the app passes a new fetch function", async () => {
    const first = createFakeFetch();
    const second = createFakeFetch();
    const { rerender } = renderHook(({ fetchOrder }) => useOrderStatus("1001", fetchOrder), {
      initialProps: { fetchOrder: first.fetchOrder },
    });

    rerender({ fetchOrder: second.fetchOrder });

    expect(first.calls[0].signal.aborted).toBe(true);
    expect(second.calls).toHaveLength(1);
  });
});
