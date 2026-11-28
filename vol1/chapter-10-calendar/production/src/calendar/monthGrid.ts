/*
 * NOT PART OF THE INTERVIEW: production version.
 * The month view, as plain functions: which days it shows, and which events
 * belong to a day. The component only draws the answer.
 */
import { dateOf, startOfDay, startOfWeek, toWall } from "./time";
import type { CalendarEvent } from "./types";

export interface MonthDay {
  /** The first instant of the day, and of the day after it. */
  start: number;
  end: number;
  /** False for the days of the month before and the month after that fill the first and last week. */
  isInMonth: boolean;
}

/**
 * The days of the month view of the month that holds `timestamp`: always six
 * full weeks, 42 days, so the grid has the same height in every month.
 * `firstDay` is the first day of the week: 1 (Monday) to 7 (Sunday).
 */
export function monthDays(timestamp: number, timeZone: string, firstDay: number): MonthDay[] {
  const wall = new Date(toWall(timestamp, timeZone));
  const month = wall.getUTCMonth();
  const firstOfMonth = startOfDay(timestamp, timeZone, 1 - wall.getUTCDate());
  const gridStart = startOfWeek(firstOfMonth, timeZone, firstDay);

  return Array.from({ length: 42 }, (_, index) => {
    const start = startOfDay(gridStart, timeZone, index);
    const isInMonth = new Date(toWall(start, timeZone)).getUTCMonth() === month;
    return { start, end: startOfDay(gridStart, timeZone, index + 1), isInMonth };
  });
}

/**
 * The events of one day, for a short list: all-day events first, then by
 * start. `events` are single events (a series is expanded before).
 */
export function eventsOfDay(
  events: CalendarEvent[],
  day: { start: number; end: number },
  timeZone: string,
): CalendarEvent[] {
  const date = dateOf(day.start, timeZone);
  return events
    .filter((event) => {
      const [start, end] = [Date.parse(event.start), Date.parse(event.end)];
      // An all-day event is compared by date. A timed one by instant.
      return event.allDay
        ? start <= date && date < end
        : start < day.end && (end > day.start || start >= day.start);
    })
    .sort(
      (a, b) =>
        Number(b.allDay ?? false) - Number(a.allDay ?? false) ||
        Date.parse(a.start) - Date.parse(b.start) ||
        (a.id < b.id ? -1 : 1),
    );
}
