/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the health counters, the error hook, debug mode and
 * `shutdown`.
 */
import {
  idle,
  installFakeBeacon,
  openTab,
  setVisibility,
  storedEvents,
  trackMany,
  trackPageListeners,
  useSdkTestSetup,
} from "./testHelpers";
import type { ErrorSource } from "./types";

useSdkTestSetup();

describe("getStats", () => {
  it("starts at zero", () => {
    const { analytics } = openTab();

    expect(analytics.getStats()).toEqual({
      queued: 0,
      sent: 0,
      retried: 0,
      dropped: 0,
      lastError: null,
    });
  });

  it("counts an event as queued from the call until the collector has it", async () => {
    const { analytics, answer } = openTab({ batchSize: 2 });

    trackMany(analytics, 3);
    expect(analytics.getStats().queued).toBe(3);
    await idle();
    expect(analytics.getStats().queued).toBe(3);

    await answer({ kind: "ok" });
    expect(analytics.getStats()).toMatchObject({ queued: 1, sent: 2 });
  });

  it("counts retries, and keeps the events queued", async () => {
    const { analytics, answer } = openTab();
    analytics.track("clicked");
    void analytics.flush();

    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(1000);
    await answer({ kind: "retry" });

    expect(analytics.getStats()).toMatchObject({ queued: 1, sent: 0, retried: 2 });
    expect(analytics.getStats().lastError).toBe(
      "transport: A batch did not reach the collector. It will be sent again.",
    );
  });

  it("counts events the collector refused as dropped", async () => {
    const { analytics, answer } = openTab();
    trackMany(analytics, 3);
    void analytics.flush();

    await answer({ kind: "drop" });

    expect(analytics.getStats()).toMatchObject({ queued: 0, sent: 0, dropped: 3 });
  });

  it("counts events handed to the browser on page exit as sent", () => {
    installFakeBeacon();
    const { analytics } = openTab();
    trackMany(analytics, 3);

    setVisibility("hidden");

    expect(analytics.getStats()).toMatchObject({ queued: 0, sent: 3 });
  });

  it("returns a copy: changing it does not change the SDK", () => {
    const { analytics } = openTab();

    analytics.getStats().sent = 99;

    expect(analytics.getStats().sent).toBe(0);
  });

  it("never holds event data: only numbers and the last error", async () => {
    const { analytics, answer } = openTab({
      beforeSend: () => {
        throw new Error("hook failed");
      },
    });
    analytics.track("secret_name", { email: "asha@example.com" });
    analytics.identify("user_42", { email: "asha@example.com" });
    void analytics.flush();
    await answer({ kind: "ok" }).catch(() => {});

    const text = JSON.stringify(analytics.getStats());
    expect(text).not.toContain("asha@example.com");
    expect(text).not.toContain("secret_name");
    expect(text).not.toContain("user_42");
  });
});

describe("onError", () => {
  it("is told when beforeSend throws, with the error and where it came from", () => {
    const onError = vi.fn();
    const failure = new Error("hook failed");
    const { analytics } = openTab({
      onError,
      beforeSend: () => {
        throw failure;
      },
    });

    analytics.track("clicked");
    void analytics.flush();

    expect(onError).toHaveBeenCalledWith(failure, "beforeSend");
    expect(analytics.getStats()).toMatchObject({
      dropped: 1,
      lastError: "beforeSend: hook failed",
    });
  });

  it("is told when a batch must be sent again and when a batch is refused", async () => {
    const sources: ErrorSource[] = [];
    const { analytics, answer } = openTab({ onError: (_error, source) => sources.push(source) });
    analytics.track("clicked");
    void analytics.flush();

    await answer({ kind: "retry" });
    await vi.advanceTimersByTimeAsync(1000);
    await answer({ kind: "drop" });

    expect(sources).toEqual(["transport", "transport"]);
  });

  it("is told about an event that cannot become JSON", async () => {
    const onError = vi.fn();
    const { analytics } = openTab({ onError });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    analytics.track("bad", circular);
    await idle();

    expect(onError).toHaveBeenCalledWith(expect.any(TypeError), "sdk");
  });

  it("is not told about a request that we aborted ourselves on page exit", async () => {
    installFakeBeacon();
    const onError = vi.fn();
    const { analytics, calls } = openTab({ onError, batchSize: 1 });
    analytics.track("clicked");
    await idle();

    setVisibility("hidden");
    calls[0].reject(new DOMException("Aborted", "AbortError"));
    await idle();

    expect(onError).not.toHaveBeenCalled();
  });

  it("cannot break the SDK or the page when it throws itself", async () => {
    const { analytics, calls } = openTab({
      onError: () => {
        throw new Error("the error hook failed");
      },
      beforeSend: (event) => {
        if (event.name === "bad") {
          throw new Error("hook failed");
        }
        return event;
      },
    });

    expect(() => analytics.track("bad")).not.toThrow();
    analytics.track("good");
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["good"]);
  });
});

