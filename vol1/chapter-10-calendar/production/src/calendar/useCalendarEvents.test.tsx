/*
 * NOT PART OF THE INTERVIEW: production version.
 * The hook is tested without drawing anything. The test answers each request
 * by hand, so it decides which answer arrives first.
 */
import { act, renderHook } from "@testing-library/react";
import { FakeBroadcastChannel, at, createManualServer, makeEvent } from "./testHelpers";
import type { ManualServer } from "./testHelpers";
import { ConflictError, OfflineError } from "./types";
import type { CalendarLogEvent } from "./types";
import { useCalendarEvents } from "./useCalendarEvents";
import type { UseCalendarEventsOptions } from "./useCalendarEvents";

const WEEK_MS = 7 * 24 * 3_600_000;
/** Monday 2 March 2026 in UTC. The hook does not care about time zones: it gets timestamps. */
const WEEK_0 = Date.UTC(2026, 2, 2);
/** The four week starts the calendar passes when the visible week is `WEEK_0 + index weeks`. */
const weeksAt = (index: number) => [-1, 0, 1, 2].map((plus) => WEEK_0 + (index + plus) * WEEK_MS);
const iso = (timestamp: number) => new Date(timestamp).toISOString();

const review = makeEvent("review", at(10), at(11), "Design review");
const lunch = makeEvent("lunch", at(12), at(13), "Lunch");

/** Lets every promise that is ready run, and lets React finish its updates. */
async function settle(): Promise<void> {
  await act(async () => {
    // The queue of edits has a few steps between two requests.
    for (let turn = 0; turn < 20; turn++) {
      await Promise.resolve();
    }
  });
}

type Extra = Partial<Pick<UseCalendarEventsOptions, "storageKey" | "timeoutMs" | "onEvent">>;

function renderCalendarHook(server: ManualServer, extra: Extra = {}) {
  return renderHook(
    ({ weeks }) =>
      useCalendarEvents({ weeks, storageKey: null, timeoutMs: 10_000, ...server, ...extra }),
    { initialProps: { weeks: weeksAt(0) } },
  );
}

/** Renders the hook and answers the load of the visible week with these events. */
async function renderLoaded(server: ManualServer, events = [review, lunch], extra: Extra = {}) {
  const hook = renderCalendarHook(server, extra);
  await settle();
  server.loads[0].resolve(events);
  await settle();
  return hook;
}

/** The start of the range of every load so far, as week numbers. Week 0 is the first visible week. */
const loadedWeeks = (server: ManualServer) =>
  server.loads.map((load) => (Date.parse(load.args.rangeStart) - WEEK_0) / WEEK_MS);

describe("useCalendarEvents: loading the visible week", () => {
  it("asks the server for the visible week, as ISO strings in UTC", () => {
    const server = createManualServer();
    renderCalendarHook(server);

    expect(server.loads).toHaveLength(1);
    expect(server.loads[0].args).toEqual({
      rangeStart: iso(WEEK_0),
      rangeEnd: iso(WEEK_0 + WEEK_MS),
    });
  });

  it("is loading until the server answers, then holds the events", async () => {
    const server = createManualServer();
    const { result } = renderCalendarHook(server);

    expect(result.current.status).toBe("loading");
    expect(result.current.events).toEqual([]);

    server.loads[0].resolve([review]);
    await settle();

    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([review]);
  });

  it("reports an error when the load fails, and loads again on retry", async () => {
    const server = createManualServer();
    const { result } = renderCalendarHook(server);

    server.loads[0].reject(new Error("offline"));
    await settle();
    expect(result.current.status).toBe("error");
    expect(server.loads).toHaveLength(1);

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    expect(loadedWeeks(server)).toEqual([0, 0]);

    server.loads[1].resolve([review]);
    await settle();
    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([review]);
  });

  it("does not load again when the parent passes new functions and a new array for the same week", () => {
    const server = createManualServer();
    const { rerender } = renderHook(
      ({ fetchEvents }) =>
        useCalendarEvents({
          weeks: weeksAt(0),
          storageKey: null,
          timeoutMs: 10_000,
          ...server,
          fetchEvents,
        }),
      { initialProps: { fetchEvents: server.fetchEvents } },
    );

    rerender({ fetchEvents: (...args) => server.fetchEvents(...args) });

    expect(server.loads).toHaveLength(1);
  });

  it("aborts the load when the calendar is removed", () => {
    const server = createManualServer();
    const { unmount } = renderCalendarHook(server);

    unmount();

    expect(server.loads[0].signal.aborted).toBe(true);
  });
});

