/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the behaviour of the SDK with a fake transport, fake
 * timers and a fake `sendBeacon`.
 */
import { createAnalytics, SEND_TIMEOUT_MS } from "./createAnalytics";
import {
  createFakeTransport,
  installFakeBeacon,
  removeFakeBeacon,
  setVisibility,
  trackPageListeners,
} from "./testHelpers";
import type { Analytics, AnalyticsOptions, Transport } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let listeners: ReturnType<typeof trackPageListeners>;

function setup(options: Partial<AnalyticsOptions> = {}) {
  const fake = createFakeTransport();
  const analytics = createAnalytics({
    endpoint: "https://collector.test/v1/batch",
    writeKey: "key_1",
    transport: fake.transport,
    ...options,
  });
  return { analytics, ...fake };
}

function trackMany(analytics: Analytics, count: number, name = "clicked"): void {
  for (let index = 0; index < count; index += 1) {
    analytics.track(name, { index });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  // With 1, the random part of every retry wait is at its largest: 1 s, 2 s, 4 s, ...
  vi.spyOn(Math, "random").mockReturnValue(1);
  localStorage.clear();
  listeners = trackPageListeners();
  setVisibility("visible");
});

afterEach(() => {
  listeners.removeAll();
  removeFakeBeacon();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the event", () => {
  it("gives every event its own id, the time, the name and the properties", async () => {
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    const { analytics, calls } = setup();

    analytics.track("signed_up", { plan: "pro" });
    analytics.track("signed_up", { plan: "free" });
    void analytics.flush();

    const [first, second] = calls[0].batch.events;
    expect(first).toMatchObject({ type: "track", name: "signed_up", properties: { plan: "pro" } });
    expect(first.timestamp).toBe(Date.parse("2026-01-02T03:04:05Z"));
    expect(first.id).toMatch(UUID);
    expect(second.id).toMatch(UUID);
    expect(second.id).not.toBe(first.id);
  });

  it("puts the write key and the sending time on the batch", async () => {
    const { analytics, calls } = setup();

    analytics.track("clicked");
    vi.setSystemTime(Date.now() + 1234);
    void analytics.flush();

    expect(calls[0].url).toBe("https://collector.test/v1/batch");
    expect(calls[0].batch.writeKey).toBe("key_1");
    expect(calls[0].batch.sentAt - calls[0].batch.events[0].timestamp).toBe(1234);
  });

  it("keeps the same anonymous id for the same browser after a reload", () => {
    const first = setup();
    first.analytics.track("clicked");
    void first.analytics.flush();

    const second = setup();
    second.analytics.track("clicked");
    void second.analytics.flush();

    const id = first.calls[0].batch.events[0].anonymousId;
    expect(id).toMatch(UUID);
    expect(second.calls[0].batch.events[0].anonymousId).toBe(id);
  });

  it("adds the user id to every event after identify", () => {
    const { analytics, calls } = setup();

    analytics.track("before");
    analytics.identify("user_7", { plan: "pro" });
    analytics.track("after");
    void analytics.flush();

    const [before, identify, after] = calls[0].batch.events;
    expect(before.userId).toBeUndefined();
    expect(identify).toMatchObject({
      type: "identify",
      userId: "user_7",
      properties: { plan: "pro" },
    });
    expect(after.userId).toBe("user_7");
  });

  it("sends the address of the page with a page event", () => {
    document.title = "Pricing";
    const { analytics, calls } = setup();

    analytics.page();
    analytics.page("Checkout");
    void analytics.flush();

    const [first, second] = calls[0].batch.events;
    expect(first).toMatchObject({ type: "page", name: "Pricing" });
    expect(first.properties).toEqual({
      url: location.href,
      path: location.pathname,
      referrer: document.referrer,
    });
    expect(second.name).toBe("Checkout");
  });

  it("does not change an event when the host changes its object after the call", () => {
    const { analytics, calls } = setup();
    const properties = { step: 1 };

    analytics.track("moved", properties);
    properties.step = 2;
    void analytics.flush();

    expect(calls[0].batch.events[0].properties).toEqual({ step: 1 });
  });

  it("makes an id on a page without crypto.randomUUID, such as a plain HTTP page", () => {
    vi.stubGlobal("crypto", {});
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { analytics, calls } = setup();

    analytics.track("clicked");
    void analytics.flush();

    expect(calls[0].batch.events[0].id).toMatch(UUID);
  });
});