describe("debug mode", () => {
  it("logs nothing by default", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { analytics, answer } = openTab();

    analytics.track("Not A Good Name");
    void analytics.flush();
    await answer({ kind: "ok" });

    expect(debug).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs what was queued, sent and answered", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { analytics, answer } = openTab({ debug: true });

    analytics.track("checkout_started");
    void analytics.flush();
    await answer({ kind: "ok" });

    const lines = debug.mock.calls.map((call) => call.join(" "));
    expect(lines).toContain("[analytics] queued track checkout_started");
    expect(lines).toContain("[analytics] sending 1 event(s)");
    expect(lines).toContain("[analytics] the collector answered ok for 1 event(s)");
  });

  it("does not log the properties of an event", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { analytics } = openTab({ debug: true });

    analytics.track("signed_up", { email: "asha@example.com" });
    await idle();

    expect(JSON.stringify(debug.mock.calls)).not.toContain("asha@example.com");
  });

  it("warns once about an event name that breaks the naming rule", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { analytics, calls } = openTab({ debug: true });

    analytics.track("Checkout Started");
    analytics.track("Checkout Started");
    analytics.track("checkout_started");
    void analytics.flush();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('"Checkout Started"');
    // The warning is advice. The event is still sent.
    expect(calls[0].batch.events).toHaveLength(3);
  });

  it("does not warn about page and identify events", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.title = "Pricing | Shop";
    const { analytics } = openTab({ debug: true });

    analytics.page();
    analytics.identify("user_1");
    await idle();

    expect(warn).not.toHaveBeenCalled();
  });

  it("remembers at most 100 wrong names, so the memory stays bounded", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { analytics } = openTab({ debug: true, maxQueueSize: 1000 });

    for (let index = 0; index < 300; index += 1) {
      analytics.track(`Bad Name ${index}`);
    }
    await idle();

    expect(warn).toHaveBeenCalledTimes(100);
  });
});

describe("shutdown", () => {
  it("hands what is waiting to the browser, then removes its listeners and timers", async () => {
    const beacon = installFakeBeacon();
    const listeners = trackPageListeners();
    const removeFromWindow = vi.spyOn(window, "removeEventListener");
    const removeFromDocument = vi.spyOn(document, "removeEventListener");
    const { analytics, calls } = openTab({ flushIntervalMs: 5000 });
    trackMany(analytics, 3);

    analytics.shutdown();
    const removed = [...removeFromWindow.mock.calls, ...removeFromDocument.mock.calls];
    await vi.advanceTimersByTimeAsync(60_000);

    expect(beacon.batches[0].events).toHaveLength(3);
    expect(removed.map((call) => call[0]).sort()).toEqual(listeners.names().sort());
    expect(calls).toHaveLength(0);
    expect(beacon.sendBeacon).toHaveBeenCalledTimes(1);
  });

  it("makes every later call do nothing", async () => {
    const beacon = installFakeBeacon();
    const { analytics, calls } = openTab();
    analytics.shutdown();

    analytics.track("after");
    analytics.page();
    analytics.identify("user_1");
    analytics.setConsent("denied");
    await analytics.flush();
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    analytics.shutdown();

    expect(calls).toHaveLength(0);
    expect(beacon.sendBeacon).not.toHaveBeenCalled();
    expect(analytics.getStats().queued).toBe(0);
  });

  it("leaves what the browser refused in storage, for the next page, and does not send it itself", async () => {
    installFakeBeacon(() => false);
    const { analytics, calls } = openTab();
    trackMany(analytics, 3);

    analytics.shutdown();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(storedEvents()).toHaveLength(3);
    expect(calls).toHaveLength(0);
  });
});
