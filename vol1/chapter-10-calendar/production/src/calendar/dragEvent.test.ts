/* NOT PART OF THE INTERVIEW: production version. Every test names its time zone. */
import { dragEvent } from "./dragEvent";
import type { CalendarEvent } from "./types";

const KOLKATA = "Asia/Kolkata";
const NEW_YORK = "America/New_York";

/** 10:00 to 11:00 in India on Tuesday 3 March 2026. */
const review: CalendarEvent = {
  id: "review",
  title: "Design review",
  start: "2026-03-03T04:30:00.000Z",
  end: "2026-03-03T05:30:00.000Z",
};

const times = (event: CalendarEvent) => [event.start, event.end];

describe("dragEvent: move", () => {
  it("moves the start and the end by the same time", () => {
    const moved = dragEvent(review, "move", 90, 0, KOLKATA);

    expect(times(moved)).toEqual(["2026-03-03T06:00:00.000Z", "2026-03-03T07:00:00.000Z"]);
  });

  it("moves up with negative minutes", () => {
    expect(dragEvent(review, "move", -60, 0, KOLKATA).start).toBe("2026-03-03T03:30:00.000Z");
  });

  it("snaps to a quarter of an hour", () => {
    // 22 minutes is nearer to 15 than to 30. 23 is nearer to 30.
    expect(dragEvent(review, "move", 22, 0, KOLKATA).start).toBe("2026-03-03T04:45:00.000Z");
    expect(dragEvent(review, "move", 23, 0, KOLKATA).start).toBe("2026-03-03T05:00:00.000Z");
  });

  it("does not move for a drag of a few minutes", () => {
    expect(times(dragEvent(review, "move", 7, 0, KOLKATA))).toEqual(times(review));
  });

  it("snaps an event with an odd start to the quarter of the wall clock", () => {
    // 10:07 in India, moved by nothing, snaps to 10:00. India is 30 minutes off the hour in UTC.
    const odd = { ...review, start: "2026-03-03T04:37:00.000Z", end: "2026-03-03T05:37:00.000Z" };

    expect(times(dragEvent(odd, "move", 0, 0, KOLKATA))).toEqual(times(review));
  });

  it("keeps everything else of the event", () => {
    const coloured = { ...review, color: "red", updatedAt: "2026-03-01T00:00:00.000Z" };

    expect(dragEvent(coloured, "move", 60, 0, KOLKATA)).toMatchObject({
      id: "review",
      title: "Design review",
      color: "red",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(coloured.start).toBe(review.start);
  });

  it("moves to another day and keeps the time of day", () => {
    const moved = dragEvent(review, "move", 0, 2, KOLKATA);

    expect(times(moved)).toEqual(["2026-03-05T04:30:00.000Z", "2026-03-05T05:30:00.000Z"]);
    expect(dragEvent(review, "move", 0, -1, KOLKATA).start).toBe("2026-03-02T04:30:00.000Z");
  });

  it("keeps the time on the wall clock when the day it moves to is after a clock change", () => {
    // 10:00 in New York on Saturday 7 March (15:00 UTC), moved to Sunday 8 March (14:00 UTC).
    const saturday = {
      ...review,
      start: "2026-03-07T15:00:00.000Z",
      end: "2026-03-07T16:00:00.000Z",
    };
    const moved = dragEvent(saturday, "move", 0, 1, NEW_YORK);

    expect(times(moved)).toEqual(["2026-03-08T14:00:00.000Z", "2026-03-08T15:00:00.000Z"]);
  });

  it("moves by real minutes down the grid on the day of the clock change", () => {
    // 01:00 on 8 March in New York (06:00 UTC), dragged two rows down. A row is a
    // real hour, so it lands at 08:00 UTC, which the clock shows as 04:00.
    const early = { ...review, start: "2026-03-08T06:00:00.000Z", end: "2026-03-08T06:30:00.000Z" };

    expect(dragEvent(early, "move", 120, 0, NEW_YORK).start).toBe("2026-03-08T08:00:00.000Z");
  });
});

describe("dragEvent: resize", () => {
  it("moves only the end", () => {
    const longer = dragEvent(review, "resize", 30, 0, KOLKATA);

    expect(times(longer)).toEqual(["2026-03-03T04:30:00.000Z", "2026-03-03T06:00:00.000Z"]);
  });

  it("makes the event shorter with negative minutes", () => {
    expect(dragEvent(review, "resize", -30, 0, KOLKATA).end).toBe("2026-03-03T05:00:00.000Z");
  });

  it("never makes the event shorter than a quarter of an hour", () => {
    expect(dragEvent(review, "resize", -55, 0, KOLKATA).end).toBe("2026-03-03T04:45:00.000Z");
    expect(dragEvent(review, "resize", -600, 0, KOLKATA).end).toBe("2026-03-03T04:45:00.000Z");
  });

  it("snaps the end to a quarter of an hour", () => {
    expect(dragEvent(review, "resize", 20, 0, KOLKATA).end).toBe("2026-03-03T05:45:00.000Z");
  });
});
