/*
 * NOT PART OF THE INTERVIEW: production version.
 * All the talk with the server. The component only draws what this returns.
 *
 * The events on screen are two layers, as in ../60-minutes:
 *   - `confirmed`: what the server told us, for every week loaded so far.
 *   - the queue of edits that the server has not answered yet (writeQueue.ts).
 * An edit shows at once, because the queue is drawn on top. If the server
 * says no, the edit leaves the queue and the confirmed event is back.
 *
 * What this version adds:
 *   1. Edits go through a queue: sent in order, kept while offline, kept
 *      over a reload.
 *   2. Conflicts: when the server says someone else changed the event first,
 *      the server's version is shown and the user is told.
 *   3. Newer wins: every event carries `updatedAt`. A slow load can no longer
 *      put an old copy over an event that was saved after the load began.
 *   4. Time limits on every request.
 *   5. Other tabs of the same browser hear about every confirmed edit.
 *   6. The month view: several weeks are asked for in one request.
 */
import { useEffect, useRef, useState } from "react";
import { toIso } from "./time";
import { withTimeout } from "./timeout";
import type { CalendarEvent, CalendarLogEvent, CalendarServer } from "./types";
import { WriteQueue } from "./writeQueue";
import type { QueuedWrite, WriteResult } from "./writeQueue";

export interface UseCalendarEventsOptions extends CalendarServer {
  /**
   * The starts of weeks in a row, as timestamps: the week before the visible
   * weeks, each visible week, the week after them, and the end of that one.
   * A week view passes 4 numbers, a month view of six weeks passes 9.
   */
  weeks: number[];
  /** Names the saved queue and the channel to other tabs. `null` turns both off. */
  storageKey: string | null;
  /** A request that takes longer than this has failed. */
  timeoutMs: number;
  onEvent?: (event: CalendarLogEvent) => void;
}

/** What the tabs of one browser tell each other: an event the server confirmed, or a deleted id. */
type TabMessage = { id: string; event: CalendarEvent | null };

type Confirmed = Map<string, CalendarEvent>;

/** Puts `incoming` into the map, unless the map already holds a newer copy of that event. */
function mergeNewer(confirmed: Confirmed, incoming: CalendarEvent[]): Confirmed {
  const merged = new Map(confirmed);
  for (const event of incoming) {
    const known = merged.get(event.id);
    const isOlder =
      known?.updatedAt !== undefined &&
      event.updatedAt !== undefined &&
      Date.parse(event.updatedAt) < Date.parse(known.updatedAt);
    if (!isOlder) {
      merged.set(event.id, event);
    }
  }
  return merged;
}

function withResult(confirmed: Confirmed, id: string, event: CalendarEvent | null): Confirmed {
  const next = new Map(confirmed);
  if (event === null) {
    next.delete(id);
  } else {
    next.set(id, event);
  }
  return next;
}

