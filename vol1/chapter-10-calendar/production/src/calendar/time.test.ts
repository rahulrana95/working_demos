/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every test names its time zone, so the tests pass whatever the time zone of
 * the machine is. The expected instants are written by hand in UTC:
 *   - India is 5 hours 30 minutes ahead of UTC all year.
 *   - New York is 5 hours behind UTC in winter (EST) and 4 in summer (EDT).
 *     In 2026 its clocks go forward on 8 March and back on 1 November.
 */
import {
  createFormatters,
  dateOf,
  firstDayOfWeek,
  fromInputValue,
  fromWall,
  startOfDay,
  startOfWeek,
  toInputValue,
  toIso,
  toWall,
} from "./time";

const HOUR_MS = 3_600_000;
const KOLKATA = "Asia/Kolkata";
const NEW_YORK = "America/New_York";
const utc = (text: string) => Date.parse(text);
/** A wall time written as a UTC timestamp. */
const wall = (text: string) => Date.parse(`${text}Z`);

describe("toWall", () => {
  it("shows 04:30 UTC as 10:00 in India", () => {
    expect(toWall(utc("2026-03-03T04:30:00Z"), KOLKATA)).toBe(wall("2026-03-03T10:00"));
  });

  it("shows the same instant as 23:30 of the day before in New York", () => {
    expect(toWall(utc("2026-03-03T04:30:00Z"), NEW_YORK)).toBe(wall("2026-03-02T23:30"));
  });

  it("shows midnight as hour 0, not as hour 24", () => {
    expect(toWall(utc("2026-03-03T00:00:00Z"), "UTC")).toBe(wall("2026-03-03T00:00"));
  });

  it("uses summer time in New York in July", () => {
    expect(toWall(utc("2026-07-01T14:00:00Z"), NEW_YORK)).toBe(wall("2026-07-01T10:00"));
  });

  it("drops the seconds", () => {
    expect(toWall(utc("2026-03-03T04:30:59Z"), KOLKATA)).toBe(wall("2026-03-03T10:00"));
  });

  it("makes one formatter for a time zone, however often it is asked", () => {
    const Original = Intl.DateTimeFormat;
    let made = 0;
    class Counting extends Original {
      constructor(...args: ConstructorParameters<typeof Original>) {
        super(...args);
        made++;
      }
    }
    Intl.DateTimeFormat = Counting as typeof Original;

    try {
      for (let minute = 0; minute < 1000; minute++) {
        toWall(utc("2026-03-03T00:00:00Z") + minute * 60_000, "Pacific/Fiji");
      }
    } finally {
      Intl.DateTimeFormat = Original;
    }

    expect(made).toBe(1);
  });
});

describe("fromWall", () => {
  it("turns 10:00 in India into 04:30 UTC", () => {
    expect(fromWall(wall("2026-03-03T10:00"), KOLKATA)).toBe(utc("2026-03-03T04:30:00Z"));
  });

  it("turns 10:00 in New York into 15:00 UTC in winter and 14:00 UTC in summer", () => {
    expect(fromWall(wall("2026-03-03T10:00"), NEW_YORK)).toBe(utc("2026-03-03T15:00:00Z"));
    expect(fromWall(wall("2026-07-01T10:00"), NEW_YORK)).toBe(utc("2026-07-01T14:00:00Z"));
  });

  it("is the opposite of toWall for every hour of a week with a clock change", () => {
    const start = utc("2026-03-05T00:00:00Z");
    for (let hour = 0; hour < 7 * 24; hour++) {
      const instant = start + hour * HOUR_MS;
      expect(fromWall(toWall(instant, NEW_YORK), NEW_YORK)).toBe(instant);
    }
  });

  it("is right just before and just after the clocks go forward", () => {
    // 8 March 2026: after 01:59 EST comes 03:00 EDT.
    expect(fromWall(wall("2026-03-08T01:59"), NEW_YORK)).toBe(utc("2026-03-08T06:59:00Z"));
    expect(fromWall(wall("2026-03-08T03:00"), NEW_YORK)).toBe(utc("2026-03-08T07:00:00Z"));
  });

  it("moves a wall time that the clocks skip forward by the size of the jump", () => {
    // 02:30 does not exist on 8 March in New York. It becomes 03:30 EDT.
    expect(fromWall(wall("2026-03-08T02:30"), NEW_YORK)).toBe(utc("2026-03-08T07:30:00Z"));
  });

  it("takes the first of the two instants when a wall time happens twice", () => {
    // 1 November 2026: 01:30 happens in EDT (05:30 UTC) and again in EST (06:30 UTC).
    expect(fromWall(wall("2026-11-01T01:30"), NEW_YORK)).toBe(utc("2026-11-01T05:30:00Z"));
  });

  it("is right just after the clocks go back", () => {
    expect(fromWall(wall("2026-11-01T02:00"), NEW_YORK)).toBe(utc("2026-11-01T07:00:00Z"));
  });
});

