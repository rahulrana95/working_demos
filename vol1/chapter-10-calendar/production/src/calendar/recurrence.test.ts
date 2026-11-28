/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every expected instant is written by hand in UTC:
 *   - India is 5 hours 30 minutes ahead of UTC all year.
 *   - New York is 5 hours behind UTC in winter and 4 in summer. In 2026 its
 *     clocks go forward on Sunday 8 March and back on Sunday 1 November.
 */
import {
  editOccurrence,
  editSeries,
  expandRecurrence,
  isOccurrence,
  toStoredEdit,
} from "./recurrence";
import type { CalendarEvent, Recurrence } from "./types";

const KOLKATA = "Asia/Kolkata";
const NEW_YORK = "America/New_York";
const utc = (text: string) => Date.parse(text);

/** A series that first happens at 10:00 to 11:00 in India on Monday 2 March 2026. */
function series(rule: Partial<Recurrence> & Pick<Recurrence, "frequency">): CalendarEvent {
  return {
    id: "s",
    title: "Stand-up",
    start: "2026-03-02T04:30:00.000Z",
    end: "2026-03-02T05:30:00.000Z",
    recurrence: { timeZone: KOLKATA, ...rule },
  };
}

const starts = (events: CalendarEvent[]) => events.map((event) => event.start);
const expand = (event: CalendarEvent, from: string, to: string) =>
  expandRecurrence(event, utc(from), utc(to));

describe("expandRecurrence: plain events", () => {
  it("gives a plain event back as it is", () => {
    const event = {
      id: "1",
      title: "Lunch",
      start: "2026-03-03T07:00:00.000Z",
      end: "2026-03-03T08:00:00.000Z",
    };

    expect(expand(event, "2026-03-01T00:00:00Z", "2026-03-08T00:00:00Z")).toEqual([event]);
  });
});

