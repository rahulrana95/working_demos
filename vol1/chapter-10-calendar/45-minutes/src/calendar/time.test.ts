/*
 * NOT PART OF THE INTERVIEW.
 * These tests pass in any time zone: they build their dates in local time,
 * the same way the code reads them.
 */
import { createFormatters, fromInputValue, startOfDay, toInputValue, toIso } from "./time";

describe("startOfDay", () => {
  it("gives the first instant of the local day", () => {
    const afternoon = new Date(2026, 2, 3, 15, 42, 10).getTime();

    expect(startOfDay(afternoon)).toBe(new Date(2026, 2, 3).getTime());
  });

  it("gives the same instant for a time that is already the start of the day", () => {
    const midnight = new Date(2026, 2, 3).getTime();

    expect(startOfDay(midnight)).toBe(midnight);
  });

  it("gives the start of a later or an earlier day", () => {
    const afternoon = new Date(2026, 2, 3, 15, 42).getTime();

    expect(startOfDay(afternoon, 1)).toBe(new Date(2026, 2, 4).getTime());
    expect(startOfDay(afternoon, -1)).toBe(new Date(2026, 2, 2).getTime());
  });

  it("crosses the end of a month and of a year", () => {
    expect(startOfDay(new Date(2026, 0, 31, 9).getTime(), 1)).toBe(new Date(2026, 1, 1).getTime());
    expect(startOfDay(new Date(2026, 11, 31, 9).getTime(), 1)).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe("the value of a date and time input", () => {
  it("writes an instant as local date and time", () => {
    expect(toInputValue(new Date(2026, 2, 3, 9, 5).toISOString())).toBe("2026-03-03T09:05");
  });

  it("reads the value back to the same instant", () => {
    const instant = new Date(2026, 10, 28, 23, 45).getTime();

    expect(fromInputValue(toInputValue(toIso(instant)))).toBe(instant);
  });

  it("reads an empty input as NaN", () => {
    expect(fromInputValue("")).toBeNaN();
    expect(fromInputValue(null)).toBeNaN();
  });
});

describe("toIso", () => {
  it("writes an instant in UTC", () => {
    expect(toIso(Date.UTC(2026, 2, 3, 4, 30))).toBe("2026-03-03T04:30:00.000Z");
  });
});

describe("createFormatters", () => {
  const start = new Date(2026, 2, 3, 10, 0);
  const end = new Date(2026, 2, 3, 11, 0);
  const event = {
    id: "1",
    title: "Design review",
    start: start.toISOString(),
    end: end.toISOString(),
  };

  it("uses a 24 hour clock in British English", () => {
    expect(createFormatters("en-GB").time(start.getTime())).toBe("10:00");
  });

  it("uses a 12 hour clock in American English", () => {
    expect(createFormatters("en-US").time(start.getTime())).toMatch(/^10:00\sAM$/);
  });

  it("names the day in full", () => {
    expect(createFormatters("en-GB").day(start.getTime())).toMatch(/^Tuesday,? 3 March 2026$/);
  });

  it("builds the spoken label of an event from its title, times and day", () => {
    // Some versions of the language data put a comma after the weekday.
    expect(createFormatters("en-GB").label(event)).toMatch(
      /^Design review, 10:00 to 11:00, Tuesday,? 3 March 2026$/,
    );
  });

  it("writes the day in Hindi for a Hindi locale", () => {
    expect(createFormatters("hi-IN").day(start.getTime())).toMatch(/^मंगलवार,? 3 मार्च 2026$/);
  });
});
