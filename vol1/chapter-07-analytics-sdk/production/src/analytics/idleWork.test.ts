/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove that the SDK does its slow work in idle time, in small
 * steps, and that nothing is lost when there is no idle time left.
 */
import {
  installFakeBeacon,
  openTab,
  setVisibility,
  storedEvents,
  trackMany,
  useSdkTestSetup,
} from "./testHelpers";

useSdkTestSetup();

type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

/** A fake `requestIdleCallback` that the test runs by hand. */
function stubRequestIdleCallback() {
  const waiting: IdleCallback[] = [];
  vi.stubGlobal("requestIdleCallback", (callback: IdleCallback) => waiting.push(callback));
  vi.stubGlobal("cancelIdleCallback", () => {});
  /** Runs the oldest waiting callback with this much idle time. */
  const runNext = (timeRemaining: number) =>
    waiting.shift()?.({ didTimeout: false, timeRemaining: () => timeRemaining });
  return { waiting, runNext };
}

describe("idle-time work", () => {
  it("does nothing in the track call itself: no hook, no storage write, no request", () => {
    const browser = stubRequestIdleCallback();
    const beforeSend = vi.fn((event) => event);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { analytics, calls } = openTab({ beforeSend, batchSize: 2 });
    setItem.mockClear();

    trackMany(analytics, 5);

    expect(beforeSend).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(browser.waiting).toHaveLength(1);
  });

  it("asks for one idle moment for many calls, not one for each", () => {
    const browser = stubRequestIdleCallback();
    const { analytics } = openTab();

    trackMany(analytics, 100);

    expect(browser.waiting).toHaveLength(1);
  });

  it("stops when the idle time is used up, and goes on in the next idle moment", () => {
    const browser = stubRequestIdleCallback();
    const beforeSend = vi.fn((event) => event);
    const { analytics } = openTab({ beforeSend, batchSize: 100 });
    trackMany(analytics, 3);

    // No time left: one event is prepared, so the work always moves forward.
    browser.runNext(0);
    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(analytics.getStats().queued).toBe(3);

    browser.runNext(0);
    expect(beforeSend).toHaveBeenCalledTimes(2);

    browser.runNext(50);
    expect(beforeSend).toHaveBeenCalledTimes(3);
    expect(browser.waiting).toHaveLength(0);
    expect(storedEvents().map((event) => event.properties.index)).toEqual([0, 1, 2]);
  });

  it("writes the queue to storage once for a burst of events", () => {
    const browser = stubRequestIdleCallback();
    const { analytics } = openTab({ batchSize: 100 });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    trackMany(analytics, 50);

    browser.runNext(50);

    const queueWrites = setItem.mock.calls.filter(([key]) => key.startsWith("analytics:queue:"));
    expect(queueWrites).toHaveLength(1);
  });

  it("prepares everything at once when the page is hidden before the browser was idle", () => {
    stubRequestIdleCallback();
    const beacon = installFakeBeacon();
    const { analytics } = openTab();
    trackMany(analytics, 3);

    setVisibility("hidden");

    expect(beacon.batches[0].events.map((event) => event.properties.index)).toEqual([0, 1, 2]);
  });

  it("handles a call that a hook makes while events are prepared, after the others", () => {
    const browser = stubRequestIdleCallback();
    const tab = openTab({
      batchSize: 100,
      beforeSend: (event) => {
        if (event.name === "first") {
          tab.analytics.track("made by the hook");
        }
        return event;
      },
    });
    tab.analytics.track("first");
    tab.analytics.track("second");

    browser.runNext(50);
    browser.runNext(50);
    void tab.analytics.flush();

    expect(tab.calls[0].batch.events.map((event) => event.name)).toEqual([
      "first",
      "second",
      "made by the hook",
    ]);
  });

  it("keeps the time of the call, not the time of the idle moment", async () => {
    const browser = stubRequestIdleCallback();
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    const { analytics, calls } = openTab();
    analytics.track("clicked");

    await vi.advanceTimersByTimeAsync(900);
    browser.runNext(50);
    void analytics.flush();

    expect(calls[0].batch.events[0].timestamp).toBe(Date.parse("2026-01-02T03:04:05Z"));
  });
});
