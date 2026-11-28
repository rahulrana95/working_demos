/*
 * NOT PART OF THE INTERVIEW: production version.
 * The cases of what this folder adds to ../60-minutes: dragging, the move
 * with the keyboard, all-day events, series, the month view, the bounded
 * page, the line for the present time, conflicts, the offline queue and
 * monitoring.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  NOON,
  box,
  calendar,
  eventButton,
  field,
  label,
  queryEventButton,
  renderLoaded,
  review,
  settle,
  slot,
  timeGrid,
  type,
  weekSlot,
} from "./calendarTestKit";
import { HOUR_HEIGHT } from "./layoutDay";
import { MONTH_EVENTS_PER_DAY } from "./MonthView";
import { at, createManualServer, kolkata, makeEvent } from "./testHelpers";
import { ConflictError, OfflineError } from "./types";
import type { CalendarEvent, CalendarLogEvent } from "./types";

const week = { view: "week" } as const;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

/** Presses the pointer on an element. The drag then goes on with `dragTo` and `drop`. */
function press(element: Element, x = 100, y = 100, button = 0) {
  fireEvent.pointerDown(element, { button, clientX: x, clientY: y });
}
const dragTo = (x: number, y: number) => fireEvent.pointerMove(window, { clientX: x, clientY: y });
const drop = () => fireEvent.pointerUp(window);
const resizeHandle = (title: string) =>
  eventButton(title).querySelector("[data-resize]") as Element;
const key = (title: string, name: string, extra = {}) =>
  fireEvent.keyDown(eventButton(title), { key: name, ...extra });
const status = () =>
  screen.getAllByRole("status").find((element) => element.className === "visually-hidden");

describe("Calendar: dragging an event", () => {
  it("moves the box while the pointer moves, before anything is saved", async () => {
    const { server } = await renderLoaded([review]);

    press(eventButton("Design review"));
    // 72 pixels down is one and a half hours.
    dragTo(100, 172);

    expect(label("Design review")).toMatch(/^Design review, 11:30 to 12:30,/);
    expect(box("Design review").style.top).toBe(`${11.5 * HOUR_HEIGHT}px`);
    expect(eventButton("Design review")).toHaveClass("is-moving");
    expect(server.saves).toHaveLength(0);
  });

  it("saves the new time once, on the drop", async () => {
    const { server } = await renderLoaded([review]);

    press(eventButton("Design review"));
    dragTo(100, 130);
    dragTo(100, 172);
    drop();
    await settle();

    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].args).toMatchObject({
      id: "review",
      start: at(11, 30),
      end: at(12, 30),
    });
    expect(eventButton("Design review")).not.toHaveClass("is-moving");
  });

  it("snaps to a quarter of an hour", async () => {
    const { server } = await renderLoaded([review]);

    press(eventButton("Design review"));
    // 20 pixels is 25 minutes. The nearest quarter is 30.
    dragTo(100, 120);
    drop();
    await settle();

    expect(server.saves[0].args).toMatchObject({ start: at(10, 30), end: at(11, 30) });
  });

  it("makes the other events make room while the box moves over them", async () => {
    const lunch = makeEvent("lunch", at(12), at(13), "Lunch");
    await renderLoaded([review, lunch]);
    expect(box("Lunch").style.width).toBe("100%");

    press(eventButton("Design review"));
    dragTo(100, 100 + 2 * HOUR_HEIGHT);

    expect(box("Lunch").style.width).toBe("50%");
    expect(box("Design review").style.width).toBe("50%");
  });

  it("treats a press with no movement as a click, which opens the form", async () => {
    const { server } = await renderLoaded([review]);

    press(eventButton("Design review"));
    dragTo(101, 102);
    drop();
    fireEvent.click(eventButton("Design review"));

    expect(screen.getByRole("form", { name: "Edit event" })).toBeInTheDocument();
    expect(server.saves).toHaveLength(0);
  });

  it("does not open the form for the click that the browser sends after a drop", async () => {
    await renderLoaded([review]);

    press(eventButton("Design review"));
    dragTo(100, 172);
    drop();
    fireEvent.click(eventButton("Design review"));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    // The click after that is a real one.
    fireEvent.click(eventButton("Design review"));
    expect(screen.getByRole("form")).toBeInTheDocument();
  });

  it("saves nothing when the box is dropped where it started", async () => {
    const { server } = await renderLoaded([review]);

    press(eventButton("Design review"));
    dragTo(100, 172);
    dragTo(100, 103);
    drop();
    await settle();

    expect(server.saves).toHaveLength(0);
  });

  it("puts the box back when Escape is pressed during the drag", async () => {
    const { server } = await renderLoaded([review]);

    press(eventButton("Design review"));
    dragTo(100, 172);
    fireEvent.keyDown(window, { key: "Escape" });
    drop();
    await settle();

    expect(label("Design review")).toMatch(/10:00 to 11:00/);
    expect(server.saves).toHaveLength(0);
  });

  it("puts the box back when the browser cancels the pointer", async () => {
    const { server } = await renderLoaded([review]);

    press(eventButton("Design review"));
    dragTo(100, 172);
    fireEvent.pointerCancel(window);
    await settle();

    expect(label("Design review")).toMatch(/10:00 to 11:00/);
    expect(server.saves).toHaveLength(0);
  });

  it("ignores the right button of the mouse", async () => {
    await renderLoaded([review]);

    press(eventButton("Design review"), 100, 100, 2);
    dragTo(100, 172);

    expect(label("Design review")).toMatch(/10:00 to 11:00/);
  });

  it("puts the box back and says so when the server refuses the move", async () => {
    const { server } = await renderLoaded([review]);
    press(eventButton("Design review"));
    dragTo(100, 172);
    drop();
    await settle();
    expect(label("Design review")).toMatch(/11:30 to 12:30/);

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(label("Design review")).toMatch(/10:00 to 11:00/);
    expect(box("Design review").style.top).toBe(`${10 * HOUR_HEIGHT}px`);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Your change was undone.");
  });

  it("leaves no handlers on the window after the drop", async () => {
    const { server } = await renderLoaded([review]);
    press(eventButton("Design review"));
    dragTo(100, 172);
    drop();
    await settle();

    dragTo(100, 400);
    drop();
    await settle();

    expect(server.saves).toHaveLength(1);
    expect(label("Design review")).toMatch(/11:30 to 12:30/);
  });

  it("leaves no handlers on the window when the calendar is removed during a drag", async () => {
    const { unmount } = await renderLoaded([review]);
    press(eventButton("Design review"));
    dragTo(100, 172);

    unmount();

    expect(() => {
      dragTo(100, 300);
      drop();
    }).not.toThrow();
  });
});