describe("startOfDay", () => {
  it("gives midnight in India, which is 18:30 UTC of the day before", () => {
    expect(startOfDay(utc("2026-03-03T12:00:00Z"), KOLKATA)).toBe(utc("2026-03-02T18:30:00Z"));
  });

  it("puts one instant in two different dates for India and New York", () => {
    // 20:00 UTC on 3 March is 01:30 on 4 March in India and 15:00 on 3 March in New York.
    const instant = utc("2026-03-03T20:00:00Z");

    expect(startOfDay(instant, KOLKATA)).toBe(utc("2026-03-03T18:30:00Z"));
    expect(startOfDay(instant, NEW_YORK)).toBe(utc("2026-03-03T05:00:00Z"));
  });

  it("gives the start of a later or an earlier date", () => {
    const instant = utc("2026-03-03T12:00:00Z");

    expect(startOfDay(instant, KOLKATA, 1)).toBe(utc("2026-03-03T18:30:00Z"));
    expect(startOfDay(instant, KOLKATA, -1)).toBe(utc("2026-03-01T18:30:00Z"));
    expect(startOfDay(instant, KOLKATA, 30)).toBe(utc("2026-04-01T18:30:00Z"));
  });

  it("makes every day in India 24 hours long", () => {
    for (const day of ["2026-03-08", "2026-07-01", "2026-11-01"]) {
      const start = startOfDay(utc(`${day}T12:00:00Z`), KOLKATA);
      expect(startOfDay(start, KOLKATA, 1) - start).toBe(24 * HOUR_MS);
    }
  });

  it("makes the day the clocks go forward in New York 23 hours long", () => {
    const start = startOfDay(utc("2026-03-08T12:00:00Z"), NEW_YORK);

    expect(start).toBe(utc("2026-03-08T05:00:00Z"));
    expect(startOfDay(start, NEW_YORK, 1)).toBe(utc("2026-03-09T04:00:00Z"));
    expect(startOfDay(start, NEW_YORK, 1) - start).toBe(23 * HOUR_MS);
  });

  it("makes the day the clocks go back in New York 25 hours long", () => {
    const start = startOfDay(utc("2026-11-01T12:00:00Z"), NEW_YORK);

    expect(start).toBe(utc("2026-11-01T04:00:00Z"));
    expect(startOfDay(start, NEW_YORK, 1) - start).toBe(25 * HOUR_MS);
  });

  it("steps over a clock change by date, not by 24 hours", () => {
    // Seven dates after Thursday 5 March is Thursday 12 March, one hour less than 7 times 24.
    const start = startOfDay(utc("2026-03-05T12:00:00Z"), NEW_YORK);

    expect(startOfDay(start, NEW_YORK, 7)).toBe(utc("2026-03-12T04:00:00Z"));
    expect(startOfDay(start, NEW_YORK, 7) - start).toBe((7 * 24 - 1) * HOUR_MS);
  });

  it("starts the day at 01:00 where the clocks skip midnight", () => {
    // In Cairo the clocks go from 00:00 to 01:00 on Friday 24 April 2026 (UTC+2 to UTC+3).
    const start = startOfDay(utc("2026-04-24T12:00:00Z"), "Africa/Cairo");

    expect(start).toBe(utc("2026-04-23T22:00:00Z"));
    expect(startOfDay(start, "Africa/Cairo", 1) - start).toBe(23 * HOUR_MS);
  });
});

describe("dateOf", () => {
  it("gives the date of the zone as midnight UTC of that date", () => {
    // 20:00 UTC on 3 March is 4 March in India and 3 March in New York.
    const instant = utc("2026-03-03T20:00:00Z");

    expect(dateOf(instant, KOLKATA)).toBe(utc("2026-03-04T00:00:00Z"));
    expect(dateOf(instant, NEW_YORK)).toBe(utc("2026-03-03T00:00:00Z"));
  });

  it("gives the same date for the first and the last minute of a day", () => {
    expect(dateOf(utc("2026-03-02T18:30:00Z"), KOLKATA)).toBe(utc("2026-03-03T00:00:00Z"));
    expect(dateOf(utc("2026-03-03T18:29:00Z"), KOLKATA)).toBe(utc("2026-03-03T00:00:00Z"));
  });
});

describe("startOfWeek", () => {
  // 3 March 2026 is a Tuesday.
  const tuesday = utc("2026-03-03T12:00:00Z");

  it("goes back to Monday when the week starts on Monday", () => {
    expect(startOfWeek(tuesday, KOLKATA, 1)).toBe(utc("2026-03-01T18:30:00Z"));
  });

  it("goes back to Sunday when the week starts on Sunday", () => {
    expect(startOfWeek(tuesday, KOLKATA, 7)).toBe(utc("2026-02-28T18:30:00Z"));
  });

  it("goes back to Saturday when the week starts on Saturday", () => {
    expect(startOfWeek(tuesday, KOLKATA, 6)).toBe(utc("2026-02-27T18:30:00Z"));
  });

  it("stays on the same day when that day starts the week", () => {
    const monday = utc("2026-03-02T12:00:00Z");

    expect(startOfWeek(monday, KOLKATA, 1)).toBe(utc("2026-03-01T18:30:00Z"));
  });

  it("uses the weekday of the zone, not of UTC", () => {
    // 20:00 UTC on Sunday 1 March is already Monday in India.
    const instant = utc("2026-03-01T20:00:00Z");

    expect(startOfWeek(instant, KOLKATA, 1)).toBe(utc("2026-03-01T18:30:00Z"));
    expect(startOfWeek(instant, NEW_YORK, 1)).toBe(utc("2026-02-23T05:00:00Z"));
  });
});

