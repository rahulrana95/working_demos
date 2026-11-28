/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the storage functions on their own. The tests with
 * several tabs are in `persistence.test.ts`.
 */
import {
  MAX_STORED_CHARS,
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
    sessionId: "s",
  }));
}

/** The JSON text of each event, as the SDK keeps it. */
function texts(count: number, text = ""): string[] {
  return events(count, text).map((event) => JSON.stringify(event));
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
    saveQueue(`${PREFIX}a`, texts(2), 1234);

    expect(JSON.parse(localStorage.getItem(`${PREFIX}a`) ?? "")).toEqual({
      savedAt: 1234,
      events: events(2),
    });
  });

  it("removes the key for an empty queue", () => {
    saveQueue(`${PREFIX}a`, texts(2));
    saveQueue(`${PREFIX}a`, []);

    expect(localStorage.getItem(`${PREFIX}a`)).toBeNull();
  });

  it("leaves out the oldest events until the text fits", () => {
    saveQueue(`${PREFIX}a`, texts(1000, "x".repeat(1000)));

    const text = localStorage.getItem(`${PREFIX}a`) ?? "";
    const stored = (JSON.parse(text) as { events: AnalyticsEvent[] }).events;
    expect(text.length).toBeLessThanOrEqual(MAX_STORED_CHARS);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[stored.length - 1].id).toBe("999");
  });

  it("stores nothing when one event alone is over the limit", () => {
    saveQueue(`${PREFIX}a`, texts(1, "x".repeat(MAX_STORED_CHARS)));

    expect(localStorage.getItem(`${PREFIX}a`)).toBeNull();
  });
});

describe("takeOverOldQueues", () => {
  it("gives the events of an old queue to the caller and removes the queue", () => {
    const adopt = vi.fn();
    saveQueue(`${PREFIX}old`, texts(2), Date.now() - STALE_AFTER_MS - 1);

    takeOverOldQueues(PREFIX, `${PREFIX}own`, adopt);

    expect(adopt).toHaveBeenCalledWith(events(2));
    expect(localStorage.getItem(`${PREFIX}old`)).toBeNull();
  });

  it("leaves a fresh queue, its own queue and other keys alone", () => {
    const adopt = vi.fn();
    saveQueue(`${PREFIX}fresh`, texts(1), Date.now() - STALE_AFTER_MS + 1000);
    saveQueue(`${PREFIX}own`, texts(1), Date.now() - 10 * STALE_AFTER_MS);
    localStorage.setItem("the-host-app", "its own data");

    takeOverOldQueues(PREFIX, `${PREFIX}own`, adopt);

    expect(adopt).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(3);
  });

  it("waits for the Web Lock before it reads storage", async () => {
    const locks = installFakeLocks();
    const adopt = vi.fn();
    saveQueue(`${PREFIX}old`, texts(2), Date.now() - STALE_AFTER_MS - 1);

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
    saveQueue(`${PREFIX}a`, texts(1));
    saveQueue(`${PREFIX}b`, texts(1));
    saveQueue("analytics:queue:other:a", texts(1));
    localStorage.setItem("the-host-app", "its own data");

    removeStoredQueues(PREFIX);

    expect(Object.keys(localStorage).sort()).toEqual(["analytics:queue:other:a", "the-host-app"]);
  });
});
