/*
 * PART OF THE INTERVIEW: yes (about 10 minutes).
 * This function is the heart of the answer. Write it, and its tests, before
 * any component. It has no React in it.
 *
 * It gives every event of one day a place: how far down, how tall, and which
 * column. Events that overlap sit side by side.
 *
 *   1. Sort by start. Of two events that start together, the longer is first.
 *   2. Walk down the day and group the events into clusters. A cluster is a
 *      run of events that overlap, directly or through a chain: A overlaps B
 *      and B overlaps C puts A, B and C in one cluster, even when A and C do
 *      not touch.
 *   3. Inside a cluster, put each event in the first column that is free
 *      again. All events of the cluster share the width equally.
 *
 * Why it holds at scale:
 *   1. One sort and one walk. For each event we only look at the columns, not
 *      at the other events.
 *   2. All comparing is done on whole milliseconds. Pixels are worked out at
 *      the end, so rounding can never turn "ends at 11:00, starts at 11:00"
 *      into an overlap.
 */
import type { CalendarEvent, PositionedEvent } from "./types";

export const HOUR_MS = 3_600_000;
/** The height of one hour. A slot of one hour is then taller than 44px, for a finger. */
export const HOUR_HEIGHT = 48;
/** A very short event is still drawn this tall, so it can be read and hit. */
export const MIN_EVENT_HEIGHT = 24;

export function layoutDay(events: CalendarEvent[], dayStart: number, dayEnd: number) {
  const msPerPixel = HOUR_MS / HOUR_HEIGHT;
  const minDuration = MIN_EVENT_HEIGHT * msPerPixel;

  const spans: { event: CalendarEvent; start: number; end: number }[] = [];
  for (const event of events) {
    const eventStart = Date.parse(event.start);
    const eventEnd = Date.parse(event.end);
    // A bad date makes every comparison false, so that event is left out too.
    const isInDay = eventStart < dayEnd && (eventEnd > dayStart || eventStart >= dayStart);
    if (!isInDay || !(eventEnd >= eventStart)) {
      continue;
    }
    // Clip to the day. Then make a short event as long as the smallest box,
    // so the overlap test below sees what the user sees.
    const clippedStart = Math.max(eventStart, dayStart);
    const end = Math.min(Math.max(eventEnd, clippedStart + minDuration), dayEnd);
    spans.push({ event, start: Math.min(clippedStart, end - minDuration), end });
  }
  // The id makes the order the same on every call, whatever order the events arrive in.
  spans.sort((a, b) => a.start - b.start || b.end - a.end || (a.event.id < b.event.id ? -1 : 1));

  /** For each column of the open cluster, when its last event ends. One array per cluster. */
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;
  const placed = spans.map((span) => {
    if (span.start >= clusterEnd) {
      // Nothing before reaches this event: a new cluster starts here.
      columnEnds = [];
    }
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= span.start);
    if (column === -1) {
      column = columnEnds.length;
    }
    columnEnds[column] = span.end;
    clusterEnd = Math.max(clusterEnd, span.end);
    const top = (span.start - dayStart) / msPerPixel;
    const height = (span.end - span.start) / msPerPixel;
    return { event: span.event, top, height, column, columnEnds };
  });

  // Only now is the number of columns of each cluster known.
  return placed.map(
    ({ columnEnds, ...box }): PositionedEvent => ({ ...box, columnCount: columnEnds.length }),
  );
}