describe("useCalendarEvents: the cache of weeks", () => {
  it("loads the week before and the week after, but only after the visible week has arrived", async () => {
    const server = createManualServer();
    renderCalendarHook(server);
    expect(loadedWeeks(server)).toEqual([0]);

    server.loads[0].resolve([review]);
    await settle();

    expect(loadedWeeks(server)).toEqual([0, -1, 1]);
    expect(server.loads[2].args).toEqual({
      rangeStart: iso(WEEK_0 + WEEK_MS),
      rangeEnd: iso(WEEK_0 + 2 * WEEK_MS),
    });
  });

  it("is not loading while only the neighbour weeks are on their way", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);

    expect(server.loads).toHaveLength(3);
    expect(result.current.status).toBe("ready");
  });

  it("shows the next week at once when it was loaded ahead, with no request for it", async () => {
    const server = createManualServer();
    const nextWeekEvent = makeEvent("offsite", at(10, 0, 10), at(11, 0, 10));
    const { result, rerender } = await renderLoaded(server, [review]);
    server.loads[1].resolve([]);
    server.loads[2].resolve([nextWeekEvent]);
    await settle();

    rerender({ weeks: weeksAt(1) });

    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([review, nextWeekEvent]);
    // Weeks 0 and 1 are known. Only the week after the new one is asked for.
    await settle();
    expect(loadedWeeks(server)).toEqual([0, -1, 1, 2]);
  });

  it("sends no request at all when the user goes back to a week seen before", async () => {
    const server = createManualServer();
    const { rerender } = await renderLoaded(server, [review]);
    server.loads[1].resolve([]);
    server.loads[2].resolve([]);
    await settle();
    rerender({ weeks: weeksAt(1) });
    await settle();
    server.loads[3].resolve([]);
    await settle();

    rerender({ weeks: weeksAt(0) });
    await settle();

    expect(server.loads).toHaveLength(4);
  });

  it("keeps one copy of an event that crosses two weeks and so arrives twice", async () => {
    const server = createManualServer();
    const long = makeEvent("conference", at(9, 0, 7), at(18, 0, 10));
    const { result } = await renderLoaded(server, [long]);

    server.loads[2].resolve([long]);
    await settle();

    expect(result.current.events).toEqual([long]);
  });

  it("stays quiet when a neighbour week fails, and asks for it again later", async () => {
    const server = createManualServer();
    const { result, rerender } = await renderLoaded(server, [review]);

    server.loads[2].reject(new Error("500"));
    await settle();
    expect(result.current.status).toBe("ready");

    // The failure was not kept: the week is asked for again when the user goes there.
    rerender({ weeks: weeksAt(1) });
    expect(result.current.status).toBe("loading");
    expect(loadedWeeks(server)).toEqual([0, -1, 1, 1]);
  });
});

