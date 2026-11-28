/* NOT PART OF THE INTERVIEW: production version. Every test names its time zone. */
import { eventsOfDay, monthDays } from "./monthGrid";
import type { CalendarEvent } from "./types";

const KOLKATA = "Asia/Kolkata";
const NEW_YORK = "America/New_York";
const HOUR_MS = 3_600_000;
const utc = (text: string) => Date.parse(text);
/** A wall time in India as an instant: India is 5 hours 30 minutes ahead of UTC. */
const kolkata = (text: string) => Date.parse(`${text}Z`) - 5.5 * HOUR_MS;

describe("monthDays", () => {
  it("always gives six weeks, 42 days", () => {
    for (const month of ["2026-02", "2026-03", "2026-08", "2026-11"]) {
      expect(monthDays(utc(`${month}-10T12:00:00Z`), KOLKATA, 1)).toHaveLength(42);
    }
  });

  it("starts March 2026 on Monday 23 February when the week starts on Monday", () => {
    // 1 March 2026 is a Sunday.
    const days = monthDays(utc("2026-03-10T12:00:00Z"), KOLKATA, 1);

    expect(days[0].start).toBe(kolkata("2026-02-23T00:00"));
    expect(days[41].end).toBe(kolkata("2026-04-06T00:00"));
  });

  it("starts March 2026 on Sunday 1 March when the week starts on Sunday", () => {
    const days = monthDays(utc("2026-03-10T12:00:00Z"), KOLKATA, 7);

    expect(days[0].start).toBe(kolkata("2026-03-01T00:00"));
  });

  it("marks the days of the month itself", () => {
    const days = monthDays(utc("2026-03-10T12:00:00Z"), KOLKATA, 1);

    expect(days.filter((day) => day.isInMonth)).toHaveLength(31);
    expect(days[5].isInMonth).toBe(false);
    expect(days[6].isInMonth).toBe(true);
    expect(days[37].isInMonth).toBe(false);
  });

  it("gives each day its real length, also in a month in which the clocks change", () => {
    const days = monthDays(utc("2026-03-10T16:00:00Z"), NEW_YORK, 7);
    const hours = days.map((day) => (day.end - day.start) / HOUR_MS);

    // Sunday 8 March is the eighth day of a grid that starts on Sunday 1 March.
    expect(hours[7]).toBe(23);
    expect(hours.filter((length) => length === 24)).toHaveLength(41);
  });

  it("uses the month of the zone, not of UTC", () => {
    // 20:00 UTC on 31 March is already 1 April in India.
    const days = monthDays(utc("2026-03-31T20:00:00Z"), KOLKATA, 1);

    expect(days.filter((day) => day.isInMonth)).toHaveLength(30);
  });
});

describe("eventsOfDay", () => {
  const day = { start: kolkata("2026-03-03T00:00"), end: kolkata("2026-03-04T00:00") };
  const timed = (id: string, start: string, end: string): CalendarEvent => ({
    id,
    title: id,
    start: new Date(kolkata(start)).toISOString(),
    end: new Date(kolkata(end)).toISOString(),
  });
  const allDay = (id: string, first: string, afterLast: string): CalendarEvent => ({
    id,
    title: id,
    start: `${first}T00:00:00.000Z`,
    end: `${afterLast}T00:00:00.000Z`,
    allDay: true,
  });
  const ids = (events: CalendarEvent[]) =>
    eventsOfDay(events, day, KOLKATA).map((event) => event.id);

  it("gives the events of the day in time order", () => {
    const events = [
      timed("late", "2026-03-03T15:00", "2026-03-03T16:00"),
      timed("early", "2026-03-03T08:00", "2026-03-03T09:00"),
      timed("other day", "2026-03-04T08:00", "2026-03-04T09:00"),
    ];

    expect(ids(events)).toEqual(["early", "late"]);
  });

  it("includes an event that began the day before and one that ends the day after", () => {
    const events = [
      timed("from yesterday", "2026-03-02T23:00", "2026-03-03T01:00"),
      timed("into tomorrow", "2026-03-03T23:00", "2026-03-04T01:00"),
      timed("ends at midnight", "2026-03-02T22:00", "2026-03-03T00:00"),
    ];

    expect(ids(events)).toEqual(["from yesterday", "into tomorrow"]);
  });

  it("puts all-day events first", () => {
    const events = [
      timed("early", "2026-03-03T01:00", "2026-03-03T02:00"),
      allDay("holiday", "2026-03-03", "2026-03-04"),
    ];

    expect(ids(events)).toEqual(["holiday", "early"]);
  });

  it("shows an all-day event on each of its dates and not on the date after", () => {
    const conference = allDay("conference", "2026-03-02", "2026-03-04");
    const on = (date: string) =>
      eventsOfDay(
        [conference],
        { start: kolkata(`${date}T00:00`), end: kolkata(`${date}T00:00`) + 24 * HOUR_MS },
        KOLKATA,
      ).length;

    expect([on("2026-03-01"), on("2026-03-02"), on("2026-03-03"), on("2026-03-04")]).toEqual([
      0, 1, 1, 0,
    ]);
  });

  it("shows an all-day event on the same date in every time zone", () => {
    // 3 March in New York starts at 05:00 UTC. The all-day event of 3 March starts at 00:00 UTC.
    const holiday = allDay("holiday", "2026-03-03", "2026-03-04");
    const newYorkDay = { start: utc("2026-03-03T05:00:00Z"), end: utc("2026-03-04T05:00:00Z") };
    const dayBefore = { start: utc("2026-03-02T05:00:00Z"), end: utc("2026-03-03T05:00:00Z") };

    expect(eventsOfDay([holiday], newYorkDay, NEW_YORK)).toHaveLength(1);
    expect(eventsOfDay([holiday], dayBefore, NEW_YORK)).toHaveLength(0);
  });
});