describe("Calendar: dragging the lower edge", () => {
  it("changes only the end", async () => {
    const { server } = await renderLoaded([review]);

    press(resizeHandle("Design review"));
    dragTo(100, 100 + HOUR_HEIGHT / 2);
    expect(label("Design review")).toMatch(/10:00 to 11:30/);
    expect(box("Design review").style.top).toBe(`${10 * HOUR_HEIGHT}px`);
    drop();
    await settle();

    expect(server.saves[0].args).toMatchObject({ start: at(10), end: at(11, 30) });
  });

  it("never makes the event shorter than a quarter of an hour", async () => {
    await renderLoaded([review]);

    press(resizeHandle("Design review"));
    dragTo(100, 100 - 5 * HOUR_HEIGHT);

    expect(label("Design review")).toMatch(/10:00 to 10:15/);
  });

  it("hides the handle from screen readers", async () => {
    await renderLoaded([review]);

    expect(resizeHandle("Design review")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Calendar: dragging to another day", () => {
  /** jsdom has no layout. This makes the seven day columns 100 pixels wide each. */
  function giveTheWeekAWidth() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 700,
    } as DOMRect);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves the event by as many days as the pointer crossed columns", async () => {
    giveTheWeekAWidth();
    const { server } = await renderLoaded([review], week);

    press(eventButton("Design review"), 150, 100);
    // Two columns to the right, and half an hour down.
    dragTo(360, 124);
    expect(label("Design review")).toMatch(/^Design review, 10:30 to 11:30, Thursday,? 5 March/);
    expect(screen.getAllByRole("list")[3]).toContainElement(eventButton("Design review"));
    drop();
    await settle();

    expect(server.saves[0].args).toMatchObject({ start: at(10, 30, 5), end: at(11, 30, 5) });
  });

  it("keeps the drag alive when the box is drawn again in another list", async () => {
    giveTheWeekAWidth();
    const { server } = await renderLoaded([review], week);

    press(eventButton("Design review"), 150, 100);
    dragTo(250, 100);
    dragTo(350, 100);
    dragTo(50, 100);
    expect(label("Design review")).toMatch(/Monday,? 2 March/);
    drop();
    await settle();

    expect(server.saves[0].args).toMatchObject({ start: at(10, 0, 2) });
  });

  it("goes the other way in a right-to-left page", async () => {
    giveTheWeekAWidth();
    const { container } = await renderLoaded([review], week);
    (container.firstElementChild as HTMLElement).style.direction = "rtl";

    press(eventButton("Design review"), 150, 100);
    dragTo(250, 100);

    expect(label("Design review")).toMatch(/Monday,? 2 March/);
  });

  it("does not change the day when the lower edge is dragged sideways", async () => {
    giveTheWeekAWidth();
    await renderLoaded([review], week);

    press(resizeHandle("Design review"), 150, 100);
    dragTo(360, 100 + HOUR_HEIGHT);

    expect(label("Design review")).toMatch(/10:00 to 12:00, Tuesday,? 3 March/);
  });
});

