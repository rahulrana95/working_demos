/*
 * PART OF THE INTERVIEW: yes (about 1 minute).
 * Write these types first. They are the contract of the calendar.
 */

export interface CalendarEvent {
  id: string;
  title: string;
  /** An instant in UTC as an ISO string, for example "2026-03-03T10:00:00.000Z". */
  start: string;
  /** An instant in UTC as an ISO string. The event is over at this instant. */
  end: string;
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
 */
export interface CalendarServer {
  /**
   * Loads the events that touch the range. Both ends are ISO strings in UTC.
   * Resolve with the events. Throw if they could not be loaded.
   */
  fetchEvents(rangeStart: string, rangeEnd: string, signal: AbortSignal): Promise<CalendarEvent[]>;
  /**
   * Creates the event, or replaces the event with the same id.
   * Resolve with the event as the server stored it. Throw if it was not stored.
   */
  saveEvent(event: CalendarEvent, signal: AbortSignal): Promise<CalendarEvent>;
  /** Resolve when the event is gone. Throw if it could not be deleted. */
  deleteEvent(id: string, signal: AbortSignal): Promise<void>;
}
