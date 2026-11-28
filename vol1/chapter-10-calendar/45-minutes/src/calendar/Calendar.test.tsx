/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 *
 * Every date is built in local time, so the tests pass in any time zone.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Calendar } from "./Calendar";
import { HOUR_HEIGHT } from "./layoutDay";
import { at, createManualServer, makeEvent } from "./testHelpers";
import type { ManualServer } from "./testHelpers";
import type { CalendarEvent } from "./types";

const NOON = new Date(2026, 2, 3, 12).getTime();
const NEXT_NOON = new Date(2026, 2, 4, 12).getTime();
/** Some versions of the language data put a comma after the weekday. */
const DAY = "Tuesday,? 3 March 2026";

const review = makeEvent("review", at(10), at(11), "Design review");
const budget = makeEvent("budget", at(10, 30), at(12), "Budget call");
const interview = makeEvent("interview", at(11), at(12), "Interview");

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderCalendar(server: ManualServer, date = NOON) {
  return render(<Calendar date={date} locale="en-GB" {...server} />);
}

/** Draws the calendar and answers the first load with these events. */
async function renderLoaded(events: CalendarEvent[] = [review]) {
  const server = createManualServer();
  const view = renderCalendar(server);
  server.loads[0].resolve(events);
  await settle();
  return { server, ...view };
}

const eventButton = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title},`) });
const queryEventButton = (title: string) =>
  screen.queryByRole("button", { name: new RegExp(`^${title},`) });
const slot = (time: string) => within(screen.getByRole("grid")).getByRole("button", { name: time });
const eventList = () => screen.getByRole("list");
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const box = (title: string) => eventButton(title).parentElement as HTMLLIElement;

describe("Calendar: the day", () => {
  it("draws 24 slots of one hour, named by their time", async () => {
    await renderLoaded([]);
    const slots = within(screen.getByRole("grid")).getAllByRole("button");

    expect(slots).toHaveLength(24);
    expect(slots[0]).toHaveTextContent("00:00");
    expect(slots[23]).toHaveTextContent("23:00");
  });

  it("names the grid and the list after the day", async () => {
    await renderLoaded([]);

    expect(screen.getByRole("grid")).toHaveAccessibleName(new RegExp(`^New event, ${DAY}$`));
    expect(eventList()).toHaveAccessibleName(new RegExp(`^Events, ${DAY}$`));
  });

  it("uses a 12 hour clock when the locale does", async () => {
    const server = createManualServer();
    render(<Calendar date={NOON} locale="en-US" {...server} />);

    expect(within(screen.getByRole("grid")).getAllByRole("button")[15]).toHaveTextContent(
      /^3:00\sPM$/,
    );
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
    const server = createManualServer();
    renderCalendar(server, NEXT_NOON);
    server.loads[0].resolve([makeEvent("flight", at(22), at(26), "Flight")]);
    await settle();

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
    renderCalendar(server);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    server.loads[0].resolve([]);
    await settle();

    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("shows an error with 'Try again' when the load fails, and loads again", async () => {
    const server = createManualServer();
    renderCalendar(server);
    server.loads[0].reject(new Error("offline"));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the events.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    server.loads[1].resolve([review]);
    await settle();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(eventButton("Design review")).toBeInTheDocument();
  });

  it("loads the new day when the date changes, and aborts the old request", async () => {
    const server = createManualServer();
    const { rerender } = renderCalendar(server);

    rerender(<Calendar date={NEXT_NOON} locale="en-GB" {...server} />);

    expect(server.loads[0].signal.aborted).toBe(true);
    expect(server.loads[1].args.rangeStart).toBe(new Date(2026, 2, 4).toISOString());
    expect(screen.getByRole("grid")).toHaveAccessibleName(/Wednesday,? 4 March 2026/);
  });

  it("does not load again when the date changes inside the same day", async () => {
    const server = createManualServer();
    const { rerender } = renderCalendar(server);

    rerender(<Calendar date={NOON + 60_000} locale="en-GB" {...server} />);

    expect(server.loads).toHaveLength(1);
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
