/*
 * NOT PART OF THE INTERVIEW: production version.
 * The hook is tested without drawing anything. The clock is fake, and every
 * answer of the server is given by hand, so each race is forced.
 */
import { act, renderHook } from "@testing-library/react";
import { createDeferred, flush, makeOrder, setTabHidden, wait } from "../testUtils";
import type { Deferred } from "../testUtils";
import type { OrderingEvent } from "./events";
import type { FetchOrder, Order, SubscribeToOrder } from "./types";
import {
  MAX_POLL_MS,
  MAX_STREAM_RECONNECTS,
  POLL_MS,
  REQUEST_TIMEOUT_MS,
  isFinalStatus,
  pollDelayMs,
  streamRetryDelayMs,
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

/** A fake stream. The test sends each update, and breaks each connection, by hand. */
function createFakeStream() {
  const connections: {
    send: (order: Order) => void;
    fail: () => void;
    isClosed: boolean;
  }[] = [];
  const subscribe: SubscribeToOrder = (_orderId, onUpdate, onError) => {
    const connection = { send: onUpdate, fail: onError, isClosed: false };
    connections.push(connection);
    return () => {
      connection.isClosed = true;
    };
  };
  const last = () => connections[connections.length - 1];
  /** Breaks the newest connection and waits until the hook opens the next one. */
  async function breakAndWait(): Promise<void> {
    await act(async () => last().fail());
    await wait(MAX_POLL_MS);
  }
  return { connections, subscribe, last, breakAndWait };
}

beforeEach(() => {
  vi.useFakeTimers();
  // With 1 as the random number, the waits are the longest ones: 1, 2 and 4 seconds.
  vi.spyOn(Math, "random").mockReturnValue(1);
});

afterEach(async () => {
  await setTabHidden(false);
  vi.restoreAllMocks();
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

  it("waits at most 1, 2 and 4 seconds before a reconnect, and at least half of that", () => {
    expect([1, 2, 3].map((reconnect) => streamRetryDelayMs(reconnect, 1))).toEqual([
      1000, 2000, 4000,
    ]);
    expect([1, 2, 3].map((reconnect) => streamRetryDelayMs(reconnect, 0))).toEqual([
      500, 1000, 2000,
    ]);
    expect(streamRetryDelayMs(2, 0.5)).toBe(1500);
  });

  it("picks the wait of a reconnect at random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    expect(streamRetryDelayMs(1)).toBe(625);
  });
});