describe("useCalendarEvents: moving fast", () => {
  it("aborts the old request when the week changes", () => {
    const server = createManualServer();
    const { rerender } = renderCalendarHook(server);

    rerender({ weeks: weeksAt(5) });

    expect(server.loads).toHaveLength(2);
    expect(server.loads[0].signal.aborted).toBe(true);
    expect(server.loads[1].signal.aborted).toBe(false);
  });

  it("aborts the requests for the neighbour weeks too", async () => {
    const server = createManualServer();
    const { rerender } = await renderLoaded(server);

    rerender({ weeks: weeksAt(5) });

    expect(server.loads[1].signal.aborted).toBe(true);
    expect(server.loads[2].signal.aborted).toBe(true);
  });

  it("leaves one request alive after ten quick steps", () => {
    const server = createManualServer();
    const { rerender } = renderCalendarHook(server);

    for (let index = 1; index <= 10; index++) {
      rerender({ weeks: weeksAt(index) });
    }

    expect(server.loads).toHaveLength(11);
    expect(server.loads.filter((load) => !load.signal.aborted)).toHaveLength(1);
  });

  it("ignores an old answer that arrives while the newer request is still loading", async () => {
    const server = createManualServer();
    const { result, rerender } = renderCalendarHook(server);
    rerender({ weeks: weeksAt(5) });

    server.loads[0].resolve([review]);
    await settle();

    expect(result.current.status).toBe("loading");
    expect(result.current.events).toEqual([]);
    // The old answer started no loads of its own.
    expect(server.loads).toHaveLength(2);
  });

  it("does not show an error for a request that it aborted itself", async () => {
    const server = createManualServer();
    const { result, rerender } = renderCalendarHook(server);
    rerender({ weeks: weeksAt(5) });

    server.loads[0].reject(new DOMException("Aborted", "AbortError"));
    await settle();

    expect(result.current.status).toBe("loading");
  });

  it("asks again for a week whose request was aborted, because that answer was thrown away", async () => {
    const server = createManualServer();
    const { result, rerender } = renderCalendarHook(server);
    rerender({ weeks: weeksAt(5) });
    server.loads[0].resolve([review]);
    await settle();

    rerender({ weeks: weeksAt(0) });

    expect(result.current.status).toBe("loading");
    expect(loadedWeeks(server)).toEqual([0, 5, 0]);
  });
});

describe("useCalendarEvents: saving", () => {
  it("shows a new event at once, before the server answers", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);

    act(() => result.current.save(lunch));

    expect(result.current.events).toEqual([review, lunch]);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].args).toEqual(lunch);
  });

  it("shows a changed event at once, in place of the old one", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    const moved = { ...review, start: at(15), end: at(16) };

    act(() => result.current.save(moved));

    expect(result.current.events).toEqual([moved, lunch]);
  });

  it("keeps the event as the server stored it", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save(lunch));

    const stored = { ...lunch, title: "Lunch (room 4)" };
    server.saves[0].resolve(stored);
    await settle();

    expect(result.current.events).toEqual([review, stored]);
    expect(result.current.problem).toBeNull();
  });

  it("takes a new event away again when the save fails, and says so", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save(lunch));

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([review]);
    expect(result.current.problem).toBe("failed");
  });

  it("puts a changed event back as it was when the save fails", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.save({ ...review, start: at(15), end: at(16) }));

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([review, lunch]);
    expect(result.current.problem).toBe("failed");
  });

  it("clears the failure message when the user makes the next edit", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.save({ ...review, title: "Review 2" }));
    server.saves[0].reject(new Error("500"));
    await settle();

    act(() => result.current.save({ ...review, title: "Review 3" }));

    expect(result.current.problem).toBeNull();
  });

  it("does not load again after a save", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.save({ ...review, title: "Review 2" }));
    server.saves[0].resolve({ ...review, title: "Review 2" });
    await settle();

    // One load for the visible week and two for its neighbours. No more.
    expect(server.loads).toHaveLength(3);
  });
});

describe("useCalendarEvents: deleting", () => {
  it("hides the event at once and asks the server to delete it", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);

    act(() => result.current.remove("review"));

    expect(result.current.events).toEqual([lunch]);
    expect(server.deletes[0].args).toBe("review");
  });

  it("keeps the event away after the server confirms", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.remove("review"));

    server.deletes[0].resolve();
    await settle();

    expect(result.current.events).toEqual([lunch]);
    expect(result.current.problem).toBeNull();
  });

  it("brings the event back when the delete fails, and says so", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.remove("review"));

    server.deletes[0].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([review, lunch]);
    expect(result.current.problem).toBe("failed");
  });
});

