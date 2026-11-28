/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the storage functions on their own. The tests with
 * several tabs are in `persistence.test.ts`.
 */
import {
  MAX_STORED_EVENTS,
  removeStoredQueues,
  saveQueue,
  STALE_AFTER_MS,
  takeOverOldQueues,
} from "./storedQueue";
import { installFakeLocks, removeFakeLocks } from "./testHelpers";
import type { AnalyticsEvent } from "./types";

const PREFIX = "analytics:queue:key_1:";

function events(count: number, text = ""): AnalyticsEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    type: "track" as const,
    name: "n",
    properties: { text },
    timestamp: 0,
    anonymousId: "a",
  }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  removeFakeLocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saveQueue", () => {
  it("stores the events with the time of the write", () => {
    saveQueue(`${PREFIX}a`, events(2), 1234);

    expect(JSON.parse(localStorage.getItem(`${PREFIX}a`) ?? "")).toEqual({
      savedAt: 1234,
      events: events(2),
    });
  });

  it("removes the key for an empty queue", () => {
    saveQueue(`${PREFIX}a`, events(2));
    saveQueue(`${PREFIX}a`, []);

    expect(localStorage.getItem(`${PREFIX}a`)).toBeNull();
  });

  it("leaves out the oldest events when there are more than 200", () => {
    saveQueue(`${PREFIX}a`, events(MAX_STORED_EVENTS + 50));

    const stored = (
      JSON.parse(localStorage.getItem(`${PREFIX}a`) ?? "") as { events: AnalyticsEvent[] }
    ).events;
    expect(stored).toHaveLength(MAX_STORED_EVENTS);
    expect(stored[0].id).toBe("50");
  });

  it("does not throw when the text does not fit in storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(() => saveQueue(`${PREFIX}a`, events(10, "x".repeat(100_000)))).not.toThrow();
  });

  it("does not throw for an event that cannot become JSON", () => {
    const [bad] = events(1);
    bad.properties.self = bad.properties;

    expect(() => saveQueue(`${PREFIX}a`, [bad])).not.toThrow();
  });
});

describe("takeOverOldQueues", () => {
  it("gives the events of an old queue to the caller and removes the queue", () => {
    const adopt = vi.fn();
    saveQueue(`${PREFIX}old`, events(2), Date.now() - STALE_AFTER_MS - 1);

    takeOverOldQueues(PREFIX, `${PREFIX}own`, adopt);

    expect(adopt).toHaveBeenCalledWith(events(2));
    expect(localStorage.getItem(`${PREFIX}old`)).toBeNull();
  });

  it("leaves a fresh queue, its own queue and other keys alone", () => {
    const adopt = vi.fn();
    saveQueue(`${PREFIX}fresh`, events(1), Date.now() - STALE_AFTER_MS + 1000);
    saveQueue(`${PREFIX}own`, events(1), Date.now() - 10 * STALE_AFTER_MS);
    localStorage.setItem("the-host-app", "its own data");

    takeOverOldQueues(PREFIX, `${PREFIX}own`, adopt);

    expect(adopt).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(3);
  });

  it("waits for the Web Lock before it reads storage", async () => {
    const locks = installFakeLocks();
    const adopt = vi.fn();
    saveQueue(`${PREFIX}old`, events(2), Date.now() - STALE_AFTER_MS - 1);

    takeOverOldQueues(PREFIX, `${PREFIX}own`, adopt);
    expect(adopt).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();

    expect(locks.names).toEqual(["analytics:take-over"]);
    expect(adopt).toHaveBeenCalledTimes(1);
  });

  it("does not throw, and reports no unhandled error, when the lock request fails", async () => {
    Object.defineProperty(navigator, "locks", {
      value: { request: () => Promise.reject(new DOMException("no locks", "SecurityError")) },
      configurable: true,
    });

    expect(() => takeOverOldQueues(PREFIX, `${PREFIX}own`, vi.fn())).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("does nothing when localStorage cannot be read", () => {
    vi.stubGlobal("localStorage", undefined);
    const adopt = vi.fn();

    expect(() => takeOverOldQueues(PREFIX, `${PREFIX}own`, adopt)).not.toThrow();
    expect(adopt).not.toHaveBeenCalled();
  });
});

describe("removeStoredQueues", () => {
  it("removes the queues of this write key only", () => {
    saveQueue(`${PREFIX}a`, events(1));
    saveQueue(`${PREFIX}b`, events(1));
    saveQueue("analytics:queue:other:a", events(1));
    localStorage.setItem("the-host-app", "its own data");

    removeStoredQueues(PREFIX);

    expect(Object.keys(localStorage).sort()).toEqual(["analytics:queue:other:a", "the-host-app"]);
  });
});