describe("expandRecurrence: every day", () => {
  const daily = series({ frequency: "daily" });

  it("gives one event for each day of the range", () => {
    const events = expand(daily, "2026-03-01T18:30:00Z", "2026-03-08T18:30:00Z");

    expect(starts(events)).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-03T04:30:00.000Z",
      "2026-03-04T04:30:00.000Z",
      "2026-03-05T04:30:00.000Z",
      "2026-03-06T04:30:00.000Z",
      "2026-03-07T04:30:00.000Z",
      "2026-03-08T04:30:00.000Z",
    ]);
  });

  it("gives each one its own id, the id of the series, and the start the rule gave it", () => {
    const [first, second] = expand(daily, "2026-03-01T18:30:00Z", "2026-03-08T18:30:00Z");

    expect(first).toEqual({
      id: "s@2026-03-02T04:30:00.000Z",
      seriesId: "s",
      originalStart: "2026-03-02T04:30:00.000Z",
      title: "Stand-up",
      start: "2026-03-02T04:30:00.000Z",
      end: "2026-03-02T05:30:00.000Z",
    });
    expect(second.id).toBe("s@2026-03-03T04:30:00.000Z");
    expect(isOccurrence(first)).toBe(true);
    expect(isOccurrence(daily)).toBe(false);
  });

  it("gives nothing before the series starts", () => {
    expect(expand(daily, "2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z")).toEqual([]);
  });

  it("works out a week two years later without walking through the 700 days between", () => {
    const events = expand(daily, "2028-03-06T00:00:00Z", "2028-03-08T00:00:00Z");

    expect(starts(events)).toEqual(["2028-03-06T04:30:00.000Z", "2028-03-07T04:30:00.000Z"]);
  });

  it("is as fast for a week 20 years later as for the first week", () => {
    const startedAt = performance.now();
    for (let run = 0; run < 100; run++) {
      expand(daily, "2046-03-05T00:00:00Z", "2046-03-12T00:00:00Z");
    }
    const msForEach = (performance.now() - startedAt) / 100;

    // Walking 7,300 days would take several milliseconds. This takes a small part of one.
    expect(msForEach).toBeLessThan(2);
  });

  it("includes an occurrence that starts before the range and ends inside it", () => {
    const night = { ...daily, start: "2026-03-02T17:30:00.000Z", end: "2026-03-02T19:30:00.000Z" };
    // 23:00 to 01:00 in India. The range starts at midnight in India.
    const events = expand(night, "2026-03-03T18:30:00Z", "2026-03-04T18:30:00Z");

    expect(starts(events)).toEqual(["2026-03-03T17:30:00.000Z", "2026-03-04T17:30:00.000Z"]);
  });

  it("stops after `until`", () => {
    const limited = series({ frequency: "daily", until: "2026-03-04T04:30:00.000Z" });

    expect(starts(expand(limited, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z"))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-03T04:30:00.000Z",
      "2026-03-04T04:30:00.000Z",
    ]);
  });

  it("stops after `count` occurrences", () => {
    const three = series({ frequency: "daily", count: 3 });

    expect(expand(three, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z")).toHaveLength(3);
  });

  it("counts from the first occurrence, also when the range starts later", () => {
    const five = series({ frequency: "daily", count: 5 });

    // The five are 2 to 6 March. Only two of them are in this range.
    expect(starts(expand(five, "2026-03-05T00:00:00Z", "2026-04-01T00:00:00Z"))).toEqual([
      "2026-03-05T04:30:00.000Z",
      "2026-03-06T04:30:00.000Z",
    ]);
  });
});

describe("expandRecurrence: the clocks change", () => {
  /** Every day at 10:00 in New York, from Friday 6 March 2026. */
  const newYork: CalendarEvent = {
    id: "ny",
    title: "Call",
    start: "2026-03-06T15:00:00.000Z",
    end: "2026-03-06T15:30:00.000Z",
    recurrence: { frequency: "daily", timeZone: NEW_YORK },
  };

  it("keeps 10:00 on the wall clock of the zone of the series, so the instant moves by an hour", () => {
    const events = expand(newYork, "2026-03-06T05:00:00Z", "2026-03-10T04:00:00Z");

    expect(starts(events)).toEqual([
      "2026-03-06T15:00:00.000Z",
      "2026-03-07T15:00:00.000Z",
      // The clocks went forward: 10:00 in New York is now 14:00 UTC.
      "2026-03-08T14:00:00.000Z",
      "2026-03-09T14:00:00.000Z",
    ]);
  });

  it("keeps the length of the event across the change", () => {
    const events = expand(newYork, "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z");

    expect(events[0].end).toBe("2026-03-08T14:30:00.000Z");
  });

  it("moves an occurrence at a time the clocks skip on by the size of the jump", () => {
    // Every day at 02:30 in New York. On 8 March 02:30 does not exist: it becomes 03:30.
    const early = {
      ...newYork,
      start: "2026-03-07T07:30:00.000Z",
      end: "2026-03-07T08:00:00.000Z",
    };
    const events = expand(early, "2026-03-07T05:00:00Z", "2026-03-10T04:00:00Z");

    expect(starts(events)).toEqual([
      "2026-03-07T07:30:00.000Z",
      "2026-03-08T07:30:00.000Z",
      "2026-03-09T06:30:00.000Z",
    ]);
  });
});

describe("expandRecurrence: every week", () => {
  it("repeats on the weekday of the first event when no weekdays are given", () => {
    const weekly = series({ frequency: "weekly" });

    expect(starts(expand(weekly, "2026-03-01T00:00:00Z", "2026-03-20T00:00:00Z"))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-09T04:30:00.000Z",
      "2026-03-16T04:30:00.000Z",
    ]);
  });

  it("repeats on each of the weekdays given", () => {
    // Monday, Wednesday and Friday.
    const weekly = series({ frequency: "weekly", weekdays: [5, 1, 3] });

    expect(starts(expand(weekly, "2026-03-01T00:00:00Z", "2026-03-12T00:00:00Z"))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-04T04:30:00.000Z",
      "2026-03-06T04:30:00.000Z",
      "2026-03-09T04:30:00.000Z",
      "2026-03-11T04:30:00.000Z",
    ]);
  });

  it("leaves out the weekdays of the first week that are before the first event", () => {
    // Sunday and Wednesday. The series starts on Monday 2 March, so Sunday 1 March is not part of it.
    const weekly = series({ frequency: "weekly", weekdays: [0, 3] });

    expect(starts(expand(weekly, "2026-02-25T00:00:00Z", "2026-03-10T00:00:00Z"))).toEqual([
      "2026-03-04T04:30:00.000Z",
      "2026-03-08T04:30:00.000Z",
    ]);
  });

  it("counts every weekday towards `count`", () => {
    const weekly = series({ frequency: "weekly", weekdays: [1, 3, 5], count: 4 });

    expect(starts(expand(weekly, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z"))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-04T04:30:00.000Z",
      "2026-03-06T04:30:00.000Z",
      "2026-03-09T04:30:00.000Z",
    ]);
  });

  it("uses the weekday of the zone of the series, not of UTC", () => {
    // 01:00 on Tuesday 3 March in India is 19:30 on Monday in UTC.
    const lateNight: CalendarEvent = {
      id: "late",
      title: "Night shift",
      start: "2026-03-02T19:30:00.000Z",
      end: "2026-03-02T20:30:00.000Z",
      recurrence: { frequency: "weekly", weekdays: [2], timeZone: KOLKATA },
    };

    expect(starts(expand(lateNight, "2026-03-01T00:00:00Z", "2026-03-12T00:00:00Z"))).toEqual([
      "2026-03-02T19:30:00.000Z",
      "2026-03-09T19:30:00.000Z",
    ]);
  });

  it("finds a week one year later", () => {
    const weekly = series({ frequency: "weekly" });

    // Monday 1 March 2027.
    expect(starts(expand(weekly, "2027-02-28T00:00:00Z", "2027-03-07T00:00:00Z"))).toEqual([
      "2027-03-01T04:30:00.000Z",
    ]);
  });
});