describe("useCalendarEvents: two edits at once", () => {
  it("sends the second edit of an event after the first, never both at once", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    const first = { ...review, title: "First" };
    const second = { ...review, title: "Second" };

    act(() => result.current.save(first));
    act(() => result.current.save(second));
    await settle();

    // The newest edit is on screen. Only the first one is on its way.
    expect(result.current.events).toEqual([second]);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].signal.aborted).toBe(false);

    server.saves[0].resolve({ ...first, updatedAt: "2026-03-03T09:00:00.000Z" });
    await settle();

    expect(server.saves).toHaveLength(2);
    expect(server.saves[1].args).toEqual({ ...second, updatedAt: "2026-03-03T09:00:00.000Z" });
    expect(result.current.events[0].title).toBe("Second");
  });

  it("goes back to what the server confirmed when the second edit fails", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    const first = { ...review, title: "First" };
    act(() => result.current.save(first));
    act(() => result.current.save({ ...review, title: "Second" }));
    await settle();
    server.saves[0].resolve(first);
    await settle();

    server.saves[1].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([first]);
    expect(result.current.problem).toBe("failed");
  });

  it("sends edits of two different events one after the other, in the order they were made", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    const newReview = { ...review, title: "Review 2" };
    const newLunch = { ...lunch, title: "Lunch 2" };
    act(() => result.current.save(newReview));
    act(() => result.current.save(newLunch));
    await settle();
    expect(server.saves.map((save) => save.args.id)).toEqual(["review"]);

    server.saves[0].reject(new Error("500"));
    await settle();
    expect(result.current.events).toEqual([review, newLunch]);
    expect(server.saves.map((save) => save.args.id)).toEqual(["review", "lunch"]);

    server.saves[1].resolve(newLunch);
    await settle();
    expect(result.current.events).toEqual([review, newLunch]);
  });

  it("needs no request when a new event is deleted before its save was sent", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save({ ...review, title: "Busy" }));
    await settle();

    act(() => result.current.save(lunch));
    act(() => result.current.remove("lunch"));
    await settle();

    expect(result.current.events.map((event) => event.id)).toEqual(["review"]);
    server.saves[0].resolve({ ...review, title: "Busy" });
    await settle();
    expect(server.saves).toHaveLength(1);
    expect(server.deletes).toHaveLength(0);
  });
});

describe("useCalendarEvents: loads and edits together", () => {
  it("keeps an unanswered edit on top of a load that finishes later", async () => {
    const server = createManualServer();
    const { result, rerender } = await renderLoaded(server, [review]);
    const moved = { ...review, title: "Moved" };
    act(() => result.current.save(moved));

    rerender({ weeks: weeksAt(5) });
    server.loads[3].resolve([review, lunch]);
    await settle();

    expect(result.current.events).toEqual([moved, lunch]);
  });

  it("does not abort a save when the calendar is removed, so the edit still reaches the server", async () => {
    const server = createManualServer();
    const { result, unmount } = await renderLoaded(server, [review]);
    act(() => result.current.save(lunch));
    await settle();

    unmount();

    expect(server.saves[0].signal.aborted).toBe(false);
  });

  it("keeps the newer copy when a slow load brings an older copy of an event", async () => {
    const server = createManualServer();
    const old = { ...review, updatedAt: "2026-03-03T08:00:00.000Z" };
    const { result } = await renderLoaded(server, [old]);
    // The week after is still loading. It will bring the old copy again.
    act(() => result.current.save({ ...old, title: "New title" }));
    await settle();
    const saved = { ...old, title: "New title", updatedAt: "2026-03-03T09:00:00.000Z" };
    server.saves[0].resolve(saved);
    await settle();

    server.loads[2].resolve([old]);
    await settle();

    expect(result.current.events).toEqual([saved]);
  });

  it("takes the newer copy from a load", async () => {
    const server = createManualServer();
    const old = { ...review, updatedAt: "2026-03-03T08:00:00.000Z" };
    const { result } = await renderLoaded(server, [old]);
    const newer = { ...old, title: "Changed by Asha", updatedAt: "2026-03-03T09:00:00.000Z" };

    server.loads[2].resolve([newer]);
    await settle();

    expect(result.current.events).toEqual([newer]);
  });
});

