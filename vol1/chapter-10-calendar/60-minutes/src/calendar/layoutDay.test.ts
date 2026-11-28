/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you draw these cases on the board and walk through one.
 * Here they are written as tests, so you can see that the function handles them.
 */
import { HOUR_HEIGHT, MIN_EVENT_HEIGHT, layoutDay } from "./layoutDay";
import type { CalendarEvent, PositionedEvent } from "./types";

const MINUTE_MS = 60_000;
const DAY_START = Date.UTC(2026, 2, 3);
const DAY_END = Date.UTC(2026, 2, 4);

/** A time on the test day, as an ISO string. Hours past 24 are in the next day. */
function at(hour: number, minute = 0): string {
  return new Date(DAY_START + (hour * 60 + minute) * MINUTE_MS).toISOString();
}

function event(id: string, start: string, end: string): CalendarEvent {
  return { id, title: id, start, end };
}

/** The layout of the test day, by event id. */
function layout(events: CalendarEvent[]): Record<string, PositionedEvent> {
  const boxes = layoutDay(events, DAY_START, DAY_END);
  return Object.fromEntries(boxes.map((box) => [box.event.id, box]));
}

/**
 * True when two boxes of the same column cover some of the same pixels.
 * A thousandth of a pixel is allowed: `top + height` is a sum of two fractions,
 * and such a sum can be wrong in its last digit.
 */
function overlapInOneColumn(a: PositionedEvent, b: PositionedEvent): boolean {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return a.column === b.column && overlap > 0.001;
}

