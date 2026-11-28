/*
 * PART OF THE INTERVIEW: yes (about 11 minutes).
 * Write it after the layout function. It holds all the talk with the server,
 * so the component only draws.
 *
 * The events on screen are two layers:
 *   - `confirmed`: what the server told us, for every week loaded so far.
 *   - `pending`: the edits of the user that the server has not answered yet.
 * An edit shows at once, because `pending` is drawn on top. If the server says
 * no, we drop the edit from `pending` and the confirmed event is back. There
 * is no copy of old state to restore.
 *
 * Why it holds at scale:
 *   1. Events are loaded one week at a time and kept. Going back to a week
 *      seen before costs zero requests.
 *   2. After the visible week has arrived, the week before and the week after
 *      are loaded too. "Next" then shows its events at once.
 *   3. A load that is no longer needed is aborted, and its late answer is
 *      ignored. Moving through many weeks fast leaves only the last one alive.
 *   4. A second edit of the same event replaces the first. The answer to the
 *      first can never overwrite the second.
 */
import { useEffect, useRef, useState } from "react";
import { toIso } from "./time";
import type { CalendarEvent, CalendarServer } from "./types";

/** An edit by event id. `null` means "delete this event". */
type Edits = Map<string, CalendarEvent | null>;

function applyEdits(events: CalendarEvent[], edits: Edits): CalendarEvent[] {
  const edited = [...edits.values()].filter((event) => event !== null);
  return [...events.filter((event) => !edits.has(event.id)), ...edited];
}

/**
 * `weeks` holds the starts of four weeks in a row, as timestamps: the week
 * before the visible one, the visible week, the week after it, and the one
 * after that.
 */
export function useCalendarEvents(options: CalendarServer & { weeks: number[] }) {
  const [, weekStart, weekEnd] = options.weeks;
  const [confirmed, setConfirmed] = useState<CalendarEvent[]>([]);
  const [pending, setPending] = useState<Edits>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveFailed, setSaveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The parent passes new functions and a new array on every render. We keep
  // the latest ones in a ref, so they do not start a new load.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  /** The starts of the weeks whose events are in `confirmed`. */
  const loadedWeeks = useRef(new Set<number>());
  /** One controller for each event that is being saved or deleted. */
  const inFlight = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    const [before, start, end, after] = latest.current.weeks;

    async function loadWeek(from: number, to: number) {
      if (loadedWeeks.current.has(from)) {
        return;
      }
      const loaded = await latest.current.fetchEvents(toIso(from), toIso(to), controller.signal);
      if (!controller.signal.aborted) {
        loadedWeeks.current.add(from);
        // An event that crosses two weeks arrives twice. Its id keeps it single.
        setConfirmed((events) =>
          applyEdits(events, new Map(loaded.map((event) => [event.id, event]))),
        );
      }
    }

    setStatus(loadedWeeks.current.has(start) ? "ready" : "loading");
    loadWeek(start, end).then(
      () => {
        if (!controller.signal.aborted) {
          setStatus("ready");
          // The neighbours load only now, so they never slow the visible week.
          // A failure here is silent, and that week is asked for again later.
          loadWeek(before, start).catch(() => {});
          loadWeek(end, after).catch(() => {});
        }
      },
      // An abort is not an error: we asked for it.
      () => controller.signal.aborted || setStatus("error"),
    );
    // This runs when the week changes or the calendar is removed.
    return () => controller.abort();
  }, [weekStart, weekEnd, attempt]);

  async function send(id: string, edit: CalendarEvent | null) {
    // A newer edit of the same event replaces the one in flight.
    inFlight.current.get(id)?.abort();
    const controller = new AbortController();
    inFlight.current.set(id, controller);
    setSaveFailed(false);
    setPending((edits) => new Map(edits).set(id, edit));

    const request =
      edit === null
        ? latest.current.deleteEvent(id, controller.signal).then(() => null)
        : latest.current.saveEvent(edit, controller.signal);
    // `undefined` means the server said no.
    const saved = await request.catch(() => undefined);
    // Aborted means a newer edit of this event owns `pending` now.
    if (controller.signal.aborted) {
      return;
    }
    setSaveFailed(saved === undefined);
    if (saved !== undefined) {
      setConfirmed((events) => applyEdits(events, new Map([[id, saved]])));
    }
    // With the edit gone from `pending`, the confirmed event shows again: the
    // new one after a success, the old one after a failure.
    setPending((edits) => new Map([...edits].filter(([editId]) => editId !== id)));
  }

  return {
    /** The confirmed events with the unanswered edits of the user on top. */
    events: applyEdits(confirmed, pending),
    status,
    /** True after a save or a delete failed and was undone. The next edit clears it. */
    saveFailed,
    /** Shows the event at once, then sends it. Undone if the server says no. */
    save: (event: CalendarEvent) => void send(event.id, event),
    /** Hides the event at once, then deletes it. It comes back if the server says no. */
    remove: (id: string) => void send(id, null),
    /** Loads the visible week again. Used by the "Try again" button. */
    retry: () => setAttempt((count) => count + 1),
  };
}
