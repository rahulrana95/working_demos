/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove that the stored queue survives a crash or a reload, that
 * several tabs do not send the same stored events, and that a batch is split
 * by size. Each `openTab()` is one tab or one page load. All of them share
 * the `localStorage` of the test page.
 */
import { MAX_BATCH_BYTES } from "./batchBytes";
import { MAX_STORED_CHARS, STALE_AFTER_MS } from "./storedQueue";
import {
  idle,
  installFakeBeacon,
  installFakeLocks,
  openTab,
  setVisibility,
  storedEvents,
  storedQueueKeys,
  trackMany,
  useSdkTestSetup,
} from "./testHelpers";

useSdkTestSetup();

const byteLength = (text: string) => new TextEncoder().encode(text).length;

describe("the stored queue", () => {
  it("holds every event that is waiting, after the next idle moment", async () => {
    const { analytics } = openTab();

    trackMany(analytics, 3);
    expect(storedEvents()).toEqual([]);
    await idle();

    expect(storedEvents().map((event) => event.properties.index)).toEqual([0, 1, 2]);
  });

  it("keeps the batch in flight until the collector has it", async () => {
    const { analytics, answer } = openTab({ batchSize: 2 });
    trackMany(analytics, 3);
    await idle();
    expect(storedEvents()).toHaveLength(3);

    await answer({ kind: "ok" });
    await idle();

    expect(storedEvents().map((event) => event.properties.index)).toEqual([2]);
  });

  it("is removed from storage when nothing is waiting", async () => {
    const { analytics, answer } = openTab();
    analytics.track("clicked");
    void analytics.flush();

    await answer({ kind: "ok" });
    await idle();

    expect(storedQueueKeys()).toEqual([]);
  });

  it("keeps a failed batch, and forgets a batch that the collector refused", async () => {
    const { analytics, answer } = openTab();
    analytics.track("clicked");
    void analytics.flush();

    await answer({ kind: "retry" });
    await idle();
    expect(storedEvents()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    await answer({ kind: "drop" });
    await idle();
    expect(storedEvents()).toEqual([]);
  });

  it("is emptied by a page exit that the browser accepted", () => {
    installFakeBeacon();
    const { analytics } = openTab();
    trackMany(analytics, 3);

    setVisibility("hidden");

    expect(storedQueueKeys()).toEqual([]);
  });

  it("keeps what the browser refused on page exit, for the next page", () => {
    installFakeBeacon(() => false);
    const { analytics } = openTab();
    trackMany(analytics, 3);

    setVisibility("hidden");

    expect(storedEvents()).toHaveLength(3);
  });

  it("never stores more than its size limit, and keeps the newest events", async () => {
    const { analytics } = openTab({ maxQueueSize: 1000, batchSize: 1000 });

    for (let index = 0; index < 300; index += 1) {
      analytics.track("clicked", { index, text: "x".repeat(1000) });
    }
    await idle();

    const [key] = storedQueueKeys();
    const stored = storedEvents();
    expect(localStorage.getItem(key)?.length).toBeLessThanOrEqual(MAX_STORED_CHARS);
    expect(stored.length).toBeGreaterThan(30);
    expect(stored[stored.length - 1].properties.index).toBe(299);
  });

  it("does not throw when storage is full, and still sends", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const { analytics, calls } = openTab();

    expect(() => trackMany(analytics, 3)).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls[0].batch.events).toHaveLength(3);
  });

  it("does not throw for an event that cannot become JSON", async () => {
    const { analytics, calls } = openTab();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => analytics.track("bad", circular)).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    analytics.track("good");
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls).toHaveLength(1);
    expect(calls[0].batch.events[0].name).toBe("good");
    expect(calls[0].batch.dropped).toBe(1);
  });
});

