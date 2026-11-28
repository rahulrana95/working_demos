/*
 * NOT PART OF THE INTERVIEW.
 * The hook is tested without drawing anything. The test answers each request
 * by hand, so it decides which answer arrives first.
 */
import { act, renderHook } from "@testing-library/react";
import { at, createManualServer, makeEvent } from "./testHelpers";
import type { ManualServer } from "./testHelpers";
import { useCalendarEvents } from "./useCalendarEvents";

const DAY_3 = new Date(2026, 2, 3).getTime();
const DAY_4 = new Date(2026, 2, 4).getTime();
const DAY_5 = new Date(2026, 2, 5).getTime();

const review = makeEvent("review", at(10), at(11), "Design review");
const lunch = makeEvent("lunch", at(12), at(13), "Lunch");

/** Lets every promise that is ready run, and lets React finish its updates. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderCalendarHook(server: ManualServer) {
  return renderHook(
    ({ rangeStart, rangeEnd }) => useCalendarEvents({ rangeStart, rangeEnd, ...server }),
    { initialProps: { rangeStart: DAY_3, rangeEnd: DAY_4 } },
  );
}

/** Renders the hook and answers the first load with these events. */
async function renderLoaded(server: ManualServer, events = [review, lunch]) {
  const hook = renderCalendarHook(server);
  server.loads[0].resolve(events);
  await settle();
  return hook;
}

describe("useCalendarEvents: loading", () => {
  it("asks the server for the visible range, as ISO strings in UTC", () => {
    const server = createManualServer();
    renderCalendarHook(server);

    expect(server.loads).toHaveLength(1);
    expect(server.loads[0].args).toEqual({
      rangeStart: new Date(DAY_3).toISOString(),
      rangeEnd: new Date(DAY_4).toISOString(),
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

  it("aborts the old request when the range changes", () => {
    const server = createManualServer();
    const { rerender } = renderCalendarHook(server);

    rerender({ rangeStart: DAY_4, rangeEnd: DAY_5 });

    expect(server.loads).toHaveLength(2);
    expect(server.loads[0].signal.aborted).toBe(true);
    expect(server.loads[1].signal.aborted).toBe(false);
  });

  it("ignores an old answer that arrives after a newer one", async () => {
    const server = createManualServer();
    const { result, rerender } = renderCalendarHook(server);
    rerender({ rangeStart: DAY_4, rangeEnd: DAY_5 });

    server.loads[1].resolve([lunch]);
    await settle();
    server.loads[0].resolve([review]);
    await settle();

    expect(result.current.events).toEqual([lunch]);
  });

  it("ignores an old answer that arrives while the newer request is still loading", async () => {
    const server = createManualServer();
    const { result, rerender } = renderCalendarHook(server);
    rerender({ rangeStart: DAY_4, rangeEnd: DAY_5 });

    server.loads[0].resolve([review]);
    await settle();

    expect(result.current.status).toBe("loading");
    expect(result.current.events).toEqual([]);
  });

  it("does not show an error for a request that it aborted itself", async () => {
    const server = createManualServer();
    const { result, rerender } = renderCalendarHook(server);
    rerender({ rangeStart: DAY_4, rangeEnd: DAY_5 });

    server.loads[0].reject(new DOMException("Aborted", "AbortError"));
    await settle();

    expect(result.current.status).toBe("loading");
  });

  it("reports an error when the load fails, and loads again on retry", async () => {
    const server = createManualServer();
    const { result } = renderCalendarHook(server);

    server.loads[0].reject(new Error("offline"));
    await settle();
    expect(result.current.status).toBe("error");

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    expect(server.loads).toHaveLength(2);

    server.loads[1].resolve([review]);
    await settle();
    expect(result.current.status).toBe("ready");
    expect(result.current.events).toEqual([review]);
  });

  it("does not load again when the parent passes new functions with the same range", () => {
    const server = createManualServer();
    const { rerender } = renderHook(
      ({ fetchEvents }) =>
        useCalendarEvents({ rangeStart: DAY_3, rangeEnd: DAY_4, ...server, fetchEvents }),
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

    expect(result.current.events).toEqual([lunch, moved]);
  });

  it("keeps the event as the server stored it", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save(lunch));

    const stored = { ...lunch, title: "Lunch (room 4)" };
    server.saves[0].resolve(stored);
    await settle();

    expect(result.current.events).toEqual([review, stored]);
    expect(result.current.saveFailed).toBe(false);
  });

  it("takes a new event away again when the save fails, and says so", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save(lunch));

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([review]);
    expect(result.current.saveFailed).toBe(true);
  });

  it("puts a changed event back as it was when the save fails", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.save({ ...review, start: at(15), end: at(16) }));

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([review, lunch]);
    expect(result.current.saveFailed).toBe(true);
  });

  it("clears the failure message when the user makes the next edit", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.save({ ...review, title: "Review 2" }));
    server.saves[0].reject(new Error("500"));
    await settle();

    act(() => result.current.save({ ...review, title: "Review 3" }));

    expect(result.current.saveFailed).toBe(false);
  });

  it("does not load again after a save", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.save({ ...review, title: "Review 2" }));
    server.saves[0].resolve({ ...review, title: "Review 2" });
    await settle();

    expect(server.loads).toHaveLength(1);
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
    expect(result.current.saveFailed).toBe(false);
  });

  it("brings the event back when the delete fails, and says so", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    act(() => result.current.remove("review"));

    server.deletes[0].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([review, lunch]);
    expect(result.current.saveFailed).toBe(true);
  });
});