describe("useCalendarEvents: several weeks at once (the month view)", () => {
  /** A month view of six weeks passes 9 week starts: one before, six visible, one after, and its end. */
  const monthAt = (index: number) =>
    Array.from({ length: 9 }, (_, plus) => WEEK_0 + (index + plus - 1) * WEEK_MS);

  it("asks for six weeks in one request", async () => {
    const server = createManualServer();
    const { rerender } = renderCalendarHook(server);
    rerender({ weeks: monthAt(10) });

    expect(server.loads[1].args).toEqual({
      rangeStart: iso(WEEK_0 + 10 * WEEK_MS),
      rangeEnd: iso(WEEK_0 + 16 * WEEK_MS),
    });
  });

  it("asks only for the weeks it does not have, one request for each gap", async () => {
    const server = createManualServer();
    const { result, rerender } = await renderLoaded(server, [review]);
    server.loads[1].resolve([]);
    server.loads[2].resolve([]);
    await settle();
    // Weeks -1, 0 and 1 are loaded. This month is weeks 0 to 5.
    rerender({ weeks: monthAt(0) });

    expect(result.current.status).toBe("loading");
    expect(server.loads).toHaveLength(4);
    expect(server.loads[3].args).toEqual({
      rangeStart: iso(WEEK_0 + 2 * WEEK_MS),
      rangeEnd: iso(WEEK_0 + 6 * WEEK_MS),
    });
  });

  it("is ready at once when every week of the month is already loaded", async () => {
    const server = createManualServer();
    const { result, rerender } = renderCalendarHook(server);
    rerender({ weeks: monthAt(0) });
    await settle();
    server.loads[1].resolve([review]);
    await settle();

    rerender({ weeks: weeksAt(3) });

    expect(result.current.status).toBe("ready");
  });
});

describe("useCalendarEvents: time limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports an error when the load takes longer than the limit, and aborts it", async () => {
    const server = createManualServer();
    const { result } = renderCalendarHook(server, { timeoutMs: 3000 });
    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(result.current.status).toBe("loading");

    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(result.current.status).toBe("error");
    expect(server.loads[0].signal.aborted).toBe(true);
  });

  it("keeps an edit and waits when its request takes longer than the limit", async () => {
    const server = createManualServer();
    const { result } = renderCalendarHook(server, { timeoutMs: 3000 });
    await act(() => vi.advanceTimersByTimeAsync(0));
    server.loads[0].resolve([review]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.save({ ...review, title: "Slow" }));

    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(result.current.waitingCount).toBe(1);
    expect(result.current.events[0].title).toBe("Slow");
    expect(result.current.problem).toBeNull();
  });
});

describe("useCalendarEvents: conflicts", () => {
  it("shows the server's version and tells the user when someone else changed the event first", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    const theirs = { ...review, title: "Changed by Asha", updatedAt: "2026-03-03T09:00:00.000Z" };
    act(() => result.current.save({ ...review, title: "Mine" }));
    await settle();

    server.saves[0].reject(new ConflictError(theirs));
    await settle();

    expect(result.current.events).toEqual([theirs]);
    expect(result.current.problem).toBe("conflict");
  });

  it("removes the event when the conflict is that someone else deleted it", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save({ ...review, title: "Mine" }));
    await settle();

    server.saves[0].reject(new ConflictError(null));
    await settle();

    expect(result.current.events).toEqual([]);
    expect(result.current.problem).toBe("conflict");
  });

  it("sends the `updatedAt` it got from the server back with the next save", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save({ ...review, title: "One" }));
    await settle();
    const stored = { ...review, title: "One", updatedAt: "2026-03-03T09:00:00.000Z" };
    server.saves[0].resolve(stored);
    await settle();

    act(() => result.current.save({ ...result.current.events[0], title: "Two" }));
    await settle();

    expect(server.saves[1].args.updatedAt).toBe("2026-03-03T09:00:00.000Z");
  });
});

