/*
 * NOT PART OF THE INTERVIEW: production version.
 * What a drag does to an event, as a plain function. The mouse, the finger
 * and the keyboard all call it, so they can never disagree.
 */
import { fromWall, toIso, toWall } from "./time";
import type { CalendarEvent } from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Times snap to a quarter of an hour. */
export const SNAP_MINUTES = 15;

/** "move" keeps the length. "resize" moves only the end. */
export type DragMode = "move" | "resize";

/**
 * The event after it was dragged by `minutes` down and `days` to the side.
 *
 * Minutes are real minutes, like the rows of the grid. Days are dates: the
 * event keeps its time on the wall clock of the zone, also across a clock
 * change. The result snaps to a quarter of an hour, and an event is never
 * made shorter than one quarter.
 */
export function dragEvent(
  event: CalendarEvent,
  mode: DragMode,
  minutes: number,
  days: number,
  timeZone: string,
): CalendarEvent {
  const snap = SNAP_MINUTES * MINUTE_MS;
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  /** The same wall time, `days` dates later, moved by the minutes and snapped. */
  const shift = (instant: number) => {
    const sameWallTime = fromWall(toWall(instant, timeZone) + days * DAY_MS, timeZone);
    return Math.round((sameWallTime + minutes * MINUTE_MS) / snap) * snap;
  };

  if (mode === "resize") {
    return { ...event, end: toIso(Math.max(shift(end), start + snap)) };
  }
  const newStart = shift(start);
  return { ...event, start: toIso(newStart), end: toIso(newStart + (end - start)) };
}