describe("Calendar: moving an event with the keyboard", () => {
  it("names the key on the event", async () => {
    await renderLoaded([review]);

    expect(eventButton("Design review")).toHaveAttribute("aria-keyshortcuts", "M");
  });

  it("starts a move on M and says how it works", async () => {
    await renderLoaded([review]);
    expect(status()).toHaveTextContent("");

    key("Design review", "m");

    expect(status()).toHaveTextContent(/^10:00 to 11:00, Tuesday,? 3 March 2026\. Arrow keys move/);
    expect(eventButton("Design review")).toHaveClass("is-moving");
  });

  it("moves by a quarter of an hour with ArrowDown and ArrowUp, and says the new time", async () => {
    const { server } = await renderLoaded([review]);
    key("Design review", "M");

    key("Design review", "ArrowDown");
    key("Design review", "ArrowDown");
    key("Design review", "ArrowDown");
    key("Design review", "ArrowUp");

    expect(label("Design review")).toMatch(/10:30 to 11:30/);
    expect(status()).toHaveTextContent(/^10:30 to 11:30,/);
    expect(server.saves).toHaveLength(0);
  });

  it("changes only the end with Shift and ArrowDown or ArrowUp", async () => {
    await renderLoaded([review]);
    key("Design review", "m");

    key("Design review", "ArrowDown", { shiftKey: true });
    key("Design review", "ArrowDown", { shiftKey: true });
    expect(label("Design review")).toMatch(/10:00 to 11:30/);

    key("Design review", "ArrowUp", { shiftKey: true });
    expect(label("Design review")).toMatch(/10:00 to 11:15/);
  });

  it("saves once on Enter, and Enter does not open the form", async () => {
    const { server } = await renderLoaded([review]);
    key("Design review", "m");
    key("Design review", "ArrowDown");

    const notPrevented = key("Design review", "Enter");
    await settle();

    // The browser would click the button on Enter. We stopped that.
    expect(notPrevented).toBe(false);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].args).toMatchObject({ start: at(10, 15), end: at(11, 15) });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(status()).toHaveTextContent("");
  });

  it("saves nothing on Enter when the event did not move", async () => {
    const { server } = await renderLoaded([review]);

    key("Design review", "m");
    key("Design review", "Enter");
    await settle();

    expect(server.saves).toHaveLength(0);
  });

  it("puts the event back on Escape", async () => {
    const { server } = await renderLoaded([review]);
    key("Design review", "m");
    key("Design review", "ArrowDown");

    key("Design review", "Escape");
    await settle();

    expect(label("Design review")).toMatch(/10:00 to 11:00/);
    expect(server.saves).toHaveLength(0);
    expect(eventButton("Design review")).not.toHaveClass("is-moving");
  });

  it("moves to the next day with ArrowRight and keeps the focus on the event", async () => {
    const { server } = await renderLoaded([review], week);
    act(() => eventButton("Design review").focus());
    key("Design review", "m");

    key("Design review", "ArrowRight");

    expect(label("Design review")).toMatch(/Wednesday,? 4 March/);
    expect(screen.getAllByRole("list")[2]).toContainElement(eventButton("Design review"));
    expect(eventButton("Design review")).toHaveFocus();

    key("Design review", "ArrowLeft");
    key("Design review", "ArrowLeft");
    key("Design review", "Enter");
    await settle();
    expect(server.saves[0].args).toMatchObject({ start: at(10, 0, 2), end: at(11, 0, 2) });
  });

  it("does not move the focus to another event while it moves this one", async () => {
    const lunch = makeEvent("lunch", at(12), at(13), "Lunch");
    await renderLoaded([review, lunch]);
    act(() => eventButton("Design review").focus());
    key("Design review", "m");

    key("Design review", "ArrowDown");

    expect(eventButton("Design review")).toHaveFocus();
  });

  it("moves the focus between events as usual when no move is going on", async () => {
    const lunch = makeEvent("lunch", at(12), at(13), "Lunch");
    await renderLoaded([review, lunch]);
    act(() => eventButton("Design review").focus());

    key("Design review", "ArrowDown");

    expect(eventButton("Lunch")).toHaveFocus();
  });

  it("cancels the move when the focus leaves the event", async () => {
    const lunch = makeEvent("lunch", at(12), at(13), "Lunch");
    const { server } = await renderLoaded([review, lunch]);
    key("Design review", "m");
    key("Design review", "ArrowDown");

    fireEvent.blur(eventButton("Design review"), { relatedTarget: eventButton("Lunch") });
    await settle();

    expect(label("Design review")).toMatch(/10:00 to 11:00/);
    expect(server.saves).toHaveLength(0);
  });

  it("leaves Ctrl+M and Cmd+M to the browser", async () => {
    await renderLoaded([review]);

    const notPrevented = key("Design review", "m", { ctrlKey: true });
    key("Design review", "m", { metaKey: true });

    expect(notPrevented).toBe(true);
    expect(eventButton("Design review")).not.toHaveClass("is-moving");
  });

  it("puts the event back and says so when the server refuses the move", async () => {
    const { server } = await renderLoaded([review]);
    key("Design review", "m");
    key("Design review", "ArrowDown");
    key("Design review", "Enter");
    await settle();

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(label("Design review")).toMatch(/10:00 to 11:00/);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("Calendar: all-day events", () => {
  /** An all-day event is stored as dates in UTC. Its end is the date after its last date. */
  const allDay = (id: string, first: string, afterLast: string, title = id): CalendarEvent => ({
    id,
    title,
    start: `${first}T00:00:00.000Z`,
    end: `${afterLast}T00:00:00.000Z`,
    allDay: true,
  });
  const holiday = allDay("holiday", "2026-03-03", "2026-03-04", "Holiday");
  const allDayList = () => screen.getByRole("list", { name: /^All-day events,/ });

  it("shows an all-day event in its own row, not among the hours", async () => {
    await renderLoaded([holiday, review]);

    expect(within(allDayList()).getByRole("button")).toHaveAccessibleName(
      /^Holiday, all day, Tuesday,? 3 March 2026$/,
    );
    const hours = screen.getByRole("list", { name: /^Events,/ });
    expect(within(hours).getAllByRole("button")).toHaveLength(1);
  });

  it("draws no row for all-day events when there are none", async () => {
    await renderLoaded([review]);

    expect(screen.queryByRole("list", { name: /^All-day events,/ })).not.toBeInTheDocument();
  });

  it("shows an event of several days on each of its days", async () => {
    await renderLoaded([allDay("conf", "2026-03-04", "2026-03-07", "Conference")], week);
    const perDay = screen
      .getAllByRole("list", { name: /^All-day events,/ })
      .map((list) => within(list).queryAllByRole("button").length);

    // Monday 2 to Sunday 8 March: Wednesday, Thursday and Friday.
    expect(perDay).toEqual([0, 0, 1, 1, 1, 0, 0]);
  });

  it("shows it on the same date in every time zone", async () => {
    const { server, rerender } = await renderLoaded([holiday]);

    rerender(calendar(server, { timeZone: "America/Los_Angeles", date: kolkata(4, 3) }));

    // 03:00 on 4 March in India is still 3 March in Los Angeles.
    expect(within(allDayList()).getByRole("button")).toHaveAccessibleName(
      /Tuesday,? 3 March 2026$/,
    );
  });

  it("cannot be dragged", async () => {
    await renderLoaded([holiday]);
    const button = within(allDayList()).getByRole("button");

    press(button);
    dragTo(100, 200);

    expect(button).not.toHaveClass("is-moving");
  });

  it("opens with dates in the form, the last date as the user thinks of it", async () => {
    await renderLoaded([allDay("conf", "2026-03-04", "2026-03-07", "Conference")], week);

    fireEvent.click(screen.getAllByRole("button", { name: /^Conference,/ })[0]);

    expect(screen.getByLabelText("All day")).toBeChecked();
    expect(field("Start")).toHaveAttribute("type", "date");
    expect(field("Start").value).toBe("2026-03-04");
    expect(field("End").value).toBe("2026-03-06");
  });

  it("stores a new all-day event as dates in UTC, with the end on the date after", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "Offsite");
    fireEvent.click(screen.getByLabelText("All day"));
    expect(field("Start").value).toBe("2026-03-03");
    type("End", "2026-03-04");

    save();
    await settle();

    expect(server.saves[0].args).toMatchObject({
      title: "Offsite",
      allDay: true,
      start: "2026-03-03T00:00:00.000Z",
      end: "2026-03-05T00:00:00.000Z",
    });
  });

  it("accepts an all-day event of one day, and refuses one that ends before it starts", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "Offsite");
    fireEvent.click(screen.getByLabelText("All day"));
    type("End", "2026-03-02");

    save();
    expect(screen.getByRole("alert")).toHaveTextContent("The end must be after the start.");

    type("End", "2026-03-03");
    save();
    await settle();
    expect(server.saves[0].args).toMatchObject({
      start: "2026-03-03T00:00:00.000Z",
      end: "2026-03-04T00:00:00.000Z",
    });
  });

  it("becomes 09:00 to 10:00 on its first date when 'All day' is unticked", async () => {
    const { server } = await renderLoaded([holiday]);
    fireEvent.click(within(allDayList()).getByRole("button"));

    fireEvent.click(screen.getByLabelText("All day"));
    expect(field("Start").value).toBe("2026-03-03T09:00");
    expect(field("End").value).toBe("2026-03-03T10:00");
    save();
    await settle();

    expect(server.saves[0].args).toMatchObject({ allDay: false, start: at(9), end: at(10) });
  });
});