describe("useOrderStatus: polling", () => {
  it("asks the server at once, and has no order before the first answer", () => {
    const { calls, fetchOrder } = createFakeFetch();

    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    expect(calls).toHaveLength(1);
    expect(result.current).toMatchObject({ order: null, isReconnecting: false });
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

    expect(result.current).toMatchObject({
      order: makeOrder("accepted", 200),
      isReconnecting: false,
    });
    await wait(POLL_MS);
    expect(calls).toHaveLength(4);
  });

  it("says “reconnecting” with no order when the first request fails", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await answerLast(new Error("500"));

    expect(result.current).toMatchObject({ order: null, isReconnecting: true });
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

  it("uses the newest fetch function without starting again", async () => {
    const first = createFakeFetch();
    const second = createFakeFetch();
    const { rerender } = renderHook(({ fetchOrder }) => useOrderStatus("1001", fetchOrder), {
      initialProps: { fetchOrder: first.fetchOrder },
    });
    await first.answerLast(makeOrder("placed", 100));

    rerender({ fetchOrder: second.fetchOrder });
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(0);

    await wait(POLL_MS);
    expect(second.calls).toHaveLength(1);
  });
});

describe("useOrderStatus: a request with no answer", () => {
  it("counts as failed after 10 seconds, and is aborted", async () => {
    const { calls, fetchOrder } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await wait(REQUEST_TIMEOUT_MS - 1);
    expect(result.current.isReconnecting).toBe(false);

    await wait(1);
    expect(result.current.isReconnecting).toBe(true);
    expect(calls[0].signal.aborted).toBe(true);
  });

  it("is tried again, so one lost request does not stop the polling", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await wait(REQUEST_TIMEOUT_MS);
    await wait(pollDelayMs(1));
    expect(calls).toHaveLength(2);

    await answerLast(makeOrder("accepted", 200));
    expect(result.current).toMatchObject({
      order: makeOrder("accepted", 200),
      isReconnecting: false,
    });
  });

  it("is ignored when its answer arrives after the 10 seconds", async () => {
    const { calls, fetchOrder } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await wait(REQUEST_TIMEOUT_MS);
    calls[0].answer.resolve(makeOrder("accepted", 200));
    await flush();

    expect(result.current).toMatchObject({ order: null, isReconnecting: true });
  });

  it("does not count an answer that came in time", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));

    await wait(REQUEST_TIMEOUT_MS - 1);
    await answerLast(makeOrder("accepted", 200));
    await wait(POLL_MS - 1);

    expect(result.current.isReconnecting).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("useOrderStatus: the stream", () => {
  it("opens the stream and sends one request to catch up", () => {
    const { calls, fetchOrder } = createFakeFetch();
    const stream = createFakeStream();

    renderHook(() => useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }));

    expect(stream.connections).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("shows the updates of the stream and does not poll while the stream works", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );
    await answerLast(makeOrder("placed", 100));

    await act(async () => stream.last().send(makeOrder("accepted", 200)));
    await wait(10 * MAX_POLL_MS);

    expect(result.current.order?.status).toBe("accepted");
    expect(calls).toHaveLength(1);
  });

  it("ignores the answer of the request when the stream already sent a newer update", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );

    // The request was sent first, but its answer arrives last.
    await act(async () => stream.last().send(makeOrder("picked_up", 300)));
    await answerLast(makeOrder("preparing", 200));

    expect(result.current.order?.status).toBe("picked_up");
  });

  it("ignores an update of the stream that is older than the one on screen", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );
    await answerLast(makeOrder("picked_up", 300));

    await act(async () => stream.last().send(makeOrder("preparing", 200)));

    expect(result.current.order?.status).toBe("picked_up");
  });

  it("says “reconnecting” and keeps the last order when the stream breaks", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );
    await answerLast(makeOrder("preparing", 200));

    await act(async () => stream.last().fail());

    expect(result.current).toMatchObject({
      order: makeOrder("preparing", 200),
      isReconnecting: true,
    });
    expect(stream.connections[0].isClosed).toBe(true);
  });

  it("opens the stream again after the wait, and sends a request to catch up", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );
    await answerLast(makeOrder("preparing", 200));
    await act(async () => stream.last().fail());

    await wait(999);
    expect(stream.connections).toHaveLength(1);
    await wait(1);
    expect(stream.connections).toHaveLength(2);
    expect(calls).toHaveLength(2);

    // The status changed while we were not connected. The request brings it.
    await answerLast(makeOrder("picked_up", 300));
    expect(result.current).toMatchObject({
      order: makeOrder("picked_up", 300),
      isReconnecting: false,
    });
  });

  it("waits 1, 2 and 4 seconds before the three reconnects", async () => {
    const { fetchOrder } = createFakeFetch();
    const stream = createFakeStream();
    renderHook(() => useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }));

    for (const delayMs of [1000, 2000, 4000]) {
      const connectionsBefore = stream.connections.length;
      await act(async () => stream.last().fail());

      await wait(delayMs - 1);
      expect(stream.connections).toHaveLength(connectionsBefore);
      await wait(1);
      expect(stream.connections).toHaveLength(connectionsBefore + 1);
    }
  });

  it("falls back to polling after three reconnects that brought no update", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );

    for (let reconnect = 1; reconnect <= MAX_STREAM_RECONNECTS; reconnect++) {
      await act(async () => stream.last().fail());
      await wait(4000);
    }
    expect(stream.connections).toHaveLength(1 + MAX_STREAM_RECONNECTS);

    // The third reconnect breaks too. Now the hook polls and opens no stream.
    await act(async () => stream.last().fail());
    const callsAfterFallback = calls.length;
    await answerLast(makeOrder("preparing", 200));
    expect(result.current).toMatchObject({
      order: makeOrder("preparing", 200),
      isReconnecting: false,
    });

    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 300));
    await wait(POLL_MS);

    expect(calls).toHaveLength(callsAfterFallback + 2);
    expect(stream.connections).toHaveLength(1 + MAX_STREAM_RECONNECTS);
  });

  it("starts the count again when an update arrives between two breaks", async () => {
    const { fetchOrder } = createFakeFetch();
    const stream = createFakeStream();
    renderHook(() => useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }));

    for (let round = 0; round < 10; round++) {
      await act(async () => stream.last().send(makeOrder("preparing", 200 + round)));
      await stream.breakAndWait();
    }

    // Ten breaks, and the stream is still used.
    expect(stream.connections).toHaveLength(11);
    expect(stream.last().isClosed).toBe(false);
  });

  it("closes the stream for ever when the order is delivered", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    renderHook(() => useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }));
    await answerLast(makeOrder("arriving", 400));

    await act(async () => stream.last().send(makeOrder("delivered", 500)));
    await wait(10 * MAX_POLL_MS);

    expect(stream.connections).toHaveLength(1);
    expect(stream.last().isClosed).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("closes the stream when the catch-up request says the order is delivered", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    renderHook(() => useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }));

    await answerLast(makeOrder("delivered", 500));

    expect(stream.last().isClosed).toBe(true);
  });

  it("closes the stream while the tab is hidden, and opens it and catches up when it is visible", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    renderHook(() => useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }));
    await answerLast(makeOrder("preparing", 200));

    await setTabHidden(true);
    expect(stream.last().isClosed).toBe(true);
    await wait(10 * MAX_POLL_MS);
    expect(stream.connections).toHaveLength(1);

    await setTabHidden(false);
    expect(stream.connections).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("ignores an update and an error from a stream it already closed", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );
    await answerLast(makeOrder("preparing", 200));
    await setTabHidden(true);

    // This stream did not stop when it was closed.
    await act(async () => {
      stream.connections[0].send(makeOrder("picked_up", 300));
      stream.connections[0].fail();
    });

    expect(result.current).toMatchObject({
      order: makeOrder("preparing", 200),
      isReconnecting: false,
    });
  });

  it("tries the catch-up request again when it fails, also while the stream is open", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );

    await answerLast(new Error("500"));
    expect(result.current.isReconnecting).toBe(true);
    await wait(pollDelayMs(1));
    await answerLast(makeOrder("preparing", 200));

    expect(calls).toHaveLength(2);
    expect(result.current).toMatchObject({
      order: makeOrder("preparing", 200),
      isReconnecting: false,
    });
    expect(stream.connections).toHaveLength(1);
  });

  it("closes the stream and sends nothing more when the page is removed", async () => {
    const { calls, fetchOrder } = createFakeFetch();
    const stream = createFakeStream();
    const { unmount } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe }),
    );
    await act(async () => stream.last().fail());

    unmount();
    await wait(10 * MAX_POLL_MS);

    expect(stream.connections).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("starts to use a stream that the app gives later, and stops when it takes it away", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const { rerender } = renderHook(
      ({ subscribe }: { subscribe?: SubscribeToOrder }) =>
        useOrderStatus("1001", fetchOrder, { subscribeToOrder: subscribe }),
      { initialProps: {} },
    );
    await answerLast(makeOrder("preparing", 200));
    expect(stream.connections).toHaveLength(0);

    rerender({ subscribe: stream.subscribe });
    expect(stream.connections).toHaveLength(1);

    rerender({});
    expect(stream.last().isClosed).toBe(true);
  });
});