/** The storage of the browser, or null where it is blocked (some private windows throw on access). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useCalendarEvents(options: UseCalendarEventsOptions) {
  const { storageKey, timeoutMs } = options;
  const [confirmed, setConfirmed] = useState<Confirmed>(new Map());
  const [queued, setQueued] = useState<readonly QueuedWrite[]>([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  /** The last edit that was undone, and why. The next edit clears it. */
  const [problem, setProblem] = useState<"failed" | "conflict" | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The parent passes new functions and a new array on every render. We keep
  // the latest ones in a ref, so they do not start a new load.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  /** The starts of the weeks whose events are in `confirmed`. */
  const loadedWeeks = useRef(new Set<number>());
  const queue = useRef<WriteQueue | null>(null);

  // The queue and the channel to the other tabs live as long as the calendar.
  useEffect(() => {
    const channel =
      storageKey !== null && typeof BroadcastChannel === "function"
        ? new BroadcastChannel(`calendar:${storageKey}`)
        : null;
    if (channel !== null) {
      channel.onmessage = (message: MessageEvent<TabMessage>) =>
        setConfirmed((events) =>
          message.data.event === null
            ? withResult(events, message.data.id, null)
            : mergeNewer(events, [message.data.event]),
        );
    }

    function handleResult(write: QueuedWrite, result: WriteResult) {
      const durationMs = Date.now() - write.startedAt;
      const log = latest.current.onEvent;
      if (result.status === "saved") {
        setConfirmed((events) => withResult(events, write.id, result.event));
        channel?.postMessage({ id: write.id, event: result.event } satisfies TabMessage);
        if (write.action === "move") {
          log?.({ type: "event_moved", by: write.by, durationMs });
        } else {
          log?.({
            type: write.action === "create" ? "event_created" : "event_deleted",
            durationMs,
          });
        }
      } else if (result.status === "conflict") {
        // The server's version wins, and the user is told.
        setConfirmed((events) => withResult(events, write.id, result.current));
        setProblem("conflict");
        log?.({ type: "save_failed", reason: "conflict", durationMs });
      } else {
        setProblem("failed");
        log?.({ type: "save_failed", reason: "server", durationMs });
      }
    }

    let wasWaiting = false;
    const writeQueue = new WriteQueue({
      send: async (write, signal) => {
        if (write.event === null) {
          await latest.current.deleteEvent(write.id, signal);
          return null;
        }
        return latest.current.saveEvent(write.event, signal);
      },
      onResult: handleResult,
      onChange: () => {
        setQueued([...writeQueue.writes]);
        setIsWaiting(writeQueue.isWaiting);
        if (writeQueue.isWaiting && !wasWaiting) {
          latest.current.onEvent?.({ type: "save_queued", queueLength: writeQueue.writes.length });
        }
        wasWaiting = writeQueue.isWaiting;
      },
      timeoutMs,
      storage: storageKey === null ? null : browserStorage(),
      storageKey: `calendar-queue:${storageKey}`,
    });
    queue.current = writeQueue;
    setQueued([...writeQueue.writes]);

    // `navigator.onLine` is only a hint, so we do not read it. We just try
    // again when something suggests the connection may be back.
    const sendAgain = () => void writeQueue.flush();
    const sendWhenShown = () => document.visibilityState === "visible" && sendAgain();
    window.addEventListener("online", sendAgain);
    document.addEventListener("visibilitychange", sendWhenShown);
    // Edits left from the last visit are sent now. The small wait lets React's
    // double run of effects in development stop the first queue before it sends.
    void Promise.resolve().then(sendAgain);

    return () => {
      writeQueue.stop();
      channel?.close();
      window.removeEventListener("online", sendAgain);
      document.removeEventListener("visibilitychange", sendWhenShown);
    };
  }, [storageKey, timeoutMs]);

  const weeksKey = options.weeks.join();
  useEffect(() => {
    const controller = new AbortController();
    const { weeks } = latest.current;
    const startedAt = Date.now();

    /** Loads the weeks from index `first` up to index `last` that are not loaded yet, in one request for each gap. */
    function loadWeeks(first: number, last: number): Promise<void[]> {
      const requests: Promise<void>[] = [];
      for (let from = first; from < last; from++) {
        if (loadedWeeks.current.has(weeks[from])) {
          continue;
        }
        let to = from + 1;
        while (to < last && !loadedWeeks.current.has(weeks[to])) {
          to++;
        }
        requests.push(loadRange(from, to));
        from = to;
      }
      return Promise.all(requests);
    }

    async function loadRange(from: number, to: number): Promise<void> {
      const loaded = await withTimeout(
        (signal) => latest.current.fetchEvents(toIso(weeks[from]), toIso(weeks[to]), signal),
        latest.current.timeoutMs,
        controller.signal,
      );
      if (controller.signal.aborted) {
        return;
      }
      for (let index = from; index < to; index++) {
        loadedWeeks.current.add(weeks[index]);
      }
      // An event that crosses two weeks arrives twice. Its id keeps it single.
      setConfirmed((events) => mergeNewer(events, loaded));
      latest.current.onEvent?.({
        type: "events_loaded",
        weekCount: to - from,
        eventCount: loaded.length,
        durationMs: Date.now() - startedAt,
      });
    }

    const lastVisible = weeks.length - 2;
    const isLoaded = weeks.slice(1, lastVisible).every((week) => loadedWeeks.current.has(week));
    setStatus(isLoaded ? "ready" : "loading");
    loadWeeks(1, lastVisible).then(
      () => {
        if (!controller.signal.aborted) {
          setStatus("ready");
          // The neighbours load only now, so they never slow the visible weeks.
          // A failure here is silent, and that week is asked for again later.
          loadWeeks(0, 1).catch(() => {});
          loadWeeks(lastVisible, lastVisible + 1).catch(() => {});
        }
      },
      // An abort is not an error: we asked for it.
      () => controller.signal.aborted || setStatus("error"),
    );
    // This runs when the weeks change or the calendar is removed.
    return () => controller.abort();
  }, [weeksKey, attempt]);

  function write(event: CalendarEvent | null, id: string, by: QueuedWrite["by"]) {
    const isKnown = confirmed.has(id) || queued.some((item) => item.id === id);
    const action = event === null ? "delete" : isKnown ? "move" : "create";
    setProblem(null);
    queue.current?.add({ id, event, action, by, startedAt: Date.now() });
  }

  // The queue is drawn on top of the confirmed events, oldest edit first.
  const events = new Map(confirmed);
  for (const item of queued) {
    if (item.event === null) {
      events.delete(item.id);
    } else {
      events.set(item.id, item.event);
    }
  }

  return {
    /** The confirmed events with the unanswered edits of the user on top. A series is one event. */
    events: [...events.values()],
    status,
    problem,
    /** How many edits are waiting because the server could not be reached. 0 when none. */
    waitingCount: isWaiting ? queued.length : 0,
    /** Shows the event at once, then sends it. Undone if the server says no. */
    save: (event: CalendarEvent, by: QueuedWrite["by"] = "form") => write(event, event.id, by),
    /** Hides the event at once, then deletes it. It comes back if the server says no. */
    remove: (id: string) => write(null, id, "form"),
    /** Loads the visible weeks again. Used by the "Try again" button. */
    retry: () => setAttempt((count) => count + 1),
    /** Sends the waiting edits now. Used by the "Send now" button. */
    sendNow: () => void queue.current?.flush(),
  };
}
