/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 *
 * Every test names its time zone, so the tests pass whatever the time zone of
 * the machine is. Most of them show the calendar in India.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Calendar } from "./Calendar";
import type { CalendarProps } from "./Calendar";
import { HOUR_HEIGHT } from "./layoutDay";
import { KOLKATA, at, createManualServer, kolkata, makeEvent } from "./testHelpers";
import type { ManualServer } from "./testHelpers";
import type { CalendarEvent } from "./types";

const NEW_YORK = "America/New_York";
/** Noon in India on Tuesday 3 March 2026, and on the Wednesday after it. */
const NOON = kolkata(3, 12);
const NEXT_NOON = kolkata(4, 12);
/** Some versions of the language data put a comma after the weekday. */
const DAY = "Tuesday,? 3 March 2026";

const review = makeEvent("review", at(10), at(11), "Design review");
const budget = makeEvent("budget", at(10, 30), at(12), "Budget call");
const interview = makeEvent("interview", at(11), at(12), "Interview");

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

type Options = Partial<Omit<CalendarProps, keyof ManualServer>>;

function calendar(server: ManualServer, options: Options = {}) {
  return (
    <Calendar date={NOON} view="day" timeZone={KOLKATA} locale="en-GB" {...server} {...options} />
  );
}

/** Draws the calendar and answers the load of the visible week with these events. */
async function renderLoaded(events: CalendarEvent[] = [review], options: Options = {}) {
  const server = createManualServer();
  const view = render(calendar(server, options));
  server.loads[0].resolve(events);
  await settle();
  return { server, ...view };
}