/** A small random number generator with a seed, so a failing run can be repeated. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function randomEvents(count: number, random: () => number): CalendarEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const startMinute = Math.floor(random() * 24 * 60);
    const lengthMinutes = Math.floor(random() * 180);
    return event(`e${index}`, at(0, startMinute), at(0, startMinute + lengthMinutes));
  });
}

describe("layoutDay", () => {
  it("returns nothing for a day with no events", () => {
    expect(layoutDay([], DAY_START, DAY_END)).toEqual([]);
  });

  it("places an event by its start and its length", () => {
    const { a } = layout([event("a", at(10), at(11, 30))]);

    expect(a.top).toBe(10 * HOUR_HEIGHT);
    expect(a.height).toBe(1.5 * HOUR_HEIGHT);
  });

  it("gives the full width to events that do not overlap", () => {
    const { a, b } = layout([event("a", at(9), at(10)), event("b", at(13), at(14))]);

    expect(a).toMatchObject({ column: 0, columnCount: 1 });
    expect(b).toMatchObject({ column: 0, columnCount: 1 });
  });

  it("puts two overlapping events side by side, each half the width", () => {
    const { a, b } = layout([event("a", at(10), at(11)), event("b", at(10, 30), at(11, 30))]);

    expect(a).toMatchObject({ column: 0, columnCount: 2 });
    expect(b).toMatchObject({ column: 1, columnCount: 2 });
  });

  it("uses two columns, not three, when A overlaps B and B overlaps C but A does not overlap C", () => {
    const { a, b, c } = layout([
      event("a", at(10), at(11)),
      event("b", at(10, 30), at(12)),
      event("c", at(11), at(12)),
    ]);

    // C takes the column that A left. All three share one cluster, so all are half wide.
    expect(a).toMatchObject({ column: 0, columnCount: 2 });
    expect(b).toMatchObject({ column: 1, columnCount: 2 });
    expect(c).toMatchObject({ column: 0, columnCount: 2 });
  });

  it("does not treat an event that ends at 11:00 and one that starts at 11:00 as overlapping", () => {
    const { a, b } = layout([event("a", at(10), at(11)), event("b", at(11), at(12))]);

    expect(a).toMatchObject({ column: 0, columnCount: 1 });
    expect(b).toMatchObject({ column: 0, columnCount: 1 });
  });

  it("keeps back-to-back events apart at times that do not divide evenly into pixels", () => {
    // 10:07, 10:20 and 10:33 are not whole pixels at 48px an hour.
    const { a, b } = layout([event("a", at(9, 7), at(10, 20)), event("b", at(10, 20), at(11, 33))]);

    expect(a.columnCount).toBe(1);
    expect(b.columnCount).toBe(1);
  });

  it("starts a new cluster after a gap, so a busy morning does not narrow the afternoon", () => {
    const boxes = layout([
      event("a", at(9), at(10)),
      event("b", at(9), at(10)),
      event("c", at(9), at(10)),
      event("d", at(15), at(16)),
    ]);

    expect(boxes.a.columnCount).toBe(3);
    expect(boxes.d).toMatchObject({ column: 0, columnCount: 1 });
  });

  it("puts the longer event first when two start together", () => {
    const { short, long } = layout([
      event("short", at(10), at(10, 30)),
      event("long", at(10), at(12)),
    ]);

    expect(long.column).toBe(0);
    expect(short.column).toBe(1);
  });

  it("gives the same layout whatever order the events arrive in", () => {
    const events = [
      event("b", at(10), at(11)),
      event("a", at(10), at(11)),
      event("c", at(10, 30), at(11, 30)),
    ];

    expect(layout(events)).toEqual(layout([...events].reverse()));
    expect(layout(events).a.column).toBe(0);
    expect(layout(events).b.column).toBe(1);
  });

  it("returns the events in time order", () => {
    const boxes = layoutDay(
      [event("late", at(15), at(16)), event("early", at(8), at(9)), event("noon", at(12), at(13))],
      DAY_START,
      DAY_END,
    );

    expect(boxes.map((box) => box.event.id)).toEqual(["early", "noon", "late"]);
  });

  it("gives an event of zero length the smallest height", () => {
    const { a } = layout([event("a", at(10), at(10))]);

    expect(a.top).toBe(10 * HOUR_HEIGHT);
    expect(a.height).toBe(MIN_EVENT_HEIGHT);
  });

  it("gives a five-minute event the smallest height", () => {
    const { a } = layout([event("a", at(10), at(10, 5))]);

    expect(a.height).toBe(MIN_EVENT_HEIGHT);
  });

  it("puts an event beside a short one whose box, not its real end, reaches it", () => {
    // The first event ends at 10:05, but its box is drawn down to 10:30.
    const { a, b } = layout([event("a", at(10), at(10, 5)), event("b", at(10, 15), at(11))]);

    expect(a).toMatchObject({ column: 0, columnCount: 2 });
    expect(b).toMatchObject({ column: 1, columnCount: 2 });
  });

  it("clips an event that started the day before to the top of the day", () => {
    const { a } = layout([event("a", at(-2), at(1))]);

    expect(a.top).toBe(0);
    expect(a.height).toBe(HOUR_HEIGHT);
  });

  it("clips an event that ends the next day to the bottom of the day", () => {
    const { a } = layout([event("a", at(23), at(26))]);

    expect(a.top).toBe(23 * HOUR_HEIGHT);
    expect(a.height).toBe(HOUR_HEIGHT);
  });

  it("fills the whole day with an event that covers it", () => {
    const { a } = layout([event("a", at(-5), at(30))]);

    expect(a.top).toBe(0);
    expect(a.height).toBe(24 * HOUR_HEIGHT);
  });

  it("moves a short event at the very end of the day up, so its box stays inside the day", () => {
    const { a } = layout([event("a", at(23, 55), at(24))]);

    expect(a.top + a.height).toBe(24 * HOUR_HEIGHT);
    expect(a.height).toBe(MIN_EVENT_HEIGHT);
  });

  it("leaves out events of other days", () => {
    const boxes = layout([
      event("yesterday", at(-3), at(-1)),
      event("ends at midnight", at(-1), at(0)),
      event("tomorrow", at(24), at(25)),
      event("today", at(0), at(1)),
    ]);

    expect(Object.keys(boxes)).toEqual(["today"]);
  });

  it("leaves out an event with a date that cannot be read, or an end before its start", () => {
    const boxes = layout([
      event("bad start", "not a date", at(11)),
      event("bad end", at(10), ""),
      event("backwards", at(11), at(10)),
      event("good", at(10), at(11)),
    ]);

    expect(Object.keys(boxes)).toEqual(["good"]);
  });

  it("does not change the events it is given", () => {
    const events = [event("b", at(11), at(12)), event("a", at(10), at(11))];
    const copy = structuredClone(events);

    layoutDay(events, DAY_START, DAY_END);

    expect(events).toEqual(copy);
  });

  it("never lets two boxes of one column overlap, for 200 random days", () => {
    const random = createRandom(42);

    for (let day = 0; day < 200; day++) {
      const boxes = layoutDay(
        randomEvents(1 + Math.floor(random() * 60), random),
        DAY_START,
        DAY_END,
      );

      for (const box of boxes) {
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.top + box.height).toBeLessThanOrEqual(24 * HOUR_HEIGHT);
        expect(box.column).toBeLessThan(box.columnCount);
        expect(boxes.filter((other) => other !== box && overlapInOneColumn(box, other))).toEqual(
          [],
        );
      }
    }
  });

  it("lays out 500 events of one day without an overlap, and stays fast", () => {
    const events = randomEvents(500, createRandom(7));
    layoutDay(events, DAY_START, DAY_END);

    const startedAt = performance.now();
    const boxes = layoutDay(events, DAY_START, DAY_END);
    const elapsedMs = performance.now() - startedAt;

    expect(boxes).toHaveLength(500);
    for (const box of boxes) {
      expect(boxes.some((other) => other !== box && overlapInOneColumn(box, other))).toBe(false);
    }
    // It takes well under one millisecond on a laptop. 50 ms leaves room for a slow test machine.
    expect(elapsedMs).toBeLessThan(50);
  });
});