describe("firstDayOfWeek", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is Monday in Britain and Sunday in the United States and India", () => {
    expect(firstDayOfWeek("en-GB")).toBe(1);
    expect(firstDayOfWeek("en-US")).toBe(7);
    expect(firstDayOfWeek("hi-IN")).toBe(7);
  });

  it("is Saturday in Egypt", () => {
    expect(firstDayOfWeek("ar-EG")).toBe(6);
  });

  it("uses the language of the browser when no locale is given", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");

    expect(firstDayOfWeek()).toBe(1);
  });

  it("reads the newer method when the browser has it", () => {
    const withMethod = { getWeekInfo: () => ({ firstDay: 5 }), weekInfo: { firstDay: 3 } };
    vi.spyOn(Intl, "Locale").mockImplementation(() => withMethod as unknown as Intl.Locale);

    expect(firstDayOfWeek("xx")).toBe(5);
  });

  it("reads the older property when the browser has only that", () => {
    const withProperty = { weekInfo: { firstDay: 3 } };
    vi.spyOn(Intl, "Locale").mockImplementation(() => withProperty as unknown as Intl.Locale);

    expect(firstDayOfWeek("xx")).toBe(3);
  });

  it("falls back to Monday when the browser has neither", () => {
    vi.spyOn(Intl, "Locale").mockImplementation(() => ({}) as unknown as Intl.Locale);

    expect(firstDayOfWeek("xx")).toBe(1);
  });
});

describe("the value of a date and time input", () => {
  it("writes an instant on the wall clock of the zone", () => {
    expect(toInputValue("2026-03-03T04:30:00.000Z", KOLKATA)).toBe("2026-03-03T10:00");
    expect(toInputValue("2026-03-03T04:30:00.000Z", NEW_YORK)).toBe("2026-03-02T23:30");
  });

  it("reads the value as a wall time of the zone", () => {
    expect(fromInputValue("2026-03-03T10:00", KOLKATA)).toBe(utc("2026-03-03T04:30:00Z"));
    expect(fromInputValue("2026-03-03T10:00", NEW_YORK)).toBe(utc("2026-03-03T15:00:00Z"));
  });

  it("reads back what it wrote", () => {
    const iso = "2026-11-28T18:15:00.000Z";

    expect(toIso(fromInputValue(toInputValue(iso, NEW_YORK), NEW_YORK))).toBe(iso);
  });

  it("reads an empty input as NaN", () => {
    expect(fromInputValue("", KOLKATA)).toBeNaN();
    expect(fromInputValue(null, KOLKATA)).toBeNaN();
  });
});

describe("createFormatters", () => {
  const start = utc("2026-03-03T04:30:00Z");
  const event = {
    id: "1",
    title: "Design review",
    start: toIso(start),
    end: toIso(start + HOUR_MS),
  };

  it("shows the time of the zone it is given", () => {
    expect(createFormatters("en-GB", KOLKATA).time(start)).toBe("10:00");
    expect(createFormatters("en-GB", NEW_YORK).time(start)).toBe("23:30");
  });

  it("uses a 12 hour clock in American English and in Hindi", () => {
    expect(createFormatters("en-US", KOLKATA).time(start)).toMatch(/^10:00\sAM$/);
    expect(createFormatters("hi-IN", KOLKATA).time(start)).toMatch(/10:00\sam/);
  });

  it("names the day of the zone in full", () => {
    // Some versions of the language data put a comma after the weekday.
    expect(createFormatters("en-GB", KOLKATA).day(start)).toMatch(/^Tuesday,? 3 March 2026$/);
    expect(createFormatters("en-GB", NEW_YORK).day(start)).toMatch(/^Monday,? 2 March 2026$/);
  });

  it("gives a short name for the top of a column", () => {
    expect(createFormatters("en-GB", KOLKATA).weekday(start)).toBe("Tue 3");
  });

  it("gives the short texts of the month view", () => {
    const format = createFormatters("en-GB", KOLKATA);

    expect(format.weekdayName(start)).toBe("Tue");
    expect(format.dayNumber(start)).toBe("3");
    expect(format.month(start)).toBe("March 2026");
  });

  it("gives the four parts of the spoken label of an event", () => {
    const [title, from, to, day] = createFormatters("en-GB", KOLKATA).labelParts(event);

    expect([title, from, to]).toEqual(["Design review", "10:00", "11:00"]);
    expect(day).toMatch(/^Tuesday,? 3 March 2026$/);
  });
});
