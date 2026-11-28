/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text the user reads or hears is here, so another team can translate
 * the calendar without changing its code. Pass your own with the `messages` prop.
 *
 * A text with a count has one form for each plural category of the language
 * ("one", "other", and in some languages "zero", "two", "few", "many").
 * `Intl.PluralRules` picks the form. "other" must always be there.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const defaultMessages = {
  loading: "Loading…",
  loadFailed: "Could not load the events.",
  tryAgain: "Try again",
  saveFailed: "Could not save. Your change was undone.",
  conflict:
    "Someone else changed this event first. Their version is shown, and your change was not saved.",
  /** `{count}` is replaced by the number of edits that wait. */
  waiting: {
    one: "{count} change is waiting for the connection. It is kept on this device.",
    other: "{count} changes are waiting for the connection. They are kept on this device.",
  } as PluralForms,
  sendNow: "Send now",
  eventsOn: (day: string) => `Events, ${day}`,
  allDayOn: (day: string) => `All-day events, ${day}`,
  newEvent: "New event",
  editEvent: "Edit event",
  /** What a screen reader says for an event. */
  eventLabel: (title: string, start: string, end: string, day: string) =>
    `${title}, ${start} to ${end}, ${day}`,
  allDayLabel: (title: string, day: string) => `${title}, all day, ${day}`,
  /** The visible text of the box that stands for the events that did not fit. */
  more: (count: string) => `+${count} more`,
  /** What a screen reader says for that box, before the name of the day. `{count}` is replaced by the number. */
  moreLabel: { one: "{count} more event", other: "{count} more events" } as PluralForms,
  showDay: (day: string) => `Show ${day}`,
  /** Said once when the user starts to move an event with the keyboard. */
  moveHelp:
    "Arrow keys move the event. Shift and an arrow key change its end. Enter saves. Escape cancels.",
  /** Said after every step of a move with the keyboard. */
  moving: (start: string, end: string, day: string) => `${start} to ${end}, ${day}`,
  title: "Title",
  allDay: "All day",
  start: "Start",
  end: "End",
  repeat: "Repeat",
  repeatNever: "Does not repeat",
  repeatDaily: "Every day",
  repeatWeekly: "Every week",
  repeatMonthly: "Every month",
  /** The question when the user edits one event of a series. */
  scope: "Change",
  scopeThis: "This event",
  scopeAll: "All events of the series",
  endBeforeStart: "The end must be after the start.",
  save: "Save",
  delete: "Delete",
  cancel: "Cancel",
};

export type CalendarMessages = typeof defaultMessages;

/** Picks the plural form for the count and puts the count in, written in the digits of the locale. */
export function plural(forms: PluralForms, count: number, locale?: string): string {
  const form = forms[new Intl.PluralRules(locale).select(count)] ?? forms.other;
  return form.replace("{count}", new Intl.NumberFormat(locale).format(count));
}