describe("useCalendarEvents: offline", () => {
  async function renderOffline(server: ManualServer) {
    const hook = await renderLoaded(server, [review]);
    act(() => hook.result.current.save({ ...review, title: "Offline edit" }));
    await settle();
    server.saves[0].reject(new OfflineError());
    await settle();
    return hook;
  }

  it("keeps the edit on screen, shows no error, and counts it as waiting", async () => {
    const server = createManualServer();
    const { result } = await renderOffline(server);

    expect(result.current.events[0].title).toBe("Offline edit");
    expect(result.current.problem).toBeNull();
    expect(result.current.waitingCount).toBe(1);
  });

  it("counts every edit that waits", async () => {
    const server = createManualServer();
    const { result } = await renderOffline(server);

    act(() => result.current.save(lunch));
    await settle();
    server.saves[1].reject(new OfflineError());
    await settle();

    expect(result.current.waitingCount).toBe(2);
  });

  it("sends the edit again when the browser says it is online", async () => {
    const server = createManualServer();
    const { result } = await renderOffline(server);

    act(() => void window.dispatchEvent(new Event("online")));
    await settle();
    expect(server.saves).toHaveLength(2);
    expect(server.saves[1].args.title).toBe("Offline edit");

    server.saves[1].resolve({ ...review, title: "Offline edit" });
    await settle();
    expect(result.current.waitingCount).toBe(0);
    expect(result.current.events[0].title).toBe("Offline edit");
  });

  it("sends the edit again when the tab is shown again", async () => {
    const server = createManualServer();
    await renderOffline(server);

    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await settle();

    expect(server.saves).toHaveLength(2);
  });

  it("sends the edit again when the user presses 'Send now'", async () => {
    const server = createManualServer();
    const { result } = await renderOffline(server);

    act(() => result.current.sendNow());
    await settle();

    expect(server.saves).toHaveLength(2);
  });

  it("does not read navigator.onLine: it sends even when the browser says it is offline", async () => {
    const server = createManualServer();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = await renderLoaded(server, [review]);

    act(() => result.current.save(lunch));
    await settle();

    expect(server.saves).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("stops listening for 'online' when the calendar is removed", async () => {
    const server = createManualServer();
    const { unmount } = await renderOffline(server);

    unmount();
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(server.saves).toHaveLength(1);
  });
});

describe("useCalendarEvents: the saved queue", () => {
  const KEY = "calendar-queue:test";

  it("keeps a waiting edit in localStorage", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review], { storageKey: "test" });
    act(() => result.current.save(lunch));
    await settle();
    server.saves[0].reject(new OfflineError());
    await settle();

    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: "lunch", action: "create" });
  });

  it("shows and sends the edits of the last visit when the calendar starts", async () => {
    const waiting = { id: "lunch", event: lunch, action: "create", by: "form", startedAt: 1 };
    window.localStorage.setItem(KEY, JSON.stringify([waiting]));
    const server = createManualServer();

    const { result } = await renderLoaded(server, [review], { storageKey: "test" });

    expect(result.current.events).toEqual([review, lunch]);
    expect(server.saves).toHaveLength(1);
    expect(server.saves[0].args).toEqual(lunch);
  });

  it("empties the saved queue when the server has answered", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review], { storageKey: "test" });
    act(() => result.current.save(lunch));
    await settle();
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toHaveLength(1);

    server.saves[0].resolve(lunch);
    await settle();

    expect(window.localStorage.getItem(KEY)).toBe("[]");
  });

  it("saves nothing when the storage key is null", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);

    act(() => result.current.save(lunch));
    await settle();

    expect(window.localStorage.length).toBe(0);
  });
});

