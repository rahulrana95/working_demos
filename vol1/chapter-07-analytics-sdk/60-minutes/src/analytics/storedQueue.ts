/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * Write it when the interviewer asks, "What happens to the queue when the
 * tab crashes?" and then, "What if the user has five tabs open?"
 *
 * Why it holds at scale:
 *   1. Each tab stores its queue under its own key, so two tabs never write
 *      the same key and never send the same stored events.
 *   2. A queue is taken over only when its tab has not written for a minute,
 *      and one tab at a time does the taking, inside a Web Lock.
 *   3. At most 200 events are stored, so we do not fill the storage that the
 *      host app also needs.
 */
import { readStorage, writeStorage } from "./storage";
import type { AnalyticsEvent } from "./types";

export const QUEUE_PREFIX = "analytics:queue:";
const TAKE_OVER_LOCK = "analytics:take-over";
/** The most events one tab stores. The newest are kept. */
export const MAX_STORED_EVENTS = 200;
/** A stored queue this old belongs to a tab that is gone. */
export const STALE_AFTER_MS = 60_000;

interface StoredQueue {
  savedAt: number;
  events: AnalyticsEvent[];
}

/** Stores the queue of this tab, with the time of the write. */
export function saveQueue(key: string, events: AnalyticsEvent[], now: number = Date.now()): void {
  try {
    const kept = events.slice(-MAX_STORED_EVENTS);
    writeStorage(key, kept.length === 0 ? null : JSON.stringify({ savedAt: now, events: kept }));
  } catch {
    // An event that cannot become JSON. It is dropped when we try to send it.
  }
}

function storedKeys(prefix: string): string[] {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(prefix));
  } catch {
    return [];
  }
}

function readQueue(key: string): StoredQueue | null {
  try {
    const value = JSON.parse(readStorage(key) ?? "null") as StoredQueue | null;
    return typeof value?.savedAt === "number" && Array.isArray(value.events) ? value : null;
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
    for (const key of storedKeys(prefix)) {
      const stored = readQueue(key);
      if (key !== ownKey && (stored === null || Date.now() - stored.savedAt > STALE_AFTER_MS)) {
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

/** Removes every stored queue of this write key. Used when the user opts out. */
export function removeStoredQueues(prefix: string): void {
  storedKeys(prefix).forEach((key) => writeStorage(key, null));
}
