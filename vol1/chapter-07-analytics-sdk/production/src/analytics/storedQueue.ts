/*
 * NOT PART OF THE INTERVIEW: production version.
 *
 * Why it holds at scale:
 *   1. Each tab stores its queue under its own key, so two tabs never write
 *      the same key and never send the same stored events.
 *   2. A queue is taken over only when its tab has not written for a minute,
 *      and one tab at a time does the taking, inside a Web Lock.
 *   3. The stored text has a size limit, so we never fill the storage that
 *      the host app also needs.
 */
import { readStorage, writeStorage } from "./storage";
import type { AnalyticsEvent } from "./types";

export const QUEUE_PREFIX = "analytics:queue:";
const TAKE_OVER_LOCK = "analytics:take-over";
/** The most characters one tab stores. One character is two bytes in `localStorage`. */
export const MAX_STORED_CHARS = 100_000;
/** A stored queue this old belongs to a tab that is gone. */
export const STALE_AFTER_MS = 60_000;

interface StoredQueue {
  savedAt: number;
  events: AnalyticsEvent[];
}

/**
 * Stores the queue of this tab. `events` holds the JSON text of each event,
 * made once when the event was queued. When the text is too long, the oldest
 * events are left out.
 */
export function saveQueue(key: string, events: string[], now: number = Date.now()): void {
  let length = 0;
  let first = events.length;
  while (first > 0 && length + events[first - 1].length + 1 <= MAX_STORED_CHARS) {
    first -= 1;
    length += events[first].length + 1;
  }
  const kept = events.slice(first);
  writeStorage(key, kept.length === 0 ? null : `{"savedAt":${now},"events":[${kept.join(",")}]}`);
}

function storedKeys(prefix: string): string[] {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    return keys.filter((key): key is string => key !== null && key.startsWith(prefix));
  } catch {
    return [];
  }
}

function readQueue(key: string): StoredQueue | null {
  try {
    const value = JSON.parse(readStorage(key) ?? "null") as Partial<StoredQueue> | null;
    return typeof value?.savedAt === "number" && Array.isArray(value.events)
      ? (value as StoredQueue)
      : null;
  } catch {
    return null;
  }
}

/**
 * Finds the queues that closed or crashed tabs left behind, removes them
 * from storage and gives their events to `adopt`.
 *
 * Two tabs that start together must not both take the same queue. Where the
 * Web Locks API exists, one tab at a time runs this, and the second finds
 * the queue already removed. The lock is held for a moment only. Without the
 * API (older browsers, plain HTTP pages) there is no lock: two tabs could,
 * very rarely, take the same queue, and the collector drops the copies by id.
 */
export function takeOverOldQueues(
  prefix: string,
  ownKey: string,
  adopt: (events: AnalyticsEvent[]) => void,
): void {
  const takeOver = () => {
    const now = Date.now();
    for (const key of storedKeys(prefix)) {
      const stored = readQueue(key);
      if (key !== ownKey && (stored === null || now - stored.savedAt > STALE_AFTER_MS)) {
        writeStorage(key, null);
        adopt(stored?.events ?? []);
      }
    }
  };

  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks === undefined) {
    takeOver();
  } else {
    locks.request(TAKE_OVER_LOCK, async () => takeOver()).catch(() => {});
  }
}

/** Removes every stored queue of this write key. Used when the user denies consent. */
export function removeStoredQueues(prefix: string): void {
  storedKeys(prefix).forEach((key) => writeStorage(key, null));
}