describe("useCalendarEvents: other tabs", () => {
  beforeEach(() => {
    FakeBroadcastChannel.open = [];
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tells the other tabs about an event the server confirmed, and they show it", async () => {
    const [serverOne, serverTwo] = [createManualServer(), createManualServer()];
    const one = await renderLoaded(serverOne, [review], { storageKey: "tabs" });
    const two = await renderLoaded(serverTwo, [review], { storageKey: "tabs" });
    const moved = { ...review, title: "Moved", updatedAt: "2026-03-03T09:00:00.000Z" };

    act(() => one.result.current.save(moved));
    await settle();
    // Not confirmed yet: the other tab still shows the old event.
    expect(two.result.current.events).toEqual([review]);
    serverOne.saves[0].resolve(moved);
    await settle();

    expect(two.result.current.events).toEqual([moved]);
    expect(serverTwo.saves).toHaveLength(0);
  });

  it("tells the other tabs about a delete", async () => {
    const [serverOne, serverTwo] = [createManualServer(), createManualServer()];
    const one = await renderLoaded(serverOne, [review, lunch], { storageKey: "tabs" });
    const two = await renderLoaded(serverTwo, [review, lunch], { storageKey: "tabs" });

    act(() => one.result.current.remove("review"));
    await settle();
    serverOne.deletes[0].resolve();
    await settle();

    expect(two.result.current.events).toEqual([lunch]);
  });

  it("does not tell the other tabs about an edit that failed", async () => {
    const [serverOne, serverTwo] = [createManualServer(), createManualServer()];
    const one = await renderLoaded(serverOne, [review], { storageKey: "tabs" });
    const two = await renderLoaded(serverTwo, [review], { storageKey: "tabs" });

    act(() => one.result.current.save({ ...review, title: "Refused" }));
    await settle();
    serverOne.saves[0].reject(new Error("500"));
    await settle();

    expect(two.result.current.events).toEqual([review]);
  });

  it("keeps calendars with different storage keys apart", async () => {
    const [serverOne, serverTwo] = [createManualServer(), createManualServer()];
    const one = await renderLoaded(serverOne, [review], { storageKey: "work" });
    const two = await renderLoaded(serverTwo, [review], { storageKey: "home" });

    act(() => one.result.current.save(lunch));
    await settle();
    serverOne.saves[0].resolve(lunch);
    await settle();

    expect(two.result.current.events).toEqual([review]);
  });

  it("closes the channel when the calendar is removed", async () => {
    const server = createManualServer();
    const { unmount } = await renderLoaded(server, [review], { storageKey: "tabs" });
    expect(FakeBroadcastChannel.open).toHaveLength(1);

    unmount();

    expect(FakeBroadcastChannel.open).toHaveLength(0);
  });

  it("opens no channel when the storage key is null", async () => {
    await renderLoaded(createManualServer(), [review]);

    expect(FakeBroadcastChannel.open).toHaveLength(0);
  });
});