describe("Calendar: the line for the present time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Draws the calendar with the clock of the test at this instant. */
  async function renderAt(now: number, options = {}) {
    vi.setSystemTime(now);
    const server = createManualServer();
    const view = render(calendar(server, options));
    server.loads[0].resolve([]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    return view;
  }
  const nowLine = (container: HTMLElement) =>
    container.querySelector<HTMLElement>(".calendar__now");

  it("is drawn at the present time of the day", async () => {
    const { container } = await renderAt(kolkata(3, 14, 30));

    expect(nowLine(container)?.style.top).toBe(`${14.5 * HOUR_HEIGHT}px`);
    expect(nowLine(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("moves when a minute has passed", async () => {
    const { container } = await renderAt(kolkata(3, 14, 30));

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(nowLine(container)?.style.top).toBe(`${(14.5 + 1 / 60) * HOUR_HEIGHT}px`);
  });

  it("is not drawn on another day", async () => {
    const { container } = await renderAt(kolkata(9, 14, 30));

    expect(nowLine(container)).toBeNull();
  });

  it("is drawn only in the column of today, and that column is marked as today", async () => {
    const { container } = await renderAt(kolkata(5, 9), week);
    const lists = screen.getAllByRole("list");
    const headers = screen.getAllByRole("columnheader");

    expect(container.querySelectorAll(".calendar__now")).toHaveLength(1);
    expect(lists[3]).toContainElement(nowLine(container));
    expect(headers[3]).toHaveAttribute("aria-current", "date");
    expect(headers[2]).not.toHaveAttribute("aria-current");
  });

  it("stops its timer when the calendar is removed", async () => {
    const { unmount } = await renderAt(kolkata(3, 14, 30));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Calendar: series", () => {
  /** Every day at 09:00 in India, from Monday 2 March 2026. */
  const standup: CalendarEvent = {
    id: "standup",
    title: "Stand-up",
    start: at(9, 0, 2),
    end: at(9, 15, 2),
    recurrence: { frequency: "daily", timeZone: "Asia/Kolkata" },
  };
  const standups = () => screen.getAllByRole("button", { name: /^Stand-up,/ });

  it("shows one event for each day of the week from one stored series", async () => {
    const { server } = await renderLoaded([standup], week);

    expect(standups()).toHaveLength(7);
    expect(standups()[1]).toHaveAccessibleName(/^Stand-up, 09:00 to 09:15, Tuesday,? 3 March/);
    expect(server.loads[0].args).toEqual({ rangeStart: at(0, 0, 2), rangeEnd: at(0, 0, 9) });
  });

  it("shows the events of another week without a new stored event", async () => {
    const { server, rerender } = await renderLoaded([standup], week);
    server.loads[2].resolve([standup]);
    await settle();

    rerender(calendar(server, { ...week, date: kolkata(10, 12) }));

    expect(standups()).toHaveLength(7);
    expect(standups()[0]).toHaveAccessibleName(/Monday,? 9 March/);
  });

  it("asks 'this event or all events' in the form of one event of a series, and only there", async () => {
    await renderLoaded([standup, review], week);

    fireEvent.click(standups()[1]);
    expect(screen.getByRole("group", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "This event" })).toBeChecked();
    expect(screen.queryByLabelText("Repeat")).not.toBeInTheDocument();

    fireEvent.click(eventButton("Design review"));
    expect(screen.queryByRole("group", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Repeat")).toHaveValue("");
  });

  it("'This event' saves the series with one changed occurrence, and the other days stay", async () => {
    const { server } = await renderLoaded([standup], week);
    fireEvent.click(standups()[1]);
    type("Start", "2026-03-03T11:00");
    type("End", "2026-03-03T11:15");

    save();
    await settle();

    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].args).toMatchObject({ id: "standup", start: at(9, 0, 2) });
    expect(server.saves[0].args.recurrence?.exceptions).toEqual({
      [at(9, 0, 3)]: { title: "Stand-up", start: at(11, 0, 3), end: at(11, 15, 3) },
    });
    expect(standups()[0]).toHaveAccessibleName(/09:00 to 09:15, Monday/);
    expect(standups()[1]).toHaveAccessibleName(/11:00 to 11:15, Tuesday/);
    expect(standups()[2]).toHaveAccessibleName(/09:00 to 09:15, Wednesday/);
  });

  it("'All events' moves every day of the series", async () => {
    const { server } = await renderLoaded([standup], week);
    fireEvent.click(standups()[1]);
    type("Start", "2026-03-03T11:00");
    type("End", "2026-03-03T11:30");
    fireEvent.click(screen.getByRole("radio", { name: "All events of the series" }));

    save();
    await settle();

    expect(server.saves[0].args).toMatchObject({
      id: "standup",
      start: at(11, 0, 2),
      end: at(11, 30, 2),
    });
    for (const button of standups()) {
      expect(button).toHaveAccessibleName(/11:00 to 11:30/);
    }
  });

  it("Delete with 'This event' cancels one day and keeps the series", async () => {
    const { server } = await renderLoaded([standup], week);
    fireEvent.click(standups()[1]);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    expect(server.deletes).toHaveLength(0);
    expect(server.saves[0].args.recurrence?.exceptions).toEqual({ [at(9, 0, 3)]: null });
    expect(standups()).toHaveLength(6);
  });

  it("Delete with 'All events' deletes the series", async () => {
    const { server } = await renderLoaded([standup], week);
    fireEvent.click(standups()[1]);
    fireEvent.click(screen.getByRole("radio", { name: "All events of the series" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    expect(server.deletes[0].args).toBe("standup");
    expect(screen.queryByRole("button", { name: /^Stand-up,/ })).not.toBeInTheDocument();
  });

  it("dragging one event of a series changes only that one", async () => {
    const { server } = await renderLoaded([standup], week);

    press(standups()[2]);
    dragTo(100, 100 + HOUR_HEIGHT);
    drop();
    await settle();

    expect(server.saves[0].args.recurrence?.exceptions).toEqual({
      [at(9, 0, 4)]: { title: "Stand-up", start: at(10, 0, 4), end: at(10, 15, 4) },
    });
    expect(standups()[2]).toHaveAccessibleName(/10:00 to 10:15, Wednesday/);
    expect(standups()[3]).toHaveAccessibleName(/09:00 to 09:15, Thursday/);
  });

  it("puts focus back on the event of the series after the form closes", async () => {
    await renderLoaded([standup], week);
    fireEvent.click(standups()[4]);

    fireEvent.keyDown(field("Title"), { key: "Escape" });

    expect(standups()[4]).toHaveFocus();
  });

  it("makes a new series from the 'Repeat' field, in the time zone of the calendar", async () => {
    const { server } = await renderLoaded([], week);
    fireEvent.click(weekSlot(14, 1));
    type("Title", "Yoga");
    fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: "weekly" } });

    save();
    await settle();

    expect(server.saves[0].args).toMatchObject({
      title: "Yoga",
      start: at(14),
      recurrence: { frequency: "weekly", timeZone: "Asia/Kolkata" },
    });
    // Tuesday of this week. The next one is in the week after.
    expect(screen.getAllByRole("button", { name: /^Yoga,/ })).toHaveLength(1);
  });

  it("puts focus on the first event of a new series after the form closes", async () => {
    await renderLoaded([], week);
    fireEvent.click(weekSlot(14, 1));
    type("Title", "Yoga");
    fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: "daily" } });

    save();

    expect(screen.getAllByRole("button", { name: /^Yoga,/ })[0]).toHaveFocus();
  });

  it("saves an event with no rule when 'Repeat' is left alone", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "Once");

    save();
    await settle();

    expect(server.saves[0].args.recurrence).toBeUndefined();
  });
});

