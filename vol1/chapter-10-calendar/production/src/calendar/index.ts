/* NOT PART OF THE INTERVIEW: production version. It only makes imports shorter. */
export { Calendar } from "./Calendar";
export type { CalendarProps } from "./Calendar";
export { useCalendarEvents } from "./useCalendarEvents";
export type { UseCalendarEventsOptions } from "./useCalendarEvents";
export { layoutDay, HOUR_HEIGHT, MIN_EVENT_HEIGHT } from "./layoutDay";
export { expandRecurrence } from "./recurrence";
export { defaultMessages } from "./messages";
export type { CalendarMessages, PluralForms } from "./messages";
export { fromWall, startOfDay, startOfWeek, toWall } from "./time";
export { ConflictError, OfflineError } from "./types";
export type {
  CalendarEvent,
  CalendarLogEvent,
  CalendarServer,
  CalendarView,
  PositionedEvent,
  Recurrence,
} from "./types";