describe("useCalendarEvents: monitoring", () => {
  function setUp() {
    const log: CalendarLogEvent[] = [];
    const server = createManualServer();
    return { log, server, extra: { onEvent: (event: CalendarLogEvent) => void log.push(event) } };
  }
  const ofType = (log: CalendarLogEvent[], type: CalendarLogEvent["type"]) =>
    log.filter((event) => event.type === type);

  it("reports each answered load, with the number of weeks and of events", async () => {
    const { log, server, extra } = setUp();
    await renderLoaded(server, [review, lunch], extra);

    expect(log).toEqual([
      { type: "events_loaded", weekCount: 1, eventCount: 2, durationMs: expect.any(Number) },
    ]);
  });

  it("reports a new event, a changed event and a deleted event, each with how long it took", async () => {
    const { log, server, extra } = setUp();
    const { result } = await renderLoaded(server, [review], extra);

    act(() => result.current.save(lunch));
    await settle();
    server.saves[0].resolve(lunch);
    await settle();
    act(() => result.current.save({ ...review, title: "Moved" }, "drag"));
    await settle();
    server.saves[1].resolve({ ...review, title: "Moved" });
    await settle();
    act(() => result.current.remove("lunch"));
    await settle();
    server.deletes[0].resolve();
    await settle();

    expect(log.slice(1)).toEqual([
      { type: "event_created", durationMs: expect.any(Number) },
      { type: "event_moved", by: "drag", durationMs: expect.any(Number) },
      { type: "event_deleted", durationMs: expect.any(Number) },
    ]);
  });

  it("reports a refused save and a conflict as save_failed, with the reason", async () => {
    const { log, server, extra } = setUp();
    const { result } = await renderLoaded(server, [review], extra);

    act(() => result.current.save({ ...review, title: "One" }));
    await settle();
    server.saves[0].reject(new Error("500"));
    await settle();
    act(() => result.current.save({ ...review, title: "Two" }));
    await settle();
    server.saves[1].reject(new ConflictError(review));
    await settle();

    expect(ofType(log, "save_failed")).toEqual([
      { type: "save_failed", reason: "server", durationMs: expect.any(Number) },
      { type: "save_failed", reason: "conflict", durationMs: expect.any(Number) },
    ]);
  });

  it("reports once that edits are waiting, not once for each try", async () => {
    const { log, server, extra } = setUp();
    const { result } = await renderLoaded(server, [review], extra);
    act(() => result.current.save(lunch));
    await settle();
    server.saves[0].reject(new OfflineError());
    await settle();

    expect(ofType(log, "save_queued")).toEqual([{ type: "save_queued", queueLength: 1 }]);
  });

  it("measures the time from the user's action to the answer", async () => {
    vi.useFakeTimers();
    const { log, server, extra } = setUp();
    const { result } = renderCalendarHook(server, extra);
    await act(() => vi.advanceTimersByTimeAsync(0));
    server.loads[0].resolve([review]);
    await act(() => vi.advanceTimersByTimeAsync(0));

    act(() => result.current.save(lunch));
    await act(() => vi.advanceTimersByTimeAsync(420));
    server.saves[0].resolve(lunch);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(ofType(log, "event_created")).toEqual([{ type: "event_created", durationMs: 420 }]);
    vi.useRealTimers();
  });

  it("never puts a title, an id or a date of the user in an event", async () => {
    const { log, server, extra } = setUp();
    const secret = makeEvent("secret-id-42", at(10), at(11), "Salary talk with Asha");
    const { result } = await renderLoaded(server, [secret], extra);

    act(() => result.current.save({ ...secret, title: "Salary talk, moved" }, "keyboard"));
    await settle();
    server.saves[0].reject(new ConflictError(secret));
    await settle();
    act(() => result.current.save(lunch));
    await settle();
    server.saves[1].reject(new OfflineError());
    await settle();
    act(() => result.current.sendNow());
    await settle();
    server.saves[2].reject(new Error("500"));
    await settle();
    act(() => result.current.remove("secret-id-42"));
    await settle();
    server.deletes[0].resolve();
    await settle();

    expect(log.map((event) => event.type)).toEqual([
      "events_loaded",
      "save_failed",
      "save_queued",
      "save_failed",
      "event_deleted",
    ]);
    const everything = JSON.stringify(log);
    expect(everything).not.toMatch(/Salary|Asha|Lunch|secret-id-42|lunch|2026-03/);
    for (const event of log) {
      for (const value of Object.values(event)) {
        // Every value is a number or one of a few fixed words.
        expect(typeof value === "number" || /^[a-z_]+$/.test(String(value))).toBe(true);
      }
    }
  });
});
