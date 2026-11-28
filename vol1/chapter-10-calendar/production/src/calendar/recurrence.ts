/*
 * NOT PART OF THE INTERVIEW: production version.
 * Repeating events. The server stores one event with a rule ("every Monday").
 * This file turns the rule into the single events of the visible range, and
 * nothing more. A series with no end costs the same as a series of one week.
 *
 * The rule is applied on the wall clock of the time zone the series was made
 * in. A daily meeting at 10:00 in New York stays at 10:00 in New York when
 * the clocks change, and so moves by an hour for a colleague in India.
 *
 * This is a small model on purpose. The full standard (iCalendar RRULE) has
 * many more rules: "the last Friday of the month", "every second week", and
 * so on. For those, use a library and keep this file's shape: a pure function
 * from a series and a range to a list of events.
 */
import { fromWall, toIso, toWall } from "./time";
import type { CalendarEvent } from "./types";

const DAY_MS = 24 * 3_600_000;
/** A rule with a `count` is walked from its start. This stops a broken rule from looping. */
const MAX_STEPS = 10_000;

/**
 * The wall times of the occurrences of one step of the rule: one day, one week
 * or one month. Step 0 holds the first event. A step can hold none (a month
 * with no 31st) or several (a week with three weekdays).
 */
function wallsOfStep(event: CalendarEvent, firstWall: number, step: number): number[] {
  const rule = event.recurrence;
  if (rule === undefined) {
    return [];
  }
  if (rule.frequency === "daily") {
    return [firstWall + step * DAY_MS];
  }
  const first = new Date(firstWall);
  if (rule.frequency === "weekly") {
    const weekdays = rule.weekdays?.length ? [...rule.weekdays].sort() : [first.getUTCDay()];
    const sunday = firstWall - first.getUTCDay() * DAY_MS + step * 7 * DAY_MS;
    // In the first week, the days before the first event are not part of the series.
    return weekdays.map((weekday) => sunday + weekday * DAY_MS).filter((wall) => wall >= firstWall);
  }
  // Monthly: the same day of the month. A month without that day (the 31st) has no occurrence.
  const wall = Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth() + step,
    first.getUTCDate(),
    first.getUTCHours(),
    first.getUTCMinutes(),
  );
  return new Date(wall).getUTCDate() === first.getUTCDate() ? [wall] : [];
}

/** A step that is safely before the range, so a series from years ago does not walk every week since. */
function firstStepNear(event: CalendarEvent, firstWall: number, rangeStart: number): number {
  const rule = event.recurrence;
  // A `count` must be counted from the first occurrence.
  if (rule === undefined || rule.count !== undefined) {
    return 0;
  }
  const length = Date.parse(event.end) - Date.parse(event.start);
  const daysPerStep = { daily: 1, weekly: 7, monthly: 31 }[rule.frequency];
  // Two steps of margin cover the clock changes and the short months.
  const distance = toWall(rangeStart, rule.timeZone) - length - firstWall;
  return Math.max(0, Math.floor(distance / (daysPerStep * DAY_MS)) - 2);
}

/**
 * The events of one stored event inside the range `[rangeStart, rangeEnd)`.
 * A plain event gives itself. A series gives one event for each occurrence
 * that touches the range. Each has its own id, the `seriesId` of the series
 * and the `originalStart` the rule gave it.
 */