describe("batching", () => {
  it("sends nothing until the flush interval has passed, then one batch", async () => {
    const { analytics, calls } = setup({ flushIntervalMs: 5000 });

    trackMany(analytics, 3);
    await vi.advanceTimersByTimeAsync(4999);
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].batch.events).toHaveLength(3);
  });

  it("sends at once when a full batch is waiting", () => {
    const { analytics, calls } = setup({ batchSize: 20 });

    trackMany(analytics, 19);
    expect(calls).toHaveLength(0);

    analytics.track("clicked");
    expect(calls).toHaveLength(1);
    expect(calls[0].batch.events).toHaveLength(20);
  });

  it("sends 25 events as two batches: 20 at once and 5 after the interval", async () => {
    const { analytics, calls, answer } = setup();

    trackMany(analytics, 25);
    await answer({ kind: "ok" });
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
    expect(calls[1].batch.events).toHaveLength(5);
    expect(calls[1].batch.events[0].properties).toEqual({ index: 20 });
  });

  it("keeps one request in flight: more full batches wait for the answer", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 20 });

    trackMany(analytics, 60);
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS - 1);
    expect(calls).toHaveLength(1);

    await answer({ kind: "ok" });
    expect(calls).toHaveLength(2);
    await answer({ kind: "ok" });
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.batch.events.length)).toEqual([20, 20, 20]);
  });

  it("sends one request when 1,000 events arrive while a request is in flight", () => {
    // Fewer events than in the 45-minute folder, because this folder stores
    // the queue again on every event.
    const { analytics, calls } = setup();

    trackMany(analytics, 1000);

    expect(calls).toHaveLength(1);
  });

  it("flush sends at once and resolves when nothing is waiting", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 2 });
    let isDone = false;

    analytics.track("a");
    const flushed = analytics.flush().then(() => {
      isDone = true;
    });
    expect(calls).toHaveLength(1);
    expect(isDone).toBe(false);

    await answer({ kind: "ok" });
    await flushed;
    expect(isDone).toBe(true);
  });

  it("flush during a request waits for it and then sends the rest", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 2 });

    trackMany(analytics, 3);
    const flushed = analytics.flush();
    expect(calls).toHaveLength(1);

    await answer({ kind: "ok" });
    expect(calls).toHaveLength(2);
    expect(calls[1].batch.events).toHaveLength(1);

    await answer({ kind: "ok" });
    await expect(flushed).resolves.toBeUndefined();
  });

  it("flush with nothing waiting sends no request", async () => {
    const { analytics, calls } = setup();

    await analytics.flush();

    expect(calls).toHaveLength(0);
  });
});

describe("retry", () => {
  it("sends a failed batch again with the same ids, before newer events", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 2 });

    trackMany(analytics, 2, "old");
    analytics.track("new");
    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(2);
    expect(calls[1].batch.events.map((event) => event.id)).toEqual(
      calls[0].batch.events.map((event) => event.id),
    );
    expect(calls[1].batch.events.map((event) => event.name)).toEqual(["old", "old"]);
  });

  it("waits twice as long after each failure, and never more than 30 seconds", async () => {
    const { analytics, calls, answer } = setup();
    analytics.track("clicked");
    void analytics.flush();

    for (const waitMs of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
      const before = calls.length;
      await answer({ kind: "retry" });
      await vi.advanceTimersByTimeAsync(waitMs - 1);
      expect(calls).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(before + 1);
    }
  });

  it("starts from a short wait again after a success", async () => {
    const { analytics, calls, answer } = setup();
    analytics.track("first");
    void analytics.flush();
    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(1000);
    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(2000);
    await answer({ kind: "ok" });

    analytics.track("second");
    void analytics.flush();
    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(5);
  });

  it("does not send new full batches while it waits to retry", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 2 });
    trackMany(analytics, 2);
    await answer({ kind: "retry" });

    trackMany(analytics, 10);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
  });

  it("treats a transport that rejects as a failure to retry", async () => {
    const { analytics, calls } = setup();
    analytics.track("clicked");
    void analytics.flush();

    calls[0].reject(new Error("network down"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(2);
    expect(calls[1].batch.events[0].id).toBe(calls[0].batch.events[0].id);
  });

  it("treats a transport that throws, or answers with nothing, as a failure to retry", async () => {
    let attempts = 0;
    const transport = ((): unknown => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("broken transport");
      }
      return Promise.resolve(undefined);
    }) as Transport;
    const analytics = createAnalytics({ endpoint: "/collect", writeKey: "k", transport });

    analytics.track("clicked");
    await analytics.flush();
    expect(attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(attempts).toBe(3);
  });

  it("throws away a batch that the collector refuses, and goes on with the next", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 2 });
    trackMany(analytics, 2, "refused");
    analytics.track("next");

    await answer({ kind: "drop" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls).toHaveLength(2);
    expect(calls[1].batch.events.map((event) => event.name)).toEqual(["next"]);
    expect(calls[1].batch.dropped).toBe(2);
  });

  it("gives up on a request with no answer after ten seconds, aborts it and tries again", async () => {
    const { analytics, calls } = setup();
    analytics.track("clicked");
    void analytics.flush();

    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    expect(calls[0].signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);
  });
});