describe("useCalendarEvents: two edits at once", () => {
  it("lets a second edit of the same event replace the first, and aborts the first request", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    const first = { ...review, title: "First" };
    const second = { ...review, title: "Second" };

    act(() => result.current.save(first));
    act(() => result.current.save(second));

    expect(server.saves[0].signal.aborted).toBe(true);
    expect(server.saves[1].signal.aborted).toBe(false);
    expect(result.current.events).toEqual([second]);
  });

  it("ignores the late answer of the first edit", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    const first = { ...review, title: "First" };
    const second = { ...review, title: "Second" };
    act(() => result.current.save(first));
    act(() => result.current.save(second));

    server.saves[1].resolve(second);
    await settle();
    server.saves[0].resolve(first);
    await settle();

    expect(result.current.events).toEqual([second]);
  });

  it("does not undo the second edit, or show an error, when the first one fails late", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    const second = { ...review, title: "Second" };
    act(() => result.current.save({ ...review, title: "First" }));
    act(() => result.current.save(second));

    server.saves[0].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([second]);
    expect(result.current.saveFailed).toBe(false);
  });

  it("goes back to the last confirmed event, not to the first edit, when the second edit fails", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save({ ...review, title: "First" }));
    act(() => result.current.save({ ...review, title: "Second" }));

    server.saves[1].reject(new Error("500"));
    await settle();

    expect(result.current.events).toEqual([review]);
    expect(result.current.saveFailed).toBe(true);
  });

  it("lets a delete replace a save that is still in flight", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server, [review]);
    act(() => result.current.save({ ...review, title: "First" }));

    act(() => result.current.remove("review"));
    expect(server.saves[0].signal.aborted).toBe(true);
    expect(result.current.events).toEqual([]);

    server.deletes[0].resolve();
    await settle();
    expect(result.current.events).toEqual([]);
  });

  it("keeps edits of two different events apart", async () => {
    const server = createManualServer();
    const { result } = await renderLoaded(server);
    const newReview = { ...review, title: "Review 2" };
    const newLunch = { ...lunch, title: "Lunch 2" };
    act(() => result.current.save(newReview));
    act(() => result.current.save(newLunch));

    expect(server.saves[0].signal.aborted).toBe(false);

    server.saves[0].reject(new Error("500"));
    await settle();
    expect(result.current.events).toEqual([review, newLunch]);

    server.saves[1].resolve(newLunch);
    await settle();
    expect(result.current.events).toEqual([review, newLunch]);
  });
});

describe("useCalendarEvents: loads and edits together", () => {
  it("keeps an unanswered edit on top of a load that finishes later", async () => {
    const server = createManualServer();
    const { result, rerender } = await renderLoaded(server, [review]);
    const moved = { ...review, title: "Moved" };
    act(() => result.current.save(moved));

    rerender({ rangeStart: DAY_3, rangeEnd: DAY_5 });
    server.loads[1].resolve([review, lunch]);
    await settle();

    expect(result.current.events).toEqual([lunch, moved]);
  });

  it("does not abort a save when the calendar is removed, so the edit still reaches the server", async () => {
    const server = createManualServer();
    const { result, unmount } = await renderLoaded(server, [review]);
    act(() => result.current.save(lunch));

    unmount();

    expect(server.saves[0].signal.aborted).toBe(false);
  });
});