describe("Calendar: the month", () => {
  const month = { view: "month" } as const;
  const monthGrid = () => screen.getByRole("grid", { name: "March 2026" });
  const dayButton = (day: string) =>
    screen.getByRole("button", { name: new RegExp(`^Show ${day}`) });
  /** The cell of a day of March 2026. */
  const cell = (day: number) => dayButton(`\\w+,? ${day} March`).parentElement as HTMLElement;
  const busyDay = Array.from({ length: 8 }, (_, index) =>
    makeEvent(`e${index}`, at(9 + index), at(10 + index), `Event ${index + 1}`),
  );

  it("draws six weeks of seven days, named after the month", async () => {
    await renderLoaded([], month);

    expect(monthGrid()).toBeInTheDocument();
    expect(within(monthGrid()).getAllByRole("row")).toHaveLength(1 + 6);
    expect(within(monthGrid()).getAllByRole("gridcell")).toHaveLength(42);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("asks the server for the six weeks in one request", async () => {
    const { server } = await renderLoaded([], month);

    // 1 March 2026 is a Sunday, so the grid runs from Monday 23 February to Sunday 5 April.
    expect(server.loads[0].args).toEqual({
      rangeStart: new Date(Date.UTC(2026, 1, 22, 18, 30)).toISOString(),
      rangeEnd: new Date(Date.UTC(2026, 3, 5, 18, 30)).toISOString(),
    });
  });

  it("marks the days of the other months", async () => {
    await renderLoaded([], month);
    const outside = within(monthGrid())
      .getAllByRole("gridcell")
      .filter((gridcell) => gridcell.className === "is-outside");

    // 23 to 28 February and 1 to 5 April.
    expect(outside).toHaveLength(6 + 5);
  });

  it("marks today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(kolkata(17, 10));
    const server = createManualServer();
    render(calendar(server, month));

    expect(cell(17)).toHaveAttribute("aria-current", "date");
    expect(cell(18)).not.toHaveAttribute("aria-current");
    vi.useRealTimers();
  });

  it("shows the events of a day with their time and their full label", async () => {
    await renderLoaded([review], month);
    const button = within(cell(3)).getByRole("button", { name: /^Design review,/ });

    expect(button).toHaveTextContent("10:00 Design review");
    expect(button).toHaveAccessibleName(/^Design review, 10:00 to 11:00, Tuesday,? 3 March 2026$/);
  });

  it("shows three events of a busy day and '+5 more' for the rest", async () => {
    await renderLoaded(busyDay, month);
    const events = within(cell(3)).getAllByRole("button", { name: /^Event \d,/ });
    const more = within(cell(3)).getByRole("button", { name: /more events/ });

    expect(events).toHaveLength(MONTH_EVENTS_PER_DAY);
    expect(events.map((button) => button.textContent)).toEqual([
      "09:00 Event 1",
      "10:00 Event 2",
      "11:00 Event 3",
    ]);
    expect(more).toHaveTextContent("+5 more");
    expect(more).toHaveAccessibleName(/^5 more events, Tuesday,? 3 March 2026$/);
  });

  it("says '1 more event' for one", async () => {
    await renderLoaded(busyDay.slice(0, 4), month);

    expect(within(cell(3)).getByRole("button", { name: /^1 more event,/ })).toHaveTextContent(
      "+1 more",
    );
  });

  it("shows no '+N more' when the events fit", async () => {
    await renderLoaded(busyDay.slice(0, 3), month);

    expect(within(cell(3)).queryByRole("button", { name: /more event/ })).not.toBeInTheDocument();
  });

  it("keeps the number of boxes small for a month with 5,000 events", async () => {
    const many = Array.from({ length: 5000 }, (_, index) =>
      makeEvent(
        `e${index}`,
        at(index % 24, 0, 1 + (index % 31)),
        at((index % 24) + 1, 0, 1 + (index % 31)),
      ),
    );
    await renderLoaded(many, month);

    // At most a day number, three events and "+N more" for each of 42 days.
    expect(within(monthGrid()).getAllByRole("button").length).toBeLessThanOrEqual(42 * 5);
  });

  it("asks the page for the day view when '+N more' is pressed", async () => {
    const onNavigate = vi.fn();
    await renderLoaded(busyDay, { ...month, onNavigate });

    fireEvent.click(within(cell(3)).getByRole("button", { name: /more events/ }));

    expect(onNavigate).toHaveBeenCalledWith(kolkata(3), "day");
  });

  it("asks the page for the day view when the number of a day is pressed", async () => {
    const onNavigate = vi.fn();
    await renderLoaded([], { ...month, onNavigate });

    fireEvent.click(dayButton("Tuesday,? 17 March 2026"));

    expect(onNavigate).toHaveBeenCalledWith(kolkata(17), "day");
  });

  it("opens the form when an event is pressed, and puts focus back on it after", async () => {
    await renderLoaded([review], month);
    const button = within(cell(3)).getByRole("button", { name: /^Design review,/ });

    fireEvent.click(button);
    expect(field("Title").value).toBe("Design review");
    fireEvent.keyDown(field("Title"), { key: "Escape" });

    expect(within(cell(3)).getByRole("button", { name: /^Design review,/ })).toHaveFocus();
  });

  it("moves between the days with the arrow keys", async () => {
    await renderLoaded([review], month);
    const day = (number: number) => dayButton(`\\w+,? ${number} March`);
    act(() => day(10).focus());

    fireEvent.keyDown(day(10), { key: "ArrowRight" });
    expect(day(11)).toHaveFocus();
    fireEvent.keyDown(day(11), { key: "ArrowDown" });
    expect(day(18)).toHaveFocus();
    fireEvent.keyDown(day(18), { key: "ArrowLeft" });
    expect(day(17)).toHaveFocus();
    fireEvent.keyDown(day(17), { key: "ArrowUp" });
    expect(day(10)).toHaveFocus();
  });

  it("makes one day a Tab stop, with its events, and no other day", async () => {
    await renderLoaded([review, makeEvent("other", at(9, 0, 12), at(10, 0, 12), "Other")], month);
    const tabStops = () =>
      within(monthGrid())
        .getAllByRole("button")
        .filter((button) => button.tabIndex === 0)
        .map((button) => button.getAttribute("aria-label"));

    // At first: the first day of the month.
    expect(tabStops()).toHaveLength(1);
    expect(tabStops()[0]).toMatch(/^Show Sunday,? 1 March/);

    act(() => dayButton("Tuesday,? 3 March 2026").focus());
    expect(tabStops()).toHaveLength(2);
    expect(tabStops()[1]).toMatch(/^Design review,/);
  });

  it("shows an all-day event first, with no time", async () => {
    const holiday: CalendarEvent = {
      id: "holiday",
      title: "Holiday",
      start: "2026-03-03T00:00:00.000Z",
      end: "2026-03-04T00:00:00.000Z",
      allDay: true,
    };
    await renderLoaded([review, holiday], month);
    const buttons = within(cell(3)).getAllByRole("button").slice(1);

    expect(buttons.map((button) => button.textContent)).toEqual(["Holiday", "10:00 Design review"]);
    expect(buttons[0]).toHaveAccessibleName(/^Holiday, all day, Tuesday,? 3 March 2026$/);
  });

  it("shows a series on each of its days", async () => {
    const weekly: CalendarEvent = {
      ...makeEvent("yoga", at(18), at(19), "Yoga"),
      recurrence: { frequency: "weekly", timeZone: "Asia/Kolkata" },
    };
    await renderLoaded([weekly], month);

    // Tuesdays from 3 March to the end of the grid: 3, 10, 17, 24, 31.
    expect(screen.getAllByRole("button", { name: /^Yoga,/ })).toHaveLength(5);
  });
});

describe("Calendar: a bounded page", () => {
  /** 5,000 events in the week of 2 to 8 March 2026. */
  const many = Array.from({ length: 5000 }, (_, index) => {
    const day = 2 + (index % 7);
    const minute = (index * 37) % (23 * 60);
    return makeEvent(`e${index}`, at(0, minute, day), at(0, minute + 20 + (index % 40), day));
  });
  const eventBoxes = (container: HTMLElement) => container.querySelectorAll("[data-event-id]");

  /** jsdom has no layout. This gives the scrolling part of the grid a height, as a browser would. */
  function giveTheGridAHeight(height: number) {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws at most three columns of events for a day of the week, and '+N more' for the rest", async () => {
    const { container } = await renderLoaded(many, week);
    const widths = new Set(
      Array.from(
        eventBoxes(container),
        (button) => (button.parentElement as HTMLElement).style.width,
      ),
    );
    const more = screen.getAllByRole("button", { name: /more events,/ });

    expect(widths).toEqual(new Set(["25%"]));
    expect(more.length).toBeGreaterThanOrEqual(7);
    expect(more[0]).toHaveAccessibleName(/^[\d,]+ more events, Monday,? 2 March 2026$/);
    expect((more[0].parentElement as HTMLElement).style.insetInlineStart).toBe("75%");
  });

  it("loses no event: the boxes and the '+N more' counts add up to 5,000", async () => {
    const { container } = await renderLoaded(many, week);
    const hidden = screen
      .getAllByRole("button", { name: /more events?,/ })
      .map((button) =>
        Number(
          /^([\d,]+) more/.exec(button.getAttribute("aria-label") ?? "")?.[1].replace(/,/g, ""),
        ),
      );

    // An event that crosses midnight has a box in two days.
    const total = eventBoxes(container).length + hidden.reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThanOrEqual(5000);
    expect(total).toBeLessThan(5000 + 400);
  });

  it("draws only the boxes near the hours on screen", async () => {
    giveTheGridAHeight(600);
    const { container } = await renderLoaded(many, week);

    // 600 pixels and two hours above and below, three columns of boxes of at least 24px, seven days.
    const mostBoxes = Math.ceil((600 + 4 * HOUR_HEIGHT) / 24 + 1) * 3 * 7;
    expect(eventBoxes(container).length).toBeGreaterThan(100);
    expect(eventBoxes(container).length).toBeLessThanOrEqual(mostBoxes);
  });

  it("draws the same number of boxes for 5,000 events as for 50,000", async () => {
    giveTheGridAHeight(600);
    const tenTimes = Array.from({ length: 10 }, (_, copy) =>
      many.map((event) => ({ ...event, id: `${event.id}-${copy}` })),
    ).flat();
    const first = await renderLoaded(many, week);
    const boxCount = eventBoxes(first.container).length;
    first.unmount();

    const second = await renderLoaded(tenTimes, week);

    expect(eventBoxes(second.container).length).toBeLessThanOrEqual(boxCount);
  });

  it("starts at 07:00 and draws other boxes after a scroll", async () => {
    giveTheGridAHeight(600);
    const morning = makeEvent("morning", at(8), at(9), "Morning");
    const night = makeEvent("night", at(22), at(23), "Night");
    const { container } = await renderLoaded([morning, night]);
    const scroller = container.querySelector(".calendar__scroll") as HTMLElement;

    expect(scroller.scrollTop).toBe(7 * HOUR_HEIGHT);
    expect(queryEventButton("Morning")).toBeInTheDocument();
    expect(queryEventButton("Night")).not.toBeInTheDocument();

    scroller.scrollTop = 17 * HOUR_HEIGHT;
    fireEvent.scroll(scroller);

    expect(queryEventButton("Morning")).not.toBeInTheDocument();
    expect(queryEventButton("Night")).toBeInTheDocument();
  });

  it("draws every box for printing, because paper cannot scroll", async () => {
    giveTheGridAHeight(600);
    const night = makeEvent("night", at(22), at(23), "Night");
    await renderLoaded([night]);
    expect(queryEventButton("Night")).not.toBeInTheDocument();

    act(() => void window.dispatchEvent(new Event("beforeprint")));
    expect(queryEventButton("Night")).toBeInTheDocument();

    act(() => void window.dispatchEvent(new Event("afterprint")));
    expect(queryEventButton("Night")).not.toBeInTheDocument();
  });

  it("allows three times as many columns in the day view", async () => {
    const sameHour = Array.from({ length: 30 }, (_, index) =>
      makeEvent(`e${index}`, at(10), at(11), `Event ${index + 1}`),
    );
    const { container } = await renderLoaded(sameHour);

    // 12 columns: 11 of events and one for "+19 more".
    expect(eventBoxes(container)).toHaveLength(11);
    expect(screen.getByRole("button", { name: /^19 more events,/ })).toHaveTextContent("+19 more");
  });

  it("takes the limit of columns from the page", async () => {
    const sameHour = Array.from({ length: 30 }, (_, index) =>
      makeEvent(`e${index}`, at(10), at(11), `Event ${index + 1}`),
    );
    const { container } = await renderLoaded(sameHour, { ...week, maxColumns: 6 });

    expect(eventBoxes(container)).toHaveLength(5);
  });

  it("asks the page for the day view when '+N more' is pressed", async () => {
    const onNavigate = vi.fn();
    await renderLoaded(many, { ...week, onNavigate });

    fireEvent.click(screen.getAllByRole("button", { name: /more events,/ })[0]);

    expect(onNavigate).toHaveBeenCalledWith(kolkata(2), "day");
  });
});