describe("bounded memory", () => {
  it("drops the oldest events when the queue is full, and tells the collector how many", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 2, maxQueueSize: 5 });
    trackMany(analytics, 2);
    await answer({ kind: "retry" });

    trackMany(analytics, 6, "later");
    await vi.advanceTimersByTimeAsync(1000);

    // 8 events for 5 places: the 2 that failed and 1 newer one are gone.
    expect(calls[1].batch.dropped).toBe(3);
    expect(calls[1].batch.events.map((event) => event.properties.index)).toEqual([1, 2]);
  });

  it("holds at most maxQueueSize events through 1,000 events with the collector down", async () => {
    const { analytics, calls, answer } = setup({ maxQueueSize: 50, batchSize: 20 });
    trackMany(analytics, 20);
    await answer({ kind: "retry" });

    trackMany(analytics, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await answer({ kind: "ok" });
    await answer({ kind: "ok" });
    await vi.advanceTimersByTimeAsync(5000);
    await answer({ kind: "ok" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls.map((call) => call.batch.events.length)).toEqual([20, 20, 20, 10]);
    expect(calls[1].batch.dropped).toBe(970);
  });
});

describe("page exit", () => {
  it("hands the waiting events to sendBeacon when the page becomes hidden", () => {
    const beacon = installFakeBeacon();
    const { analytics, calls } = setup();
    trackMany(analytics, 3);

    setVisibility("hidden");

    expect(beacon.sendBeacon).toHaveBeenCalledTimes(1);
    expect(beacon.sendBeacon.mock.calls[0][0]).toBe("https://collector.test/v1/batch");
    expect(beacon.batches[0].events).toHaveLength(3);
    expect(beacon.batches[0].writeKey).toBe("key_1");
    expect(calls).toHaveLength(0);
  });

  it("does not send the same events again after the beacon took them", async () => {
    const beacon = installFakeBeacon();
    const { analytics, calls } = setup();
    trackMany(analytics, 3);

    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(beacon.sendBeacon).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it("sends on pagehide too, for a browser that did not say the page is hidden", () => {
    const beacon = installFakeBeacon();
    const { analytics } = setup();
    analytics.track("clicked");

    window.dispatchEvent(new Event("pagehide"));

    expect(beacon.batches[0].events).toHaveLength(1);
  });

  it("does nothing when the page becomes visible, or when nothing is waiting", () => {
    const beacon = installFakeBeacon();
    const { analytics } = setup();

    setVisibility("hidden");
    analytics.track("clicked");
    setVisibility("visible");

    expect(beacon.sendBeacon).not.toHaveBeenCalled();
  });

  it("sends the batch in flight again by beacon, with the same ids, and ignores the old answer", async () => {
    const beacon = installFakeBeacon();
    const { analytics, calls, answer } = setup({ batchSize: 2 });
    trackMany(analytics, 3);
    expect(calls).toHaveLength(1);

    setVisibility("hidden");

    expect(calls[0].signal.aborted).toBe(true);
    const sentIds = beacon.batches.flatMap((batch) => batch.events.map((event) => event.id));
    expect(sentIds.slice(0, 2)).toEqual(calls[0].batch.events.map((event) => event.id));
    expect(sentIds).toHaveLength(3);

    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });

  it("sends the exit data in batches of batchSize", () => {
    const beacon = installFakeBeacon();
    const { analytics, calls, answer } = setup({ batchSize: 20 });
    trackMany(analytics, 20);
    void answer({ kind: "retry" });
    trackMany(analytics, 30);
    expect(calls).toHaveLength(1);

    setVisibility("hidden");

    expect(beacon.batches.map((batch) => batch.events.length)).toEqual([20, 20, 10]);
  });

  it("keeps what the browser refuses to take, and sends it when the page is still alive", async () => {
    let taken = 0;
    const beacon = installFakeBeacon(() => (taken += 1) <= 1);
    const { analytics, calls } = setup({ batchSize: 2 });
    analytics.track("a");
    analytics.track("b");
    calls[0].reject(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    trackMany(analytics, 3);

    setVisibility("hidden");
    expect(beacon.batches).toHaveLength(1);

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(2);
    expect(calls[1].batch.events).toHaveLength(2);
  });

  it("uses fetch with keepalive in a browser without sendBeacon", () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("page is gone")));
    vi.stubGlobal("fetch", fetchMock);
    const { analytics } = setup();
    analytics.track("clicked");

    setVisibility("hidden");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://collector.test/v1/batch");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
  });

  it("never listens to unload or beforeunload", () => {
    setup();

    expect(listeners.names().sort()).toEqual(["pagehide", "visibilitychange"]);
  });
});