describe("expandRecurrence: every month", () => {
  it("repeats on the same day of the month", () => {
    const monthly = series({ frequency: "monthly" });

    expect(starts(expand(monthly, "2026-03-01T00:00:00Z", "2026-06-01T00:00:00Z"))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-04-02T04:30:00.000Z",
      "2026-05-02T04:30:00.000Z",
    ]);
  });

  it("skips a month that does not have that day", () => {
    const on31st: CalendarEvent = {
      ...series({ frequency: "monthly" }),
      start: "2026-01-31T04:30:00.000Z",
      end: "2026-01-31T05:30:00.000Z",
    };

    // February has no 31st, and April has none.
    expect(starts(expand(on31st, "2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"))).toEqual([
      "2026-01-31T04:30:00.000Z",
      "2026-03-31T04:30:00.000Z",
      "2026-05-31T04:30:00.000Z",
    ]);
  });

  it("finds a month three years later", () => {
    const monthly = series({ frequency: "monthly" });

    expect(starts(expand(monthly, "2029-03-01T00:00:00Z", "2029-04-01T00:00:00Z"))).toEqual([
      "2029-03-02T04:30:00.000Z",
    ]);
  });
});

describe("expandRecurrence: exceptions", () => {
  const rangeFrom = "2026-03-01T00:00:00Z";
  const rangeTo = "2026-03-06T00:00:00Z";

  it("leaves out a cancelled occurrence", () => {
    const daily = series({
      frequency: "daily",
      exceptions: { "2026-03-03T04:30:00.000Z": null },
    });

    expect(starts(expand(daily, rangeFrom, rangeTo))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-04T04:30:00.000Z",
      "2026-03-05T04:30:00.000Z",
    ]);
  });

  it("shows a moved occurrence at its new time, with its new title", () => {
    const moved = {
      title: "Stand-up (late)",
      start: "2026-03-03T09:30:00.000Z",
      end: "2026-03-03T10:00:00.000Z",
    };
    const daily = series({
      frequency: "daily",
      exceptions: { "2026-03-03T04:30:00.000Z": moved },
    });
    const events = expand(daily, rangeFrom, rangeTo);
    const changed = events.find((event) => event.originalStart === "2026-03-03T04:30:00.000Z");

    expect(events).toHaveLength(4);
    expect(changed).toMatchObject({ ...moved, id: "s@2026-03-03T04:30:00.000Z", seriesId: "s" });
  });

  it("shows an occurrence that was moved into the range from outside it", () => {
    // The occurrence of 20 March was moved to 4 March.
    const moved = {
      title: "Stand-up",
      start: "2026-03-04T12:00:00.000Z",
      end: "2026-03-04T13:00:00.000Z",
    };
    const daily = series({
      frequency: "daily",
      exceptions: { "2026-03-20T04:30:00.000Z": moved },
    });

    expect(starts(expand(daily, rangeFrom, rangeTo))).toContain("2026-03-04T12:00:00.000Z");
  });

  it("does not show an occurrence that was moved out of the range", () => {
    const moved = {
      title: "Stand-up",
      start: "2026-03-20T12:00:00.000Z",
      end: "2026-03-20T13:00:00.000Z",
    };
    const daily = series({
      frequency: "daily",
      exceptions: { "2026-03-03T04:30:00.000Z": moved },
    });

    expect(starts(expand(daily, rangeFrom, rangeTo))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-04T04:30:00.000Z",
      "2026-03-05T04:30:00.000Z",
    ]);
  });

  it("counts a cancelled occurrence towards `count`", () => {
    const daily = series({
      frequency: "daily",
      count: 3,
      exceptions: { "2026-03-03T04:30:00.000Z": null },
    });

    expect(starts(expand(daily, rangeFrom, "2026-04-01T00:00:00Z"))).toEqual([
      "2026-03-02T04:30:00.000Z",
      "2026-03-04T04:30:00.000Z",
    ]);
  });
});