const eventButton = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title},`) });
const queryEventButton = (title: string) =>
  screen.queryByRole("button", { name: new RegExp(`^${title},`) });
const slots = () => within(screen.getByRole("grid")).getAllByRole("button");
const slot = (time: string) => within(screen.getByRole("grid")).getByRole("button", { name: time });
/** The slot of a row and a day in the week view. Both start at 0. */
const weekSlot = (row: number, day: number) => slots()[row * 7 + day];
const eventList = () => screen.getByRole("list");
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const box = (title: string) => eventButton(title).parentElement as HTMLLIElement;

describe("Calendar: the day", () => {
  it("draws 24 slots of one hour, named by their time", async () => {
    await renderLoaded([]);

    expect(slots()).toHaveLength(24);
    expect(slots()[0]).toHaveTextContent("00:00");
    expect(slots()[23]).toHaveTextContent("23:00");
  });

  it("puts the name of the day at the top of the column", async () => {
    await renderLoaded([]);

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Tue 3",
    ]);
  });

  it("names the grid, and names the list after the day", async () => {
    await renderLoaded([]);

    expect(screen.getByRole("grid")).toHaveAccessibleName("New event");
    expect(eventList()).toHaveAccessibleName(new RegExp(`^Events, ${DAY}$`));
  });

  it("uses a 12 hour clock when the locale does", async () => {
    await renderLoaded([], { locale: "en-US" });

    expect(slots()[15]).toHaveTextContent(/^3:00\sPM$/);
  });

  it("gives every event a button with a full spoken label", async () => {
    await renderLoaded([review]);

    expect(eventButton("Design review")).toHaveAccessibleName(
      new RegExp(`^Design review, 10:00 to 11:00, ${DAY}$`),
    );
    expect(eventButton("Design review")).toHaveTextContent("Design review");
  });

  it("places an event by its start and its length", async () => {
    await renderLoaded([review]);

    expect(box("Design review").style.top).toBe(`${10 * HOUR_HEIGHT}px`);
    expect(box("Design review").style.height).toBe(`${HOUR_HEIGHT}px`);
    expect(box("Design review").style.width).toBe("100%");
  });

  it("draws A, B and C in two columns when A overlaps B and B overlaps C", async () => {
    await renderLoaded([review, budget, interview]);

    for (const title of ["Design review", "Budget call", "Interview"]) {
      expect(box(title).style.width).toBe("50%");
    }
    expect(box("Design review").style.insetInlineStart).toBe("0%");
    expect(box("Budget call").style.insetInlineStart).toBe("50%");
    expect(box("Interview").style.insetInlineStart).toBe("0%");
  });

  it("lists the events in time order, whatever order the server sends", async () => {
    await renderLoaded([interview, review, budget]);
    const names = within(eventList())
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(names).toEqual(["Design review", "Budget call", "Interview"]);
  });

  it("clips an event that crosses midnight to the day", async () => {
    await renderLoaded([makeEvent("flight", at(22), at(26), "Flight")]);

    expect(box("Flight").style.top).toBe(`${22 * HOUR_HEIGHT}px`);
    expect(box("Flight").style.height).toBe(`${2 * HOUR_HEIGHT}px`);
  });

  it("shows the rest of that event on the next day", async () => {
    await renderLoaded([makeEvent("flight", at(22), at(26), "Flight")], { date: NEXT_NOON });

    expect(box("Flight").style.top).toBe("0px");
    expect(box("Flight").style.height).toBe(`${2 * HOUR_HEIGHT}px`);
  });

  it("draws 500 events of one day", async () => {
    const events = Array.from({ length: 500 }, (_, index) =>
      makeEvent(
        `e${index}`,
        at(index % 24, (index * 7) % 60),
        at((index % 24) + 1, (index * 7) % 60),
      ),
    );
    await renderLoaded(events);

    expect(within(eventList()).getAllByRole("button")).toHaveLength(500);
  });
});

describe("Calendar: loading", () => {
  it("says that it is loading, then stops saying it", async () => {
    const server = createManualServer();
    render(calendar(server));
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    server.loads[0].resolve([]);
    await settle();

    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("shows an error with 'Try again' when the load fails, and loads again", async () => {
    const server = createManualServer();
    render(calendar(server));
    server.loads[0].reject(new Error("offline"));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the events.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    server.loads[1].resolve([review]);
    await settle();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(eventButton("Design review")).toBeInTheDocument();
  });

  it("asks for the whole week of the date, from Monday in Britain", async () => {
    const server = createManualServer();
    render(calendar(server));

    expect(server.loads[0].args).toEqual({ rangeStart: at(0, 0, 2), rangeEnd: at(0, 0, 9) });
  });

  it("asks for the week from Sunday in the United States", async () => {
    const server = createManualServer();
    render(calendar(server, { locale: "en-US" }));

    expect(server.loads[0].args).toEqual({ rangeStart: at(0, 0, 1), rangeEnd: at(0, 0, 8) });
  });

  it("does not load again when the date moves to another day of the same week", async () => {
    const { server, rerender } = await renderLoaded([review]);
    const loadsBefore = server.loads.length;

    rerender(calendar(server, { date: NEXT_NOON }));

    expect(server.loads).toHaveLength(loadsBefore);
    expect(eventList()).toHaveAccessibleName(/Wednesday,? 4 March 2026/);
  });

  it("does not load again when the view changes", async () => {
    const { server, rerender } = await renderLoaded([review]);
    const loadsBefore = server.loads.length;

    rerender(calendar(server, { view: "week" }));

    expect(server.loads).toHaveLength(loadsBefore);
  });

  it("loads the new week when the date leaves the week, and aborts the old request", async () => {
    const server = createManualServer();
    const { rerender } = render(calendar(server));

    rerender(calendar(server, { date: kolkata(17, 12) }));

    expect(server.loads[0].signal.aborted).toBe(true);
    expect(server.loads[1].args.rangeStart).toBe(at(0, 0, 16));
  });

  it("shows the next week at once, because it was loaded ahead", async () => {
    const offsite = makeEvent("offsite", at(10, 0, 10), at(11, 0, 10), "Offsite");
    const { server, rerender } = await renderLoaded([review]);
    server.loads[2].resolve([offsite]);
    await settle();

    rerender(calendar(server, { date: kolkata(10, 12) }));

    expect(eventButton("Offsite")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});

describe("Calendar: making an event", () => {
  it("opens a form for one hour when a slot is clicked, with focus in the title", async () => {
    await renderLoaded([]);

    fireEvent.click(slot("14:00"));

    expect(screen.getByRole("form", { name: "New event" })).toBeInTheDocument();
    expect(field("Title")).toHaveFocus();
    expect(field("Start").value).toBe("2026-03-03T14:00");
    expect(field("End").value).toBe("2026-03-03T15:00");
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows the new event at once and sends it to the server", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "  Roadmap  ");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(eventButton("Roadmap")).toHaveAccessibleName(/^Roadmap, 14:00 to 15:00,/);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].args).toMatchObject({ title: "Roadmap", start: at(14), end: at(15) });
    expect(server.saves[0].args.id).not.toBe("");
  });

  it("moves focus to the new event after the form closes", async () => {
    await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "Roadmap");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(eventButton("Roadmap")).toHaveFocus();
  });

  it("takes the new event away and says so when the server fails", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "Roadmap");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(queryEventButton("Roadmap")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Your change was undone.");
  });

  it("does not save an event whose end is not after its start", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "Roadmap");
    type("End", "2026-03-03T14:00");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The end must be after the start.");
    expect(screen.getByRole("form")).toBeInTheDocument();
    expect(server.saves).toHaveLength(0);
  });

  it("does not save an event with an empty date", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("14:00"));
    type("Title", "Roadmap");
    type("Start", "");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(server.saves).toHaveLength(0);
  });

  it("asks the browser to refuse an empty title, or one of only spaces", async () => {
    await renderLoaded([]);
    fireEvent.click(slot("14:00"));

    expect(field("Title")).toBeRequired();
    expect(field("Title")).toBeInvalid();
    type("Title", "   ");
    expect(field("Title")).toBeInvalid();
    type("Title", "Roadmap");
    expect(field("Title")).toBeValid();
  });

  it("can make an event that ends on the next day", async () => {
    const { server } = await renderLoaded([]);
    fireEvent.click(slot("23:00"));
    type("Title", "Night deploy");
    type("End", "2026-03-04T01:00");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(server.saves[0].args).toMatchObject({ start: at(23), end: at(25) });
    expect(box("Night deploy").style.height).toBe(`${HOUR_HEIGHT}px`);
  });

  it("closes the form on Cancel and puts focus back on the slot", async () => {
    const { server } = await renderLoaded([]);
    slot("14:00").focus();
    fireEvent.click(slot("14:00"));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(slot("14:00")).toHaveFocus();
    expect(server.saves).toHaveLength(0);
  });
});

describe("Calendar: changing and deleting an event", () => {
  it("opens the form with the values of the event", async () => {
    await renderLoaded([review]);

    fireEvent.click(eventButton("Design review"));

    expect(screen.getByRole("form", { name: "Edit event" })).toBeInTheDocument();
    expect(field("Title").value).toBe("Design review");
    expect(field("Start").value).toBe("2026-03-03T10:00");
    expect(field("End").value).toBe("2026-03-03T11:00");
  });

  it("moves the event at once when its time is changed, and keeps its id", async () => {
    const { server } = await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));
    type("Start", "2026-03-03T15:00");
    type("End", "2026-03-03T16:30");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(eventButton("Design review")).toHaveAccessibleName(/^Design review, 15:00 to 16:30,/);
    expect(box("Design review").style.top).toBe(`${15 * HOUR_HEIGHT}px`);
    expect(server.saves[0].args).toEqual({ ...review, start: at(15), end: at(16, 30) });
  });

  it("puts focus back on the event after Save", async () => {
    await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(eventButton("Design review")).toHaveFocus();
  });

  it("puts the event back where it was when the server fails", async () => {
    const { server } = await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));
    type("Start", "2026-03-03T15:00");
    type("End", "2026-03-03T16:00");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(eventButton("Design review")).toHaveAccessibleName(/^Design review, 10:00 to 11:00,/);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Your change was undone.");
  });

  it("takes the event away at once on Delete, and puts focus on a slot", async () => {
    const { server } = await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(queryEventButton("Design review")).not.toBeInTheDocument();
    expect(server.deletes[0].args).toBe("review");
    expect(slot("09:00")).toHaveFocus();
  });

  it("brings the event back when the delete fails", async () => {
    const { server } = await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    server.deletes[0].reject(new Error("500"));
    await settle();

    expect(eventButton("Design review")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("closes the form on Escape and puts focus back on the event", async () => {
    const { server } = await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));
    type("Title", "Changed");

    fireEvent.keyDown(field("Title"), { key: "Escape" });

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(eventButton("Design review")).toHaveFocus();
    expect(server.saves).toHaveLength(0);
  });

  it("keeps the form open on the Escape that closes the popup of a Hindi or Japanese keyboard", async () => {
    await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));

    fireEvent.keyDown(field("Title"), { key: "Escape", isComposing: true });

    expect(screen.getByRole("form")).toBeInTheDocument();
  });

  it("shows the other event when one is clicked while the form is open", async () => {
    await renderLoaded([review, makeEvent("lunch", at(12), at(13), "Lunch")]);
    fireEvent.click(eventButton("Design review"));

    fireEvent.click(eventButton("Lunch"));

    expect(field("Title").value).toBe("Lunch");
    expect(field("Start").value).toBe("2026-03-03T12:00");
  });
});

describe("Calendar: keyboard", () => {
  it("makes one slot a Tab stop, and moves it with the focus", async () => {
    await renderLoaded([]);
    const tabStops = () =>
      within(screen.getByRole("grid"))
        .getAllByRole("button")
        .filter((button) => button.tabIndex === 0);

    expect(tabStops()).toEqual([slot("09:00")]);

    act(() => slot("09:00").focus());
    fireEvent.keyDown(slot("09:00"), { key: "ArrowDown" });

    expect(slot("10:00")).toHaveFocus();
    expect(tabStops()).toEqual([slot("10:00")]);
  });

  it("moves between the slots with ArrowUp and ArrowDown, and stops at the ends", async () => {
    await renderLoaded([]);
    act(() => slot("01:00").focus());

    fireEvent.keyDown(slot("01:00"), { key: "ArrowUp" });
    expect(slot("00:00")).toHaveFocus();
    fireEvent.keyDown(slot("00:00"), { key: "ArrowUp" });
    expect(slot("00:00")).toHaveFocus();

    act(() => slot("23:00").focus());
    fireEvent.keyDown(slot("23:00"), { key: "ArrowDown" });
    expect(slot("23:00")).toHaveFocus();
  });

  it("moves between the events in time order with ArrowDown and ArrowUp", async () => {
    await renderLoaded([interview, review, budget]);
    act(() => eventButton("Design review").focus());

    fireEvent.keyDown(eventButton("Design review"), { key: "ArrowDown" });
    expect(eventButton("Budget call")).toHaveFocus();
    fireEvent.keyDown(eventButton("Budget call"), { key: "ArrowDown" });
    expect(eventButton("Interview")).toHaveFocus();
    fireEvent.keyDown(eventButton("Interview"), { key: "ArrowDown" });
    expect(eventButton("Interview")).toHaveFocus();
    fireEvent.keyDown(eventButton("Interview"), { key: "ArrowUp" });
    expect(eventButton("Budget call")).toHaveFocus();
  });

  it("leaves other keys alone, so Tab and typing work as usual", async () => {
    await renderLoaded([review]);
    act(() => slot("09:00").focus());

    const notPrevented = fireEvent.keyDown(slot("09:00"), { key: "Tab" });

    expect(notPrevented).toBe(true);
    expect(slot("09:00")).toHaveFocus();
  });

  it("stops the page from scrolling when an arrow key moves the focus", async () => {
    await renderLoaded([]);
    act(() => slot("09:00").focus());

    const notPrevented = fireEvent.keyDown(slot("09:00"), { key: "ArrowDown" });

    expect(notPrevented).toBe(false);
  });

  it("goes back to the slot the user came from after a new event is cancelled", async () => {
    await renderLoaded([]);
    act(() => slot("09:00").focus());
    fireEvent.keyDown(slot("09:00"), { key: "ArrowDown" });
    fireEvent.click(slot("10:00"));

    fireEvent.keyDown(field("Title"), { key: "Escape" });

    expect(slot("10:00")).toHaveFocus();
  });

  it("does not take the focus when it is first drawn", async () => {
    await renderLoaded([review]);

    expect(document.body).toHaveFocus();
  });
});

describe("Calendar: the week", () => {
  const week = { view: "week" } as const;

  it("draws seven days from Monday in Britain, each with its name on top", async () => {
    await renderLoaded([], week);

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Mon 2",
      "Tue 3",
      "Wed 4",
      "Thu 5",
      "Fri 6",
      "Sat 7",
      "Sun 8",
    ]);
    expect(screen.getAllByRole("row")).toHaveLength(1 + 24);
    expect(slots()).toHaveLength(24 * 7);
  });

  it("starts the week on Sunday in the United States and in India", async () => {
    const { unmount } = await renderLoaded([], { ...week, locale: "en-US" });
    // American English writes the number first: "1 Sun".
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent(/^1 Sun$|^Sun 1$/);
    unmount();

    await renderLoaded([], { ...week, locale: "hi-IN" });
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.getAllByRole("list")[0]).toHaveAccessibleName(/1 मार्च 2026/);
  });

  it("gives every day its own list of events, named after the day", async () => {
    await renderLoaded([review, makeEvent("offsite", at(9, 0, 6), at(17, 0, 6), "Offsite")], week);
    const lists = screen.getAllByRole("list");

    expect(lists).toHaveLength(7);
    expect(lists[1]).toHaveAccessibleName(new RegExp(`^Events, ${DAY}$`));
    expect(within(lists[1]).getByRole("button")).toHaveTextContent("Design review");
    expect(within(lists[4]).getByRole("button")).toHaveTextContent("Offsite");
    expect(within(lists[0]).queryByRole("button")).not.toBeInTheDocument();
  });

  it("lays out each day on its own, with the same layout function", async () => {
    const friday = makeEvent("friday", at(10, 0, 6), at(11, 0, 6), "Friday review");
    await renderLoaded([review, budget, friday], week);

    expect(box("Design review").style.width).toBe("50%");
    expect(box("Budget call").style.insetInlineStart).toBe("50%");
    // Friday has one event. The busy Tuesday does not make it narrow.
    expect(box("Friday review").style.width).toBe("100%");
  });

  it("draws an event that spans two days in both, clipped to each day", async () => {
    await renderLoaded([makeEvent("flight", at(22), at(26), "Flight")], week);
    const [tuesday, wednesday] = screen
      .getAllByRole("button", { name: /^Flight,/ })
      .map((button) => button.parentElement as HTMLLIElement);

    expect(tuesday.style.top).toBe(`${22 * HOUR_HEIGHT}px`);
    expect(tuesday.style.height).toBe(`${2 * HOUR_HEIGHT}px`);
    expect(wednesday.style.top).toBe("0px");
    expect(wednesday.style.height).toBe(`${2 * HOUR_HEIGHT}px`);
    expect(screen.getAllByRole("list")[2]).toContainElement(wednesday);
  });

  it("gives both halves of that event the same full label", async () => {
    await renderLoaded([makeEvent("flight", at(22), at(26), "Flight")], week);
    const names = screen
      .getAllByRole("button", { name: /^Flight,/ })
      .map((button) => button.getAttribute("aria-label"));

    expect(names[0]).toMatch(/^Flight, 22:00 to 02:00, Tuesday,? 3 March 2026$/);
    expect(names[1]).toBe(names[0]);
  });

  it("makes a new event on the day and the hour of the slot that is clicked", async () => {
    await renderLoaded([], week);

    // Row 14 is 14:00. Day 3 is Thursday 5 March.
    fireEvent.click(weekSlot(14, 3));

    expect(field("Start").value).toBe("2026-03-05T14:00");
    expect(field("End").value).toBe("2026-03-05T15:00");
  });

  it("moves between the slots in four directions with the arrow keys", async () => {
    await renderLoaded([], week);
    act(() => weekSlot(9, 0).focus());

    fireEvent.keyDown(weekSlot(9, 0), { key: "ArrowRight" });
    expect(weekSlot(9, 1)).toHaveFocus();
    fireEvent.keyDown(weekSlot(9, 1), { key: "ArrowDown" });
    expect(weekSlot(10, 1)).toHaveFocus();
    fireEvent.keyDown(weekSlot(10, 1), { key: "ArrowLeft" });
    expect(weekSlot(10, 0)).toHaveFocus();
    fireEvent.keyDown(weekSlot(10, 0), { key: "ArrowUp" });
    expect(weekSlot(9, 0)).toHaveFocus();
  });

  it("stops at the top and at the bottom of the grid", async () => {
    await renderLoaded([], week);
    act(() => weekSlot(0, 3).focus());
    fireEvent.keyDown(weekSlot(0, 3), { key: "ArrowUp" });
    expect(weekSlot(0, 3)).toHaveFocus();

    act(() => weekSlot(23, 3).focus());
    fireEvent.keyDown(weekSlot(23, 3), { key: "ArrowDown" });
    expect(weekSlot(23, 3)).toHaveFocus();
  });

  it("turns ArrowLeft and ArrowRight round in a right-to-left page", async () => {
    await renderLoaded([], week);
    screen.getByRole("grid").style.direction = "rtl";
    act(() => weekSlot(9, 2).focus());

    fireEvent.keyDown(weekSlot(9, 2), { key: "ArrowLeft" });
    expect(weekSlot(9, 3)).toHaveFocus();
    fireEvent.keyDown(weekSlot(9, 3), { key: "ArrowRight" });
    expect(weekSlot(9, 2)).toHaveFocus();
  });

  it("keeps one slot of the whole grid as the Tab stop", async () => {
    await renderLoaded([], week);
    const tabStops = () => slots().filter((button) => button.tabIndex === 0);

    expect(tabStops()).toEqual([weekSlot(9, 0)]);
    act(() => weekSlot(12, 4).focus());
    expect(tabStops()).toEqual([weekSlot(12, 4)]);
  });

  it("still has a Tab stop after the view changes from week to day", async () => {
    const { server, rerender } = await renderLoaded([], week);
    act(() => weekSlot(12, 4).focus());

    rerender(calendar(server, { view: "day" }));

    expect(slots().filter((button) => button.tabIndex === 0)).toEqual([slot("12:00")]);
  });

  it("moves through the events of the week in order: day by day, then by time", async () => {
    const monday = makeEvent("monday", at(15, 0, 2), at(16, 0, 2), "Monday sync");
    await renderLoaded([interview, review, monday], week);
    act(() => eventButton("Monday sync").focus());

    fireEvent.keyDown(eventButton("Monday sync"), { key: "ArrowDown" });
    expect(eventButton("Design review")).toHaveFocus();
    fireEvent.keyDown(eventButton("Design review"), { key: "ArrowRight" });
    expect(eventButton("Interview")).toHaveFocus();
  });

  it("puts focus back on the event after the form closes", async () => {
    await renderLoaded([review], week);
    fireEvent.click(eventButton("Design review"));

    fireEvent.keyDown(field("Title"), { key: "Escape" });

    expect(eventButton("Design review")).toHaveFocus();
  });

  it("puts focus on the new event after it is made", async () => {
    await renderLoaded([], week);
    fireEvent.click(weekSlot(14, 3));
    type("Title", "Roadmap");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(eventButton("Roadmap")).toHaveFocus();
    expect(screen.getAllByRole("list")[3]).toContainElement(eventButton("Roadmap"));
  });
});

describe("Calendar: time zones", () => {
  // 04:30 UTC is 10:00 in India and 23:30 of the day before in New York.
  it("shows one event at 10:00 in India and at 23:30 the day before in New York", async () => {
    const { server, rerender } = await renderLoaded([review]);
    expect(eventButton("Design review")).toHaveAccessibleName(/10:00 to 11:00, Tuesday,? 3 March/);
    expect(box("Design review").style.top).toBe(`${10 * HOUR_HEIGHT}px`);

    rerender(calendar(server, { timeZone: NEW_YORK, date: Date.parse("2026-03-02T17:00:00Z") }));

    expect(eventButton("Design review")).toHaveAccessibleName(/23:30 to 00:30, Monday,? 2 March/);
    expect(box("Design review").style.top).toBe(`${23.5 * HOUR_HEIGHT}px`);
    // The rest of the event is on the next day: it is clipped at midnight.
    expect(box("Design review").style.height).toBe(`${0.5 * HOUR_HEIGHT}px`);
  });

  it("uses the time zone of the browser when none is given", async () => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const noon = Date.parse("2026-06-10T12:00:00Z");
    const expected = new Intl.DateTimeFormat("en-GB", {
      timeStyle: "short",
      timeZone: browserZone,
    });
    const meeting = makeEvent("m", "2026-06-10T12:00:00Z", "2026-06-10T13:00:00Z", "Meeting");
    await renderLoaded([meeting], { timeZone: undefined, date: noon });

    expect(eventButton("Meeting").getAttribute("aria-label")).toContain(expected.format(noon));
  });

  it("reads the times typed into the form as times of the zone", async () => {
    const { server } = await renderLoaded([], { timeZone: NEW_YORK });
    // Noon in India on 3 March is 01:30 on 3 March in New York.
    expect(eventList()).toHaveAccessibleName(/Tuesday,? 3 March 2026/);
    fireEvent.click(slot("09:00"));
    type("Title", "Call");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // 09:00 in New York in winter is 14:00 UTC.
    expect(server.saves[0].args).toMatchObject({
      start: "2026-03-03T14:00:00.000Z",
      end: "2026-03-03T15:00:00.000Z",
    });
  });

  it("shows the open form again in the new zone when the time zone changes", async () => {
    const { server, rerender } = await renderLoaded([review]);
    fireEvent.click(eventButton("Design review"));
    expect(field("Start").value).toBe("2026-03-03T10:00");

    rerender(calendar(server, { timeZone: "UTC" }));

    expect(field("Start").value).toBe("2026-03-03T04:30");
  });
});

describe("Calendar: the days on which the clocks change", () => {
  /** Noon in New York on 8 March 2026 (clocks forward) and on 1 November 2026 (clocks back). */
  const FORWARD = Date.parse("2026-03-08T16:00:00Z");
  const BACK = Date.parse("2026-11-01T17:00:00Z");
  const newYork = (date: number, view: "day" | "week" = "day") => ({
    timeZone: NEW_YORK,
    date,
    view,
  });
  const slotTimes = () => slots().map((button) => button.textContent);

  it("draws 23 rows on the day the clocks go forward, with no 02:00", async () => {
    await renderLoaded([], newYork(FORWARD));

    expect(slots()).toHaveLength(23);
    expect(slotTimes().slice(0, 4)).toEqual(["00:00", "01:00", "03:00", "04:00"]);
    expect(slotTimes()[22]).toBe("23:00");
  });

  it("draws 25 rows on the day the clocks go back, with 01:00 twice", async () => {
    await renderLoaded([], newYork(BACK));

    expect(slots()).toHaveLength(25);
    expect(slotTimes().slice(0, 4)).toEqual(["00:00", "01:00", "01:00", "02:00"]);
    expect(slotTimes()[24]).toBe("23:00");
  });

  it("draws 24 rows on an ordinary day in New York and on every day in India", async () => {
    const { unmount } = await renderLoaded([], newYork(Date.parse("2026-03-10T16:00:00Z")));
    expect(slots()).toHaveLength(24);
    unmount();

    await renderLoaded([], { date: FORWARD });
    expect(slots()).toHaveLength(24);
  });

  it("places an event after the jump by the real hours since midnight", async () => {
    // 11:00 EDT on 8 March is 15:00 UTC. That is 10 real hours after midnight, not 11.
    const brunch = makeEvent("b", "2026-03-08T15:00:00Z", "2026-03-08T16:00:00Z", "Brunch");
    await renderLoaded([brunch], newYork(FORWARD));

    expect(eventButton("Brunch")).toHaveAccessibleName(/^Brunch, 11:00 to 12:00, Sunday,? 8 March/);
    expect(box("Brunch").style.top).toBe(`${10 * HOUR_HEIGHT}px`);
    // The box sits on the row that shows 11:00.
    expect(slotTimes()[10]).toBe("11:00");
  });

  it("draws an event from 01:00 to 03:00 across the jump as one hour tall", async () => {
    const deploy = makeEvent("d", "2026-03-08T06:00:00Z", "2026-03-08T07:00:00Z", "Deploy");
    await renderLoaded([deploy], newYork(FORWARD));

    expect(eventButton("Deploy")).toHaveAccessibleName(/^Deploy, 01:00 to 03:00,/);
    expect(box("Deploy").style.height).toBe(`${HOUR_HEIGHT}px`);
  });

  it("draws an event from 01:00 to 02:00 on the long day as two hours tall", async () => {
    const backup = makeEvent("b", "2026-11-01T05:00:00Z", "2026-11-01T07:00:00Z", "Backup");
    await renderLoaded([backup], newYork(BACK));

    expect(eventButton("Backup")).toHaveAccessibleName(/^Backup, 01:00 to 02:00,/);
    expect(box("Backup").style.top).toBe(`${HOUR_HEIGHT}px`);
    expect(box("Backup").style.height).toBe(`${2 * HOUR_HEIGHT}px`);
  });

  it("makes a new event at the real instant of the slot", async () => {
    const { server } = await renderLoaded([], newYork(FORWARD));
    fireEvent.click(slot("03:00"));
    expect(field("Start").value).toBe("2026-03-08T03:00");
    type("Title", "Early call");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // 03:00 EDT is 07:00 UTC.
    expect(server.saves[0].args).toMatchObject({
      start: "2026-03-08T07:00:00.000Z",
      end: "2026-03-08T08:00:00.000Z",
    });
  });

  it("gives the short day an empty last slot in a week of 24 rows, so the columns stay in step", async () => {
    // In Britain the week of 8 March 2026 is Monday 2 to Sunday 8. Sunday is the short day.
    await renderLoaded([], newYork(FORWARD, "week"));

    expect(screen.getAllByRole("row")).toHaveLength(1 + 24);
    expect(slots()).toHaveLength(24 * 7);
    expect(weekSlot(23, 6)).toBeDisabled();
    expect(weekSlot(23, 6)).toHaveTextContent("");
    expect(weekSlot(23, 5)).toBeEnabled();
    // Row 2 is 02:00 on Saturday and 03:00 on Sunday.
    expect(weekSlot(2, 5)).toHaveTextContent("02:00");
    expect(weekSlot(2, 6)).toHaveTextContent("03:00");
  });

  it("draws 25 rows in the week with the long day, and only that day uses the last one", async () => {
    // With a week from Sunday, 1 November 2026 is the first day.
    await renderLoaded([], { ...newYork(BACK, "week"), locale: "en-US" });

    expect(screen.getAllByRole("row")).toHaveLength(1 + 25);
    expect(weekSlot(24, 0)).toBeEnabled();
    expect(weekSlot(24, 1)).toBeDisabled();
  });

  it("asks the server for a week that is one hour short", async () => {
    const server = createManualServer();
    render(calendar(server, newYork(FORWARD, "week")));

    // Monday 2 March 00:00 EST to Monday 9 March 00:00 EDT.
    expect(server.loads[0].args).toEqual({
      rangeStart: "2026-03-02T05:00:00.000Z",
      rangeEnd: "2026-03-09T04:00:00.000Z",
    });
  });
});

describe("Calendar: messages", () => {
  const hindi = {
    loading: "लोड हो रहा है…",
    loadFailed: "कार्यक्रम लोड नहीं हो सके।",
    tryAgain: "फिर कोशिश करें",
    saveFailed: "सहेजा नहीं जा सका। आपका बदलाव वापस ले लिया गया।",
    eventsOn: (day: string) => `कार्यक्रम, ${day}`,
    newEvent: "नया कार्यक्रम",
    editEvent: "कार्यक्रम बदलें",
    eventLabel: (title: string, start: string, end: string, day: string) =>
      `${title}, ${day}, ${start} से ${end} तक`,
    title: "शीर्षक",
    start: "शुरू",
    end: "समाप्त",
    endBeforeStart: "समाप्ति शुरुआत के बाद होनी चाहिए।",
    save: "सहेजें",
    delete: "हटाएँ",
    cancel: "रद्द करें",
  };
  const inHindi = { messages: hindi, locale: "hi-IN" };

  it("shows every text of the day in the language it is given", async () => {
    await renderLoaded([review], inHindi);

    expect(screen.getByRole("grid")).toHaveAccessibleName("नया कार्यक्रम");
    expect(eventList()).toHaveAccessibleName(/^कार्यक्रम, मंगलवार,? 3 मार्च 2026$/);
    expect(eventButton("Design review").getAttribute("aria-label")).toMatch(
      /^Design review, मंगलवार,? 3 मार्च 2026, 10:00\sam से 11:00\sam तक$/,
    );
  });

  it("shows every text of the form in the language it is given", async () => {
    await renderLoaded([review], inHindi);
    fireEvent.click(eventButton("Design review"));
    fireEvent.change(screen.getByLabelText("समाप्त"), { target: { value: "2026-03-03T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "सहेजें" }));

    expect(screen.getByRole("form", { name: "कार्यक्रम बदलें" })).toBeInTheDocument();
    expect(screen.getByLabelText("शीर्षक")).toBeInTheDocument();
    expect(screen.getByLabelText("शुरू")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("समाप्ति शुरुआत के बाद होनी चाहिए।");
    expect(screen.getByRole("button", { name: "हटाएँ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "रद्द करें" })).toBeInTheDocument();
  });

  it("shows the loading and failure texts in the language it is given", async () => {
    const server = createManualServer();
    render(calendar(server, inHindi));
    expect(screen.getByText("लोड हो रहा है…")).toBeInTheDocument();

    server.loads[0].reject(new Error("offline"));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("कार्यक्रम लोड नहीं हो सके।");
    fireEvent.click(screen.getByRole("button", { name: "फिर कोशिश करें" }));
    server.loads[1].resolve([review]);
    await settle();

    fireEvent.click(eventButton("Design review"));
    fireEvent.click(screen.getByRole("button", { name: "हटाएँ" }));
    server.deletes[0].reject(new Error("500"));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("सहेजा नहीं जा सका।");
  });

  it("leaves no English on screen when every text is given", async () => {
    const { container } = await renderLoaded([], inHindi);
    fireEvent.click(slot("10:00 am"));

    // The only Latin letters left are "am" and "pm" from the language data of the test machine.
    expect(container.textContent?.replace(/[ap]m/g, "")).not.toMatch(/[A-Za-z]/);
    for (const element of container.querySelectorAll("[aria-label]")) {
      expect(element.getAttribute("aria-label")).not.toMatch(/[A-Za-z]{3}/);
    }
  });

  it("keeps the English text for every message that is left out", async () => {
    await renderLoaded([review], { messages: { save: "Speichern" } });
    fireEvent.click(eventButton("Design review"));

    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
