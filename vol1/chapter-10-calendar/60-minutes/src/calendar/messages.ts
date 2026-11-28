/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Every text the user reads or hears is here, so another team can translate
 * the calendar without changing its code. Pass your own with the `messages` prop.
 */
export const defaultMessages = {
  loading: "Loading…",
  loadFailed: "Could not load the events.",
  tryAgain: "Try again",
  saveFailed: "Could not save. Your change was undone.",
  eventsOn: (day: string) => `Events, ${day}`,
  newEvent: "New event",
  editEvent: "Edit event",
  /** What a screen reader says for an event. */
  eventLabel: (title: string, start: string, end: string, day: string) =>
    `${title}, ${start} to ${end}, ${day}`,
  title: "Title",
  start: "Start",
  end: "End",
  endBeforeStart: "The end must be after the start.",
  save: "Save",
  delete: "Delete",
  cancel: "Cancel",
};

export type CalendarMessages = typeof defaultMessages;