describe("Calendar: conflicts and the offline queue", () => {
  it("shows the server's version and says so when someone else changed the event first", async () => {
    const { server } = await renderLoaded([review]);
    key("Design review", "m");
    key("Design review", "ArrowDown");
    key("Design review", "Enter");
    await settle();

    server.saves[0].reject(new ConflictError({ ...review, title: "Design review (room 4)" }));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Someone else changed this event first. Their version is shown, and your change was not saved.",
    );
    expect(label("Design review \\(room 4\\)")).toMatch(/10:00 to 11:00/);
  });

  it("keeps an edit on screen while offline and says that it is waiting, without an error", async () => {
    const { server } = await renderLoaded([review]);
    key("Design review", "m");
    key("Design review", "ArrowDown");
    key("Design review", "Enter");
    await settle();

    server.saves[0].reject(new OfflineError());
    await settle();

    expect(label("Design review")).toMatch(/10:15 to 11:15/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/1 change is waiting for the connection/)).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("counts the waiting edits with the plural of the language", async () => {
    const lunch = makeEvent("lunch", at(12), at(13), "Lunch");
    const { server } = await renderLoaded([review, lunch]);
    for (const title of ["Design review", "Lunch"]) {
      key(title, "m");
      key(title, "ArrowDown");
      key(title, "Enter");
    }
    await settle();
    server.saves[0].reject(new OfflineError());
    await settle();

    expect(screen.getByText(/2 changes are waiting for the connection/)).toBeInTheDocument();
  });

  it("sends the waiting edits on 'Send now', and the message goes away when they are stored", async () => {
    const { server } = await renderLoaded([review]);
    key("Design review", "m");
    key("Design review", "ArrowDown");
    key("Design review", "Enter");
    await settle();
    server.saves[0].reject(new OfflineError());
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    await settle();
    expect(server.saves).toHaveLength(2);
    server.saves[1].resolve(server.saves[1].args);
    await settle();

    expect(screen.queryByText(/waiting for the connection/)).not.toBeInTheDocument();
    expect(label("Design review")).toMatch(/10:15 to 11:15/);
  });
});