describe("useOrderStatus: the state machine", () => {
  it("refuses a newer update whose status cannot follow, and reports it", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const events: OrderingEvent[] = [];
    const onEvent = (event: OrderingEvent) => events.push(event);
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder, { onEvent }));
    await answerLast(makeOrder("picked_up", 300));

    await wait(POLL_MS);
    await answerLast(makeOrder("preparing", 400));

    expect(result.current.order?.status).toBe("picked_up");
    expect(result.current.isReconnecting).toBe(false);
    expect(events).toContainEqual({ type: "update_rejected", from: "picked_up", to: "preparing" });
  });

  it("drops a stale update quietly, with no report", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const onEvent = vi.fn();
    renderHook(() => useOrderStatus("1001", fetchOrder, { onEvent }));
    await answerLast(makeOrder("picked_up", 300));

    await wait(POLL_MS);
    await answerLast(makeOrder("preparing", 200));

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("never leaves “delivered”, also for a newer update from the stream", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useOrderStatus("1001", fetchOrder, { subscribeToOrder: stream.subscribe, onEvent }),
    );
    await answerLast(makeOrder("arriving", 400));

    await act(async () => {
      stream.last().send(makeOrder("delivered", 500));
      stream.connections[0].send(makeOrder("preparing", 600));
    });

    expect(result.current.order?.status).toBe("delivered");
  });
});