describe("editing one event of a series", () => {
  const daily = series({ frequency: "daily" });
  const [, tuesday] = expandRecurrence(
    daily,
    utc("2026-03-01T18:30:00Z"),
    utc("2026-03-08T18:30:00Z"),
  );
  const later = {
    ...tuesday,
    title: "Late",
    start: "2026-03-03T06:30:00.000Z",
    end: "2026-03-03T07:30:00.000Z",
  };

  it("'this event' stores the change as an exception and leaves the rule alone", () => {
    const edited = editOccurrence(daily, tuesday.originalStart ?? "", later);

    expect(edited.start).toBe(daily.start);
    expect(edited.recurrence?.exceptions).toEqual({
      "2026-03-03T04:30:00.000Z": { title: "Late", start: later.start, end: later.end },
    });
    // The series that was passed in is not changed.
    expect(daily.recurrence?.exceptions).toBeUndefined();
  });

  it("'this event' with nothing cancels the occurrence", () => {
    const edited = editOccurrence(daily, "2026-03-03T04:30:00.000Z", null);

    expect(edited.recurrence?.exceptions).toEqual({ "2026-03-03T04:30:00.000Z": null });
    expect(
      starts(expandRecurrence(edited, utc("2026-03-01T18:30:00Z"), utc("2026-03-04T18:30:00Z"))),
    ).toEqual(["2026-03-02T04:30:00.000Z", "2026-03-04T04:30:00.000Z"]);
  });

  it("'this event' twice keeps both exceptions", () => {
    const once = editOccurrence(daily, "2026-03-03T04:30:00.000Z", null);
    const twice = editOccurrence(once, "2026-03-05T04:30:00.000Z", null);

    expect(Object.keys(twice.recurrence?.exceptions ?? {})).toHaveLength(2);
  });

  it("'all events' moves the whole series by as far as the one event moved", () => {
    // Tuesday's event moved two hours later and is now 90 minutes long.
    const edited = editSeries(daily, tuesday, { ...later, end: "2026-03-03T08:00:00.000Z" });

    expect(edited).toMatchObject({
      id: "s",
      title: "Late",
      start: "2026-03-02T06:30:00.000Z",
      end: "2026-03-02T08:00:00.000Z",
    });
    expect(edited.recurrence).toEqual({ frequency: "daily", timeZone: KOLKATA });
  });

  it("'all events' drops the earlier exceptions, because their keys no longer match", () => {
    const withException = editOccurrence(daily, "2026-03-05T04:30:00.000Z", null);

    expect(editSeries(withException, tuesday, later).recurrence?.exceptions).toBeUndefined();
  });

  it("'all events' measures the move on the wall clock, across a clock change", () => {
    // Every day at 10:00 in New York from Friday 6 March. The user moves the event of
    // Monday 9 March (after the change, 14:00 UTC) to 11:00 (15:00 UTC).
    const newYork: CalendarEvent = {
      id: "ny",
      title: "Call",
      start: "2026-03-06T15:00:00.000Z",
      end: "2026-03-06T15:30:00.000Z",
      recurrence: { frequency: "daily", timeZone: NEW_YORK },
    };
    const monday = {
      ...newYork,
      start: "2026-03-09T14:00:00.000Z",
      end: "2026-03-09T14:30:00.000Z",
    };
    const edited = editSeries(newYork, monday, {
      title: "Call",
      start: "2026-03-09T15:00:00.000Z",
      end: "2026-03-09T15:30:00.000Z",
    });

    // The first event, in winter time, is now at 11:00 in New York: 16:00 UTC.
    expect(edited.start).toBe("2026-03-06T16:00:00.000Z");
  });
});

