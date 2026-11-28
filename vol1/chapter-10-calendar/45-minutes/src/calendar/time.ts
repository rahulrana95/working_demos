/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Write it after the layout function. Every date in the calendar is a
 * timestamp: milliseconds since 1970 in UTC. Only this file turns a timestamp
 * into words, and only at the moment we show it.
 *
 * This folder shows times in the time zone of the browser, and treats every
 * day as 24 hours. A day on which the clocks change is 23 or 25 hours long.
 * That case is handled in ../60-minutes, not here.
 */
import type { CalendarEvent } from "./types";

/**
 * The first instant of the day that holds `timestamp`, in the time zone of the
 * browser. With `plusDays`, the first instant of a day that many days later.
 */
export function startOfDay(timestamp: number, plusDays = 0): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + plusDays).getTime();
}

/** How we store an instant: an ISO string in UTC. */
export const toIso = (timestamp: number) => new Date(timestamp).toISOString();

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** The value an `<input type="datetime-local">` needs: "2026-03-03T10:00", in local time. */
export function toInputValue(iso: string): string {
  const date = new Date(iso);
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Reads the value of an `<input type="datetime-local">`. An empty input gives NaN. */
export function fromInputValue(value: FormDataEntryValue | null): number {
  // A date and time with no zone at its end is read as local time.
  return new Date(String(value)).getTime();
}

/**
 * The three ways the calendar turns a timestamp into words:
 *   - time: "10:00" or "10:00 am". The locale decides between a 12 and a 24 hour clock.
 *   - day: "Tuesday 3 March 2026".
 *   - label: what a screen reader says for an event,
 *     "Design review, 10:00 to 11:00, Tuesday 3 March 2026".
 */
export function createFormatters(locale?: string) {
  const timeFormat = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const time = (timestamp: number) => timeFormat.format(timestamp);
  const day = (timestamp: number) => dayFormat.format(timestamp);

  return {
    time,
    day,
    label: (event: CalendarEvent) => {
      const start = Date.parse(event.start);
      return `${event.title}, ${time(start)} to ${time(Date.parse(event.end))}, ${day(start)}`;
    },
  };
}