describe("Calendar: monitoring", () => {
  function setUp() {
    const log: CalendarLogEvent[] = [];
    return { log, onEvent: (event: CalendarLogEvent) => void log.push(event) };
  }
  const views = (log: CalendarLogEvent[]) => log.filter((event) => event.type === "view_changed");

  it("reports a view once, when its events are on screen, with how long that took", async () => {
    vi.useFakeTimers();
    const { log, onEvent } = setUp();
    const server = createManualServer();
    render(calendar(server, { ...week, onEvent }));
    expect(views(log)).toEqual([]);

    await act(() => vi.advanceTimersByTimeAsync(250));
    server.loads[0].resolve([review]);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(views(log)).toEqual([{ type: "view_changed", view: "week", durationMs: 250 }]);
    vi.useRealTimers();
  });

  it("reports a change of view and a change of week, and nothing for a day of the same week view", async () => {
    const { log, onEvent } = setUp();
    const { server, rerender } = await renderLoaded([review], { ...week, onEvent });

    rerender(calendar(server, { ...week, onEvent, date: kolkata(4, 12) }));
    await settle();
    expect(views(log)).toHaveLength(1);

    rerender(calendar(server, { view: "day", onEvent, date: kolkata(4, 12) }));
    await settle();
    expect(views(log).map((event) => "view" in event && event.view)).toEqual(["week", "day"]);

    rerender(calendar(server, { view: "day", onEvent, date: kolkata(5, 12) }));
    await settle();
    expect(views(log)).toHaveLength(3);
  });

  it("does not report the view again when the page passes a new onEvent function", async () => {
    const { log, onEvent } = setUp();
    const { server, rerender } = await renderLoaded([review], { onEvent });

    rerender(calendar(server, { onEvent: (event) => onEvent(event) }));
    await settle();

    expect(views(log)).toHaveLength(1);
  });

  it("says how the user moved the event: by drag, by keyboard or in the form", async () => {
    const { log, onEvent } = setUp();
    const { server } = await renderLoaded([review], { onEvent });
    const answer = async () => {
      await settle();
      const last = server.saves[server.saves.length - 1];
      last.resolve(last.args);
      await settle();
    };

    press(eventButton("Design review"));
    dragTo(100, 148);
    drop();
    await answer();
    key("Design review", "m");
    key("Design review", "ArrowDown");
    key("Design review", "Enter");
    await answer();
    fireEvent.click(eventButton("Design review"));
    type("Title", "Design review 2");
    save();
    await answer();

    const moves = log.filter((event) => event.type === "event_moved");
    expect(moves.map((event) => "by" in event && event.by)).toEqual(["drag", "keyboard", "form"]);
  });

  it("never puts a title, an id or a date of the user in an event, through a whole session", async () => {
    const { log, onEvent } = setUp();
    const secret = makeEvent("secret-id-42", at(10), at(11), "Salary talk");
    const { server } = await renderLoaded([secret], { ...week, onEvent });

    fireEvent.click(weekSlot(14, 3));
    type("Title", "Doctor");
    save();
    await settle();
    server.saves[0].resolve(server.saves[0].args);
    await settle();
    key("Salary talk", "m");
    key("Salary talk", "ArrowDown");
    key("Salary talk", "Enter");
    await settle();
    server.saves[1].reject(new ConflictError(secret));
    await settle();
    fireEvent.click(eventButton("Doctor"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    server.deletes[0].reject(new Error("500"));
    await settle();

    expect(log.map((event) => event.type)).toEqual([
      "events_loaded",
      "view_changed",
      "event_created",
      "save_failed",
      "save_failed",
    ]);
    expect(JSON.stringify(log)).not.toMatch(/Salary|Doctor|secret-id-42|2026/);
    for (const event of log) {
      for (const value of Object.values(event)) {
        expect(typeof value === "number" || /^[a-z_]+$/.test(String(value))).toBe(true);
      }
    }
  });
});

describe("Calendar: the page asks, the calendar does not decide", () => {
  it("does nothing on '+N more' when the page gave no onNavigate", async () => {
    const sameHour = Array.from({ length: 30 }, (_, index) =>
      makeEvent(`e${index}`, at(10), at(11), `Event ${index + 1}`),
    );
    await renderLoaded(sameHour);

    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /more events,/ })),
    ).not.toThrow();
    expect(timeGrid()).toBeInTheDocument();
  });

  it("keeps the same texts object while the page passes the same messages", async () => {
    const messages = { save: "Speichern" };
    const { server, rerender } = await renderLoaded([review], { messages });
    fireEvent.click(eventButton("Design review"));

    rerender(calendar(server, { messages, date: NOON + 1 }));

    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });
});