describe("toStoredEdit", () => {
  const daily = series({ frequency: "daily" });
  const plain = {
    id: "p",
    title: "Lunch",
    start: "2026-03-03T07:00:00.000Z",
    end: "2026-03-03T08:00:00.000Z",
  };
  const stored = [daily, plain];
  const [, tuesday] = expandRecurrence(
    daily,
    utc("2026-03-01T18:30:00Z"),
    utc("2026-03-08T18:30:00Z"),
  );
  const later = { ...tuesday, start: "2026-03-03T06:30:00.000Z", end: "2026-03-03T07:30:00.000Z" };

  it("saves a plain event as it is", () => {
    const edited = { ...plain, title: "Long lunch" };

    expect(toStoredEdit(stored, plain, edited, "this")).toEqual({ save: edited });
  });

  it("deletes a plain event by its id", () => {
    expect(toStoredEdit(stored, plain, null, "this")).toEqual({ removeId: "p" });
  });

  it("saves the series with an exception for 'this event'", () => {
    const edit = toStoredEdit(stored, tuesday, later, "this");

    expect(edit).toEqual({ save: editOccurrence(daily, "2026-03-03T04:30:00.000Z", later) });
  });

  it("saves the series with a cancelled occurrence when 'this event' is deleted", () => {
    const edit = toStoredEdit(stored, tuesday, null, "this");

    expect(edit).toEqual({ save: editOccurrence(daily, "2026-03-03T04:30:00.000Z", null) });
  });

  it("saves the moved series for 'all events'", () => {
    expect(toStoredEdit(stored, tuesday, later, "all")).toEqual({
      save: editSeries(daily, tuesday, later),
    });
  });

  it("deletes the series when 'all events' is deleted", () => {
    expect(toStoredEdit(stored, tuesday, null, "all")).toEqual({ removeId: "s" });
  });

  it("never sends the id of one occurrence to the server", () => {
    for (const scope of ["this", "all"] as const) {
      for (const edited of [later, null]) {
        const edit = toStoredEdit(stored, tuesday, edited, scope);
        const id = "save" in edit ? edit.save.id : edit.removeId;
        expect(id).toBe("s");
      }
    }
  });
});
