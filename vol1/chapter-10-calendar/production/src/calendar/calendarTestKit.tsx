/*
 * NOT PART OF THE INTERVIEW: production version.
 * What the tests of the calendar share: how to draw it, and how to find its
 * parts the way a user does, by role and by name.
 *
 * Every test names its time zone, so the tests pass whatever the time zone of
 * the machine is. Most of them show the calendar in India.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Calendar } from "./Calendar";
import type { CalendarProps } from "./Calendar";
import { KOLKATA, at, createManualServer, kolkata, makeEvent } from "./testHelpers";
import type { ManualServer } from "./testHelpers";
import type { CalendarEvent } from "./types";

export const NEW_YORK = "America/New_York";
/** Noon in India on Tuesday 3 March 2026, and on the Wednesday after it. */
export const NOON = kolkata(3, 12);
export const NEXT_NOON = kolkata(4, 12);
/** Some versions of the language data put a comma after the weekday. */
export const DAY = "Tuesday,? 3 March 2026";

export const review = makeEvent("review", at(10), at(11), "Design review");
export const budget = makeEvent("budget", at(10, 30), at(12), "Budget call");
export const interview = makeEvent("interview", at(11), at(12), "Interview");

/** Lets every promise that is ready run, and lets React finish its updates. */
export async function settle(): Promise<void> {
  await act(async () => {
    // The queue of edits has a few steps between two requests.
    for (let turn = 0; turn < 20; turn++) {
      await Promise.resolve();
    }
    // With the real clock, also let the timers of zero milliseconds run.
    if (!vi.isFakeTimers()) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

export type Options = Partial<Omit<CalendarProps, keyof ManualServer>>;

/** The calendar in India, on the day view of Tuesday 3 March 2026, with nothing saved between tests. */
export function calendar(server: ManualServer, options: Options = {}) {
  return (
    <Calendar
      date={NOON}
      view="day"
      timeZone={KOLKATA}
      locale="en-GB"
      storageKey={null}
      {...server}
      {...options}
    />
  );
}

/** Draws the calendar and answers the first load with these events. */
export async function renderLoaded(events: CalendarEvent[] = [review], options: Options = {}) {
  const server = createManualServer();
  const view = render(calendar(server, options));
  server.loads[0].resolve(events);
  await settle();
  return { server, ...view };
}

export const eventButton = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title},`) });
export const queryEventButton = (title: string) =>
  screen.queryByRole("button", { name: new RegExp(`^${title},`) });
export const timeGrid = () => screen.getByRole("grid", { name: "New event" });
export const slots = () => within(timeGrid()).getAllByRole("button");
export const slot = (time: string) => within(timeGrid()).getByRole("button", { name: time });
/** The slot of a row and a day in the week view. Both start at 0. */
export const weekSlot = (row: number, day: number) => slots()[row * 7 + day];
export const eventList = () => screen.getByRole("list");
export const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
export const type = (name: string, value: string) =>
  fireEvent.change(field(name), { target: { value } });
/** The list item that places the box of an event. */
export const box = (title: string) => eventButton(title).parentElement as HTMLLIElement;
/** The spoken label of an event. */
export const label = (title: string) => eventButton(title).getAttribute("aria-label");