export function expandRecurrence(
  event: CalendarEvent,
  rangeStart: number,
  rangeEnd: number,
): CalendarEvent[] {
  const rule = event.recurrence;
  if (rule === undefined) {
    return [event];
  }
  const start = Date.parse(event.start);
  const length = Date.parse(event.end) - start;
  const firstWall = toWall(start, rule.timeZone);
  const until = rule.until === undefined ? Infinity : Date.parse(rule.until);
  const exceptions = rule.exceptions ?? {};
  const occurrences: CalendarEvent[] = [];

  const add = (originalStart: string, change: { title: string; start: string; end: string }) => {
    if (Date.parse(change.start) < rangeEnd && Date.parse(change.end) > rangeStart) {
      const id = `${event.id}@${originalStart}`;
      const { recurrence: _rule, ...rest } = event;
      occurrences.push({ ...rest, ...change, id, seriesId: event.id, originalStart });
    }
  };

  let made = 0;
  walk: for (let step = firstStepNear(event, firstWall, rangeStart); step < MAX_STEPS; step++) {
    for (const wall of wallsOfStep(event, firstWall, step)) {
      const occurrenceStart = fromWall(wall, rule.timeZone);
      if (occurrenceStart > until || made === rule.count || occurrenceStart >= rangeEnd) {
        break walk;
      }
      made++;
      const originalStart = toIso(occurrenceStart);
      // An occurrence with an exception is added below, from the exception.
      if (!(originalStart in exceptions)) {
        const end = toIso(occurrenceStart + length);
        add(originalStart, { title: event.title, start: originalStart, end });
      }
    }
  }
  // A moved occurrence can be in the range although the rule put it outside.
  for (const [originalStart, change] of Object.entries(exceptions)) {
    if (change !== null) {
      add(originalStart, change);
    }
  }
  return occurrences;
}

/** True for one occurrence of a series (made by `expandRecurrence`). */
export function isOccurrence(
  event: CalendarEvent,
): event is CalendarEvent & { seriesId: string; originalStart: string } {
  return event.seriesId !== undefined && event.originalStart !== undefined;
}

/**
 * "This event": the series with one occurrence changed, or cancelled when
 * `edited` is null. The other occurrences stay as they are.
 */
export function editOccurrence(
  series: CalendarEvent,
  originalStart: string,
  edited: Pick<CalendarEvent, "title" | "start" | "end"> | null,
): CalendarEvent {
  // Without a rule there is nothing to change. The caller only passes a series.
  if (series.recurrence === undefined) {
    return series;
  }
  const change = edited && { title: edited.title, start: edited.start, end: edited.end };
  const exceptions = { ...series.recurrence.exceptions, [originalStart]: change };
  return { ...series, recurrence: { ...series.recurrence, exceptions } };
}

/**
 * "All events": the series moved by as far as the user moved one occurrence,
 * with the new title and the new length. The move is measured on the wall
 * clock, so "one hour later" is one hour later in summer and in winter.
 * Earlier changes of single occurrences are dropped, because their keys no
 * longer match the new times.
 */
export function editSeries(
  series: CalendarEvent,
  occurrence: CalendarEvent,
  edited: Pick<CalendarEvent, "title" | "start" | "end">,
): CalendarEvent {
  if (series.recurrence === undefined) {
    return series;
  }
  const zone = series.recurrence.timeZone;
  const wall = (iso: string) => toWall(Date.parse(iso), zone);
  const start = fromWall(wall(series.start) + wall(edited.start) - wall(occurrence.start), zone);
  const length = Date.parse(edited.end) - Date.parse(edited.start);
  const { exceptions: _dropped, ...rule } = series.recurrence;
  return {
    ...series,
    title: edited.title,
    start: toIso(start),
    end: toIso(start + length),
    recurrence: rule,
  };
}

/** What to send to the server for one edit: an event to save, or an id to delete. */
export type StoredEdit = { save: CalendarEvent } | { removeId: string };

/**
 * Turns an edit of an event on screen into an edit of an event in storage.
 * A plain event is saved or deleted as it is. One event of a series is not
 * stored on its own, so its edit becomes an edit of the series:
 *   - "this": the series gets an exception for that one occurrence.
 *   - "all": the whole series moves, or is deleted.
 * `edited` is null for a delete. `stored` are the events as the server has them.
 */
export function toStoredEdit(
  stored: CalendarEvent[],
  original: CalendarEvent,
  edited: CalendarEvent | null,
  scope: "this" | "all",
): StoredEdit {
  const series = isOccurrence(original)
    ? stored.find((event) => event.id === original.seriesId)
    : undefined;
  if (series === undefined || !isOccurrence(original)) {
    return edited === null ? { removeId: original.id } : { save: edited };
  }
  if (scope === "this") {
    return { save: editOccurrence(series, original.originalStart, edited) };
  }
  return edited === null ? { removeId: series.id } : { save: editSeries(series, original, edited) };
}