describe("safety", () => {
  it("does not throw for properties that cannot become JSON, and still sends later events", async () => {
    const { analytics, calls } = setup({ batchSize: 2 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => analytics.track("bad", circular)).not.toThrow();
    analytics.track("in the same batch");
    analytics.track("good");
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls).toHaveLength(1);
    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["good"]);
    expect(calls[0].batch.dropped).toBe(2);
  });

  it("does not throw on page exit for properties that cannot become JSON", () => {
    const beacon = installFakeBeacon();
    const { analytics } = setup({ batchSize: 1, flushIntervalMs: 5000 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    analytics.track("ok");
    analytics.track("bad", circular);
    analytics.track("good");

    expect(() => setVisibility("hidden")).not.toThrow();

    expect(beacon.batches.map((batch) => batch.events[0].name)).toEqual(["ok", "good"]);
    expect(beacon.batches[1].dropped).toBe(1);
  });

  it("works when localStorage throws on every call", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { analytics, calls } = setup();

    expect(() => {
      analytics.track("clicked");
      analytics.optOut();
      analytics.optIn();
      analytics.track("clicked again");
    }).not.toThrow();
    void analytics.flush();

    expect(calls[0].batch.events[0].anonymousId).toMatch(UUID);
  });

  it("does not throw when sendBeacon throws", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: () => {
        throw new Error("beacon broke");
      },
      configurable: true,
    });
    const { analytics } = setup();
    analytics.track("clicked");

    expect(() => setVisibility("hidden")).not.toThrow();
  });

  it("does not throw when the host passes wrong arguments", () => {
    const { analytics } = setup();
    const loose = analytics as unknown as Record<string, (...args: unknown[]) => unknown>;

    expect(() => {
      loose.track();
      loose.track(null, "not an object");
      loose.identify(undefined, 42);
      loose.page({});
    }).not.toThrow();
  });

  it("does nothing, and does not throw, where there is no window (server rendering)", async () => {
    vi.stubGlobal("window", undefined);
    const transport = vi.fn();

    const analytics = createAnalytics({ endpoint: "/collect", writeKey: "k", transport });
    analytics.track("clicked");
    analytics.identify("user_1");
    analytics.page();
    analytics.optOut();
    analytics.optIn();
    await analytics.flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(transport).not.toHaveBeenCalled();
    expect(listeners.names()).toEqual([]);
  });

  it("does nothing on import: no listener, no timer, no storage access", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    vi.resetModules();

    await import("./index");

    expect(listeners.names()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(getItem).not.toHaveBeenCalled();
  });
});