describe("events that a closed tab left behind", () => {
  it("are sent by the next page, with the same ids", async () => {
    const closed = openTab();
    trackMany(closed.analytics, 3);
    await idle();
    const leftIds = storedEvents().map((event) => event.id);
    await vi.advanceTimersByTimeAsync(0);

    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);
    const next = openTab();
    await vi.advanceTimersByTimeAsync(5000);

    expect(next.calls[0].batch.events.map((event) => event.id)).toEqual(leftIds);
  });

  it("go before the new events of the page that takes them", async () => {
    trackMany(openTab().analytics, 2, "old");
    await idle();
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);

    const next = openTab();
    next.analytics.track("new");
    void next.analytics.flush();

    expect(next.calls[0].batch.events.map((event) => event.name)).toEqual(["old", "old", "new"]);
  });

  it("are sent once when two new tabs open at the same moment", async () => {
    installFakeLocks();
    trackMany(openTab().analytics, 3);
    await idle();
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);

    const second = openTab();
    const third = openTab();
    await vi.advanceTimersByTimeAsync(5000);

    const sent = [...second.calls, ...third.calls].flatMap((call) => call.batch.events);
    expect(sent).toHaveLength(3);
    expect(storedQueueKeys()).toHaveLength(1);
  });

  it("are taken inside a Web Lock, one tab at a time", async () => {
    const locks = installFakeLocks();
    trackMany(openTab().analytics, 3);
    await idle();
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);

    const next = openTab();
    expect(next.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(new Set(locks.names)).toEqual(new Set(["analytics:take-over"]));
    expect(next.calls[0].batch.events).toHaveLength(3);
  });

  it("are not taken while their tab is alive", async () => {
    const alive = openTab({ flushIntervalMs: 30_000 });
    trackMany(alive.analytics, 3);

    await vi.advanceTimersByTimeAsync(STALE_AFTER_MS / 2);
    const other = openTab();
    other.analytics.track("own event");
    void other.analytics.flush();
    await other.answer({ kind: "ok" });

    expect(other.calls).toHaveLength(1);
    expect(other.calls[0].batch.events.map((event) => event.name)).toEqual(["own event"]);
    expect(alive.calls[0].batch.events).toHaveLength(3);
  });

  it("are not taken from a tab that keeps failing: each retry shows it is alive", async () => {
    const failing = openTab();
    failing.analytics.track("stuck");
    void failing.analytics.flush();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await failing.answer({ kind: "retry" });
      await vi.advanceTimersByTimeAsync(30_000);
    }

    const other = openTab();
    await vi.advanceTimersByTimeAsync(5000);

    expect(other.calls).toHaveLength(0);
  });

  it("after a reload, are taken once the old page has been silent for a minute", async () => {
    trackMany(openTab().analytics, 3, "before reload");
    await idle();

    const reloaded = openTab();
    reloaded.analytics.track("early");
    void reloaded.analytics.flush();
    await reloaded.answer({ kind: "ok" });
    expect(reloaded.calls).toHaveLength(1);

    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);
    reloaded.analytics.track("late");
    void reloaded.analytics.flush();
    await reloaded.answer({ kind: "ok" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(reloaded.calls[2].batch.events.map((event) => event.name)).toEqual([
      "before reload",
      "before reload",
      "before reload",
    ]);
  });

  it("are left alone when they belong to another write key", async () => {
    trackMany(openTab({ writeKey: "other_product" }).analytics, 3);
    await idle();
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);

    const next = openTab({ writeKey: "key_1" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(next.calls).toHaveLength(0);
    expect(storedEvents()).toHaveLength(3);
  });

  it("are left alone while consent is pending", async () => {
    trackMany(openTab().analytics, 3);
    await idle();
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);
    localStorage.removeItem("analytics:consent");

    const next = openTab({ consent: "pending" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(next.calls).toHaveLength(0);
    expect(storedEvents()).toHaveLength(3);
  });

  it("are removed without an error when the stored text is broken", async () => {
    localStorage.setItem("analytics:queue:key_1:broken", "{not json");
    localStorage.setItem("analytics:queue:key_1:wrong", JSON.stringify({ savedAt: "x" }));

    const { analytics, calls } = openTab();
    analytics.track("clicked");
    void analytics.flush();
    await idle();

    expect(calls[0].batch.events).toHaveLength(1);
    expect(storedQueueKeys()).toHaveLength(1);
  });

  it("do not make the queue longer than maxQueueSize", async () => {
    trackMany(openTab().analytics, 10);
    await idle();
    vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1);

    const next = openTab({ maxQueueSize: 4, batchSize: 10 });
    void next.analytics.flush();

    expect(next.calls[0].batch.events.map((event) => event.properties.index)).toEqual([6, 7, 8, 9]);
    expect(next.calls[0].batch.dropped).toBe(6);
  });
});

describe("the size of a batch", () => {
  it("splits a batch that would be larger than about 60 KB", async () => {
    const { analytics, calls, answer } = openTab({ batchSize: 20 });

    for (let index = 0; index < 20; index += 1) {
      analytics.track("big", { index, text: "x".repeat(5000) });
    }
    await idle();
    const sizes = [byteLength(JSON.stringify(calls[0].batch))];
    await answer({ kind: "ok" });
    await vi.advanceTimersByTimeAsync(5000);
    sizes.push(byteLength(JSON.stringify(calls[1].batch)));

    expect(calls.map((call) => call.batch.events.length)).toEqual([11, 9]);
    expect(Math.max(...sizes)).toBeLessThan(MAX_BATCH_BYTES + 200);
    expect(
      calls.flatMap((call) => call.batch.events.map((event) => event.properties.index)),
    ).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  it("keeps every beacon of a page exit under the 64 KiB limit of the browser", () => {
    let acceptedBytes = 0;
    const beacon = installFakeBeacon();
    beacon.sendBeacon.mockImplementation((_url: string, body: string) => {
      // Like a real browser: it holds at most 64 KiB of beacon data at a time.
      if (acceptedBytes + byteLength(body) > 65_536) {
        return false;
      }
      acceptedBytes += byteLength(body);
      return true;
    });
    const { analytics, calls } = openTab({ batchSize: 50, flushIntervalMs: 60_000 });
    for (let index = 0; index < 20; index += 1) {
      analytics.track("big", { index, text: "x".repeat(5000) });
    }

    setVisibility("hidden");

    // The first beacon fits. The second would cross the limit, so it stays stored.
    expect(beacon.sendBeacon).toHaveBeenCalledTimes(2);
    expect(acceptedBytes).toBeGreaterThan(50_000);
    expect(storedEvents().map((event) => event.properties.index)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
    expect(calls).toHaveLength(0);
  });

  it("sends an event that is too big for a beacon alone, by fetch", async () => {
    const { analytics, calls, answer } = openTab();

    analytics.track("small");
    analytics.track("huge", { text: "x".repeat(70_000) });
    analytics.track("small again");
    void analytics.flush();
    await answer({ kind: "ok" });
    await answer({ kind: "ok" });

    expect(calls.map((call) => call.batch.events.map((event) => event.name))).toEqual([
      ["small"],
      ["huge"],
      ["small again"],
    ]);
  });
});
