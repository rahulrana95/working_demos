/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every date in the calendar is a timestamp: milliseconds since 1970 in UTC.
 * Only this file knows about time zones, and it asks the browser (`Intl`)
 * for every answer.
 *
 * The trick of the file is the "wall time": what a clock on the wall of a
 * time zone shows, written as if it were a UTC timestamp. 10:00 in New York
 * on 3 March becomes the number for "2026-03-03T10:00Z". UTC has no clock
 * changes, so on a wall time we can do plain arithmetic: the start of the day
 * is a division, and the same time on the next date is 24 hours more. Then
 * `fromWall` turns the wall time back into a real instant.
 *
 * A real day is not always 24 hours. On the day the clocks go forward it is
 * 23 hours long, and on the day they go back it is 25. We never add 24 hours
 * to an instant. We add them to a wall time.
 *
 * Why it holds at scale: making a formatter is slow, so there is one for each
 * time zone, kept in a map. One call after that takes a few microseconds.
 */
import type { CalendarEvent } from "./types";

const DAY_MS = 24 * 3_600_000;
const wallClocks = new Map<string, Intl.DateTimeFormat>();

/** What a clock on the wall of the zone shows at this instant, written as a UTC timestamp. */
export function toWall(timestamp: number, timeZone: string): number {
  let wallClock = wallClocks.get(timeZone);
  if (wallClock === undefined) {
    const date = { year: "numeric", month: "numeric", day: "numeric" } as const;
    // "h23" counts the hours of a day from 0 to 23, never 24.
    const time = { hour: "numeric", minute: "numeric", hourCycle: "h23" } as const;
    wallClock = new Intl.DateTimeFormat("en-US", { timeZone, ...date, ...time });
    wallClocks.set(timeZone, wallClock);
  }
  const numbers = wallClock.formatToParts(timestamp).map((part) => [part.type, Number(part.value)]);
  const parts: Record<string, number> = Object.fromEntries(numbers);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

/** The instant at which the wall clock of the zone shows `wall`. The opposite of `toWall`. */
export function fromWall(wall: number, timeZone: string): number {
  // The zone's distance from UTC one day before and one day after. The two
  // differ only when the clocks change in between.
  const [first, last] = [wall - DAY_MS, wall + DAY_MS]
    .map((near) => wall - (toWall(near, timeZone) - near))
    .sort((a, b) => a - b);
  // Clocks back: the wall time happens twice, and we take the first.
  // Clocks forward: the wall time is skipped, and we move it on by the size of
  // the jump. 02:30 becomes 03:30, and a skipped midnight becomes 01:00.
  return toWall(first, timeZone) === wall ? first : last;
}

/** The first instant of the date that holds `timestamp` in the zone, or of a date `plusDays` later. */
export function startOfDay(timestamp: number, timeZone: string, plusDays = 0): number {
  const wallDay = Math.floor(toWall(timestamp, timeZone) / DAY_MS) + plusDays;
  return fromWall(wallDay * DAY_MS, timeZone);
}

/**
 * The date that holds `timestamp` in the zone, written as midnight UTC of that
 * date. All-day events are stored this way, so the two can be compared.
 */
export function dateOf(timestamp: number, timeZone: string): number {
  return Math.floor(toWall(timestamp, timeZone) / DAY_MS) * DAY_MS;
}

/** The first instant of the week that holds `timestamp`. `firstDay` is 1 (Monday) to 7 (Sunday). */
export function startOfWeek(timestamp: number, timeZone: string, firstDay: number): number {
  const weekday = new Date(toWall(timestamp, timeZone)).getUTCDay();
  return startOfDay(timestamp, timeZone, -((weekday - firstDay + 7) % 7));
}

/** The day a week starts on in this locale: 1 (Monday) to 7 (Sunday). */
export function firstDayOfWeek(locale: string = navigator.language): number {
  type WeekInfo = { firstDay?: number };
  // Newer browsers have the method, older ones the property, and some have neither.
  const info = new Intl.Locale(locale) as { getWeekInfo?(): WeekInfo; weekInfo?: WeekInfo };
  return (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
}

/** How we store an instant: an ISO string in UTC. */
export const toIso = (timestamp: number) => new Date(timestamp).toISOString();

/** The value an `<input type="datetime-local">` needs: "2026-03-03T10:00", on the wall clock of the zone. */
export function toInputValue(iso: string, timeZone: string): string {
  // A wall time printed as UTC is that text already. We only cut off the seconds.
  return toIso(toWall(Date.parse(iso), timeZone)).slice(0, 16);
}

/** Reads the value of an `<input type="datetime-local">`. An empty input gives NaN. */
export function fromInputValue(value: FormDataEntryValue | null, timeZone: string): number {
  // The text has no zone, so "Z" makes it a wall time.
  return value ? fromWall(Date.parse(`${value}Z`), timeZone) : NaN;
}

/**
 * The ways the calendar turns a timestamp into words:
 *   - time: "10:00" or "10:00 am". The locale decides between a 12 and a 24 hour clock.
 *   - day: "Tuesday 3 March 2026".
 *   - weekday: "Tue 3", for the top of a column of the week.
 *   - weekdayName: "Tue", for the top of a column of the month.
 *   - dayNumber: "3", for a day of the month view.
 *   - month: "March 2026".
 *   - labelParts: the title, start, end and day of an event, in the order
 *     that `messages.eventLabel` takes them.
 */
export function createFormatters(locale: string | undefined, timeZone: string) {
  const formatter = (options: Intl.DateTimeFormatOptions) => {
    const format = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    return (timestamp: number) => format.format(timestamp);
  };
  const time = formatter({ timeStyle: "short" });
  const day = formatter({ dateStyle: "full" });
  const labelParts = (event: CalendarEvent) => {
    const start = Date.parse(event.start);
    return [event.title, time(start), time(Date.parse(event.end)), day(start)] as const;
  };
  return {
    time,
    day,
    weekday: formatter({ weekday: "short", day: "numeric" }),
    weekdayName: formatter({ weekday: "short" }),
    dayNumber: formatter({ day: "numeric" }),
    month: formatter({ month: "long", year: "numeric" }),
    labelParts,
  };
}