describe("beforeSend", () => {
  it("can change an event before it is queued", () => {
    const { analytics, calls } = setup({
      beforeSend: (event) => ({
        ...event,
        properties: { ...event.properties, email: "[removed]" },
      }),
    });

    analytics.track("signed_up", { email: "asha@example.com", plan: "pro" });
    void analytics.flush();

    expect(calls[0].batch.events[0].properties).toEqual({ email: "[removed]", plan: "pro" });
  });

  it("can drop an event by returning null, and that is not counted as a loss", () => {
    const { analytics, calls } = setup({
      beforeSend: (event) => (event.name === "secret" ? null : event),
    });

    analytics.track("secret");
    analytics.track("public");
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["public"]);
    expect(calls[0].batch.dropped).toBe(0);
  });

  it("does not let an error in the hook reach the page, and does not send that event", () => {
    const { analytics, calls } = setup({
      beforeSend: (event) => {
        if (event.name === "bad") {
          throw new Error("hook failed");
        }
        return event;
      },
    });

    expect(() => analytics.track("bad", { email: "asha@example.com" })).not.toThrow();
    analytics.track("good");
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["good"]);
    expect(calls[0].batch.dropped).toBe(1);
  });

  it("runs before the queue is stored, so removed data never reaches localStorage", () => {
    const { analytics } = setup({ beforeSend: (event) => ({ ...event, properties: {} }) });

    analytics.track("signed_up", { email: "asha@example.com" });

    expect(JSON.stringify(localStorage)).toContain("signed_up");
    expect(JSON.stringify(localStorage)).not.toContain("asha@example.com");
  });

  it("cannot change the host's own object", () => {
    const properties = { email: "asha@example.com" };
    const { analytics } = setup({
      beforeSend: (event) => {
        delete event.properties.email;
        return event;
      },
    });

    analytics.track("signed_up", properties);

    expect(properties).toEqual({ email: "asha@example.com" });
  });

  it("sends the full URL of a page event unless the hook removes it", () => {
    history.replaceState(null, "", "/reset?token=abc");
    const cut = setup({
      beforeSend: (event) => ({ ...event, properties: { path: event.properties.path } }),
    });
    const plain = setup();

    cut.analytics.page();
    plain.analytics.page();
    void cut.analytics.flush();
    void plain.analytics.flush();
    history.replaceState(null, "", "/");

    expect(cut.calls[0].batch.events[0].properties).toEqual({ path: "/reset" });
    expect(plain.calls[0].batch.events[0].properties.url).toBe(
      "http://localhost:3000/reset?token=abc",
    );
  });
});

describe("opt out", () => {
  it("forgets what is waiting and collects nothing more", async () => {
    const beacon = installFakeBeacon();
    const { analytics, calls } = setup();
    trackMany(analytics, 3);

    analytics.optOut();
    analytics.track("after opt out");
    analytics.identify("user_1");
    analytics.page();
    await analytics.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    setVisibility("hidden");

    expect(calls).toHaveLength(0);
    expect(beacon.sendBeacon).not.toHaveBeenCalled();
  });

  it("aborts the request in flight and does not retry it", async () => {
    const { analytics, calls, answer } = setup({ batchSize: 2 });
    trackMany(analytics, 2);

    analytics.optOut();
    expect(calls[0].signal.aborted).toBe(true);

    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });

  it("is remembered after a reload", async () => {
    setup().analytics.optOut();

    const { analytics, calls } = setup();
    analytics.track("clicked");
    await analytics.flush();

    expect(calls).toHaveLength(0);
  });

  it("removes the anonymous id and every stored queue of this write key, also of other tabs", () => {
    trackMany(setup().analytics, 3);
    const { analytics } = setup();
    analytics.track("clicked");

    analytics.optOut();

    expect(Object.keys(localStorage)).toEqual(["analytics:optOut"]);
  });

  it("opt in starts with a new anonymous id and no user id", () => {
    const { analytics, calls } = setup();
    analytics.identify("user_1");
    void analytics.flush();
    const oldId = calls[0].batch.events[0].anonymousId;

    analytics.optOut();
    analytics.optIn();
    analytics.track("back");
    void analytics.flush();

    const event = calls[1].batch.events[0];
    expect(event.anonymousId).toMatch(UUID);
    expect(event.anonymousId).not.toBe(oldId);
    expect(event.userId).toBeUndefined();
    expect(localStorage.getItem("analytics:anonymousId")).toBe(event.anonymousId);
  });

  it("opt in without an opt out before it changes nothing", () => {
    const { analytics, calls } = setup();
    analytics.track("first");
    analytics.optIn();
    analytics.track("second");
    void analytics.flush();

    const [first, second] = calls[0].batch.events;
    expect(second.anonymousId).toBe(first.anonymousId);
  });
});
