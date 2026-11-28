/* NOT PART OF THE INTERVIEW: production version. */
import { boxesInWindow, capColumns } from "./boundBoxes";
import { HOUR_HEIGHT, layoutDay } from "./layoutDay";
import type { CalendarEvent } from "./types";

const MINUTE_MS = 60_000;
const DAY_START = Date.UTC(2026, 2, 3);
const DAY_END = Date.UTC(2026, 2, 4);

function at(hour: number, minute = 0): string {
  return new Date(DAY_START + (hour * 60 + minute) * MINUTE_MS).toISOString();
}

function event(id: string, start: string, end: string): CalendarEvent {
  return { id, title: id, start, end };
}

/** `count` events that all run from 10:00 to 11:00, so each needs its own column. */
const sameHour = (count: number, hour = 10) =>
  Array.from({ length: count }, (_, index) => event(`h${hour}-${index}`, at(hour), at(hour + 1)));

const capped = (events: CalendarEvent[], maxColumns: number) =>
  capColumns(layoutDay(events, DAY_START, DAY_END), maxColumns);

describe("capColumns", () => {
  it("changes nothing when the day has no more columns than the limit", () => {
    const boxes = layoutDay(sameHour(4), DAY_START, DAY_END);

    expect(capColumns(boxes, 4)).toEqual({ boxes, more: [] });
  });

  it("keeps one column fewer than the limit and counts the rest", () => {
    const { boxes, more } = capped(sameHour(10), 4);

    expect(boxes.map((box) => box.column)).toEqual([0, 1, 2]);
    expect(more).toEqual([{ top: 10 * HOUR_HEIGHT, height: HOUR_HEIGHT, count: 7 }]);
  });

  it("makes the kept boxes a quarter wide, so the last quarter is free for '+N more'", () => {
    const { boxes } = capped(sameHour(10), 4);

    expect(boxes.every((box) => box.columnCount === 4)).toBe(true);
  });

  it("gives each busy part of the day its own '+N more' box", () => {
    const { more } = capped([...sameHour(6, 9), ...sameHour(8, 15)], 4);

    expect(more).toEqual([
      { top: 9 * HOUR_HEIGHT, height: HOUR_HEIGHT, count: 3 },
      { top: 15 * HOUR_HEIGHT, height: HOUR_HEIGHT, count: 5 },
    ]);
  });

  it("leaves a quiet part of the day at full width", () => {
    const quiet = event("quiet", at(15), at(16));
    const { boxes } = capped([...sameHour(6, 9), quiet], 4);

    expect(boxes.find((box) => box.event.id === "quiet")).toMatchObject({
      column: 0,
      columnCount: 1,
    });
  });

  it("makes the '+N more' box cover every event it stands for", () => {
    const events = [...sameHour(5, 10), event("long", at(10, 30), at(13))];
    const { more } = capped(events, 3);

    expect(more).toHaveLength(1);
    expect(more[0].top).toBe(10 * HOUR_HEIGHT);
    expect(more[0].top + more[0].height).toBe(13 * HOUR_HEIGHT);
    expect(more[0].count).toBe(4);
  });

  it("loses no event: kept boxes and counted events add up", () => {
    const events = [...sameHour(20, 9), ...sameHour(3, 12), ...sameHour(9, 18)];
    const { boxes, more } = capped(events, 4);
    const counted = more.reduce((sum, box) => sum + box.count, 0);

    expect(boxes.length + counted).toBe(events.length);
  });

  it("never keeps more boxes than the limit side by side, for 5,000 events in a day", () => {
    const events = Array.from({ length: 5000 }, (_, index) => {
      const startMinute = (index * 37) % (23 * 60);
      return event(`e${index}`, at(0, startMinute), at(0, startMinute + 15 + (index % 50)));
    });
    const { boxes, more } = capped(events, 4);

    expect(Math.max(...boxes.map((box) => box.column))).toBeLessThanOrEqual(2);
    // A column holds boxes one under the other, each at least 24px tall.
    expect(boxes.length).toBeLessThanOrEqual(3 * ((24 * HOUR_HEIGHT) / 24));
    expect(boxes.length + more.reduce((sum, box) => sum + box.count, 0)).toBe(5000);
  });
});

describe("boxesInWindow", () => {
  const boxes = [
    { id: "morning", top: 100, height: 50 },
    { id: "noon", top: 500, height: 100 },
    { id: "evening", top: 900, height: 50 },
  ];
  const ids = (top: number, bottom: number) =>
    boxesInWindow(boxes, top, bottom).map((box) => box.id);

  it("keeps the boxes that are inside the window", () => {
    expect(ids(400, 700)).toEqual(["noon"]);
  });

  it("keeps a box that is only partly inside", () => {
    expect(ids(140, 510)).toEqual(["morning", "noon"]);
  });

  it("leaves out a box that only touches the edge of the window", () => {
    expect(ids(150, 500)).toEqual([]);
  });

  it("keeps every box when the window has no limits", () => {
    expect(ids(-Infinity, Infinity)).toEqual(["morning", "noon", "evening"]);
  });
});