describe("useOrderStatus: events", () => {
  it("reports every change of status once, with where it came from and how late it was", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const stream = createFakeStream();
    const events: OrderingEvent[] = [];
    renderHook(() =>
      useOrderStatus("1001", fetchOrder, {
        subscribeToOrder: stream.subscribe,
        onEvent: (event) => events.push(event),
      }),
    );
    vi.setSystemTime(10_000);

    await answerLast(makeOrder("placed", 9_000));
    await act(async () => stream.last().send(makeOrder("accepted", 9_700)));
    // The courier moves: the same status again is not a change.
    await act(async () => stream.last().send(makeOrder("accepted", 9_900)));

    expect(events).toEqual([
      { type: "status_changed", from: null, to: "placed", source: "request", delayMs: 1000 },
      { type: "status_changed", from: "placed", to: "accepted", source: "stream", delayMs: 300 },
    ]);
  });

  it("never reports a negative delay when the clock of the server is ahead of ours", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const events: OrderingEvent[] = [];
    renderHook(() =>
      useOrderStatus("1001", fetchOrder, { onEvent: (event) => events.push(event) }),
    );
    vi.setSystemTime(10_000);

    await answerLast(makeOrder("placed", 99_000));

    expect(events[0]).toMatchObject({ delayMs: 0 });
  });

  it("reports once that it gave up the stream and polls", async () => {
    const { fetchOrder } = createFakeFetch();
    const stream = createFakeStream();
    const events: OrderingEvent[] = [];
    renderHook(() =>
      useOrderStatus("1001", fetchOrder, {
        subscribeToOrder: stream.subscribe,
        onEvent: (event) => events.push(event),
      }),
    );

    for (let failure = 0; failure <= MAX_STREAM_RECONNECTS; failure++) {
      await act(async () => stream.last().fail());
      await wait(4000);
    }

    expect(events).toEqual([{ type: "stream_fell_back", reconnects: 3 }]);
  });

  it("says when it got the order that is on screen", async () => {
    const { fetchOrder, answerLast } = createFakeFetch();
    const { result } = renderHook(() => useOrderStatus("1001", fetchOrder));
    expect(result.current.receivedAt).toBeNull();
    vi.setSystemTime(50_000);

    await answerLast(makeOrder("placed", 100));
    expect(result.current.receivedAt).toBe(50_000);

    // A failure does not change the time of the last good update.
    await wait(POLL_MS);
    await answerLast(new Error("500"));
    expect(result.current.receivedAt).toBe(50_000);
  });
});

describe("useOrderStatus: back online, and notifications", () => {
  it("asks at once when the browser says it is back online", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder));
    await answerLast(new Error("offline"));
    await wait(pollDelayMs(1));
    await answerLast(new Error("offline"));
    // The next try is 20 seconds away.

    await act(async () => void window.dispatchEvent(new Event("online")));

    expect(calls).toHaveLength(3);
  });

  it("does not ask for a finished order, or in a hidden tab, when the browser is back online", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder));
    await answerLast(makeOrder("preparing", 100));
    await setTabHidden(true);

    await act(async () => void window.dispatchEvent(new Event("online")));
    expect(calls).toHaveLength(1);

    await setTabHidden(false);
    await answerLast(makeOrder("delivered", 500));
    await act(async () => void window.dispatchEvent(new Event("online")));
    expect(calls).toHaveLength(2);
  });

  it("keeps polling in a hidden tab when the user asked for notifications", async () => {
    const { calls, fetchOrder, answerLast } = createFakeFetch();
    renderHook(() => useOrderStatus("1001", fetchOrder, { keepsListeningWhenHidden: true }));
    await answerLast(makeOrder("preparing", 100));

    await setTabHidden(true);
    await wait(POLL_MS);

    expect(calls).toHaveLength(2);
  });

  it("keeps the stream open in a hidden tab when the user asked for notifications", async () => {
    const { fetchOrder } = createFakeFetch();
    const stream = createFakeStream();
    renderHook(() =>
      useOrderStatus("1001", fetchOrder, {
        subscribeToOrder: stream.subscribe,
        keepsListeningWhenHidden: true,
      }),
    );

    await setTabHidden(true);

    expect(stream.last().isClosed).toBe(false);
    expect(stream.connections).toHaveLength(1);
  });
});
