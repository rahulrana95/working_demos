/*
 * PART OF THE INTERVIEW: yes (about 9 minutes).
 * Write it after the layout function. It holds all the talk with the server,
 * so the component only draws.
 *
 * The events on screen are two layers:
 *   - `confirmed`: what the server told us.
 *   - `pending`: the edits of the user that the server has not answered yet.
 * An edit shows at once, because `pending` is drawn on top. If the server says
 * no, we drop the edit from `pending` and the confirmed event is back. There
 * is no copy of old state to restore.
 *
 * Why it holds at scale:
 *   1. A load that is no longer needed is aborted, and its late answer is
 *      ignored. Moving through many days fast leaves one request alive.
 *   2. A second edit of the same event replaces the first. The answer to the
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

/** `rangeStart` and `rangeEnd` are the visible range, as timestamps. A new range loads again. */
export function useCalendarEvents(
  options: CalendarServer & { rangeStart: number; rangeEnd: number },
) {
  const { rangeStart, rangeEnd } = options;
  const [confirmed, setConfirmed] = useState<CalendarEvent[]>([]);
  const [pending, setPending] = useState<Edits>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveFailed, setSaveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The parent may pass new functions on every render. We keep the latest
  // ones in a ref, so a new function does not start a new load.
  const server = useRef<CalendarServer>(options);
  useEffect(() => {
    server.current = options;
  });

  /** One controller for each event that is being saved or deleted. */
  const inFlight = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    server.current.fetchEvents(toIso(rangeStart), toIso(rangeEnd), controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) {
          setConfirmed(loaded);
          setStatus("ready");
        }
      },
      // An abort is not an error: we asked for it.
      () => controller.signal.aborted || setStatus("error"),
    );
    // This runs when the range changes or the calendar is removed.
    return () => controller.abort();
  }, [rangeStart, rangeEnd, attempt]);

  async function send(id: string, edit: CalendarEvent | null) {
    // A newer edit of the same event replaces the one in flight.
    inFlight.current.get(id)?.abort();
    const controller = new AbortController();
    inFlight.current.set(id, controller);
    setSaveFailed(false);
    setPending((edits) => new Map(edits).set(id, edit));

    const request =
      edit === null
        ? server.current.deleteEvent(id, controller.signal).then(() => null)
        : server.current.saveEvent(edit, controller.signal);
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
    /** Loads the range again. Used by the "Try again" button. */
    retry: () => setAttempt((count) => count + 1),
  };
}
