/*
 * NOT PART OF THE INTERVIEW: production version.
 * The contract of the calendar: the event, the three server functions, the
 * two errors the server functions may throw, and the events for monitoring.
 */

/** How an event repeats. A small model, not the full iCalendar standard. */
export interface Recurrence {
  /** "weekly" repeats on `weekdays`. "monthly" repeats on the day of the month of the first event. */
  frequency: "daily" | "weekly" | "monthly";
  /** For "weekly": 0 (Sunday) to 6 (Saturday). Left out, it is the weekday of the first event. */
  weekdays?: number[];
  /** No occurrence starts after this instant (ISO string in UTC). */
  until?: string;
  /** The series has this many occurrences, cancelled ones included. */
  count?: number;
  /**
   * The IANA time zone the series was made in. "Every day at 10:00" means
   * 10:00 on the wall clock there, in summer and in winter. Without it, the
   * meeting would move by an hour for everyone when the clocks change.
   */
  timeZone: string;
  /**
   * Single occurrences that differ from the rule. The key is the instant the
   * rule gives the occurrence (ISO string in UTC). `null` means cancelled.
   */
  exceptions?: Record<string, { title: string; start: string; end: string } | null>;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** An instant in UTC as an ISO string, for example "2026-03-03T10:00:00.000Z". */
  start: string;
  /** An instant in UTC as an ISO string. The event is over at this instant. */
  end: string;
  /**
   * An all-day event is a date, not an instant: `start` is midnight UTC of its
   * first date and `end` is midnight UTC of the date after its last. It shows
   * on the same dates in every time zone.
   */
  allDay?: boolean;
  /** Any CSS colour. It only decorates the event box. */
  color?: string;
  recurrence?: Recurrence;
  /**
   * Set by the server on every save. We send it back with the next save, and
   * the server refuses the save if its own value is newer (see ConflictError).
   */
  updatedAt?: string;
  /** Only on one occurrence of a series, made by `expandRecurrence`: the id of the series. */
  seriesId?: string;
  /** Only on one occurrence of a series: the instant the rule gives it. */
  originalStart?: string;
}

/** One event box in a day. `top` and `height` are pixels from the top of the day. */
export interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  /** 0 is the first column from the start side. */
  column: number;
  /** How many columns share the width. The box is 1 / columnCount wide. */
  columnCount: number;
}

/**
 * The three functions the calendar needs from the page that uses it.
 * Each gets an AbortSignal. When it is aborted, the answer is no longer needed.
 *
 * The calendar cannot see HTTP status codes, because these functions hide the
 * network. So the contract is: resolve on success, throw on failure, and
 * throw one of the two special errors below when the failure is one of those.
 */
export interface CalendarServer {
  /**
   * Loads the events that touch the range. Both ends are ISO strings in UTC.
   * A series is sent once, as one event with a `recurrence`, not as many events.
   * Resolve with the events. Throw if they could not be loaded.
   */
  fetchEvents(rangeStart: string, rangeEnd: string, signal: AbortSignal): Promise<CalendarEvent[]>;
  /**
   * Creates the event, or replaces the event with the same id.
   * Resolve with the event as the server stored it, with its new `updatedAt`.
   * Throw ConflictError if someone else changed the event first.
   * Throw OfflineError if the request did not reach the server.
   * Throw anything else if the server refused the save.
   */
  saveEvent(event: CalendarEvent, signal: AbortSignal): Promise<CalendarEvent>;
  /** Resolve when the event is gone. Throws the same errors as `saveEvent`. */
  deleteEvent(id: string, signal: AbortSignal): Promise<void>;
}

/**
 * Throw this from `saveEvent` or `deleteEvent` when the event on the server
 * is newer than the one the user edited. The server's version wins.
 */
export class ConflictError extends Error {
  /** The event as the server has it now. `null` if it was deleted there. */
  readonly current: CalendarEvent | null;

  constructor(current: CalendarEvent | null) {
    super("The event was changed by someone else.");
    this.name = "ConflictError";
    this.current = current;
  }
}

/**
 * Throw this from `saveEvent` or `deleteEvent` when the request did not reach
 * the server. The calendar keeps the edit and sends it again later.
 */
export class OfflineError extends Error {
  constructor() {
    super("The request did not reach the server.");
    this.name = "OfflineError";
  }
}

export type CalendarView = "day" | "week" | "month";

/**
 * What `onEvent` receives, for monitoring. An event never holds a title, an
 * id, a date or anything else of the user's data: only what happened and how
 * long it took.
 */
export type CalendarLogEvent =
  /** The view or the visible range changed. `durationMs` runs until its events were on screen. */
  | { type: "view_changed"; view: CalendarView; durationMs: number }
  /** A request for events was answered. */
  | { type: "events_loaded"; weekCount: number; eventCount: number; durationMs: number }
  /** The server stored a new event. `durationMs` runs from the user's action to the answer. */
  | { type: "event_created"; durationMs: number }
  /** The server stored a changed event. */
  | { type: "event_moved"; by: "drag" | "keyboard" | "form"; durationMs: number }
  | { type: "event_deleted"; durationMs: number }
  /** An edit is waiting because the server could not be reached. */
  | { type: "save_queued"; queueLength: number }
  /** An edit was undone. "conflict": someone else changed the event first. */
  | { type: "save_failed"; reason: "server" | "conflict"; durationMs: number };
