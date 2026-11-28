# Chapter 10: Calendar, the 60-minute answer

A day view and a week view of a calendar, in any time zone, with the events
loaded one week at a time.

This is the staff answer: the [45-minute answer](../45-minutes) plus what a
staff candidate adds in 15 more minutes. What a team adds after the interview
is in [`../production`](../production). The [chapter README](../README.md) compares the three.

## Run it

You need Node.js 20 or newer.

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

Then open the address that the last command prints, usually `http://localhost:5173`.

## What is part of the interview

| File                                | In the interview? | Time       | Lines of code |
| ----------------------------------- | ----------------- | ---------- | ------------- |
| `src/calendar/types.ts`             | Yes               | 1 minute   | 18            |
| `src/calendar/layoutDay.ts`         | Yes               | 10 minutes | 40            |
| `src/calendar/time.ts`              | Yes               | 8 minutes  | 55            |
| `src/calendar/messages.ts`          | Yes               | 2 minutes  | 19            |
| `src/calendar/useCalendarEvents.ts` | Yes               | 11 minutes | 78            |
| `src/calendar/EventForm.tsx`        | Yes               | 7 minutes  | 66            |
| `src/calendar/Calendar.tsx`         | Yes               | 16 minutes | 146           |
| `*.test.ts`, `*.test.tsx`           | No                |            |               |
| `src/calendar/testHelpers.ts`       | No                |            |               |
| `src/App.tsx`, `src/api/`           | No                |            |               |
| `src/styles.css`                    | No                |            |               |

Lines of code are counted without blank lines and comments: 422 in total.
The folder has 187 tests.

The component code is 3,369 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/calendar/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 55 minutes of typing. The other 5 minutes go to the question
the interviewer asks next: "I made a 10:00 meeting in Bengaluru. My colleague
in New York opens it. What does she see?"

`layoutDay.ts` and `types.ts` are the same as in `../45-minutes`. To see only
what changed, run this in the chapter folder:

```bash
git diff --no-index 45-minutes/src/calendar 60-minutes/src/calendar
```

## What the extra 15 minutes buys

| Addition                      | What it is                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Week view (`view`)            | Seven calls of the same `layoutDay`, one for each day. An event that spans two days is clipped twice and so is drawn in both.          |
| Time zones (`timeZone`)       | Every time is shown and read on the wall clock of the zone you pass. A day is as long as it really is there: 23, 24 or 25 hours.       |
| A cache of weeks              | Events are loaded one week at a time and kept. After the visible week has arrived, the week before and the week after are loaded too.  |
| Texts (`messages`)            | Every text the user reads or hears can be translated. No English is fixed in the component.                                            |
| Week start by language        | Monday in Britain, Sunday in the United States and in India, Saturday in Egypt. Asked from `Intl.Locale`, with Monday as the fallback. |
| Arrow keys in four directions | The slots of a week are a grid of rows and columns. ArrowLeft and ArrowRight turn round in a right-to-left page.                       |
| Logical CSS properties        | The layout mirrors itself in right-to-left languages.                                                                                  |

## What moved out of this folder, and why

The book promises that this folder can be typed in 60 minutes, so it has a hard
limit of 430 lines. The design brief asked for more than fits. These moved to
[`../production`](../production):

- **Dragging an event to move it, dragging its lower edge to resize it, and the
  move with the keyboard.** In this folder an event is moved in the form, which
  works with a mouse, a finger and the keyboard.
- **All-day events and their row above the hours.** The `CalendarEvent` of this
  folder has no `allDay` field.
- **The line for the present time.**

And one thing is owned by the page, not by the calendar: **the date and the
view**. The calendar shows the day or the week of its `date` prop. The demo
page has the "Previous", "Today", "Next", "Day" and "Week" buttons. This is the
same choice as in `../45-minutes`, and it saved about 20 lines.

## How time zones work here

Events are stored as instants in UTC. Everything else is in `src/calendar/time.ts`.

- **Wall time.** `toWall(instant, zone)` gives what a clock on the wall of the
  zone shows, written as if it were a UTC timestamp. On that number we can do
  plain arithmetic, because UTC has no clock changes: the start of the day is
  a division, and the same time on the next date is 24 hours more.
  `fromWall(wall, zone)` turns it back into a real instant.
- **A day is not 24 hours.** We never add 24 hours to an instant to get
  "tomorrow". `startOfDay(instant, zone, plusDays)` asks for the first instant
  of a date. On 8 March 2026 in New York the result is a day of 23 hours, and
  on 1 November 2026 a day of 25.
- **A row is one real hour.** A day has as many rows as it has hours. Each slot
  shows its own time, so the day the clocks go forward has rows 00:00, 01:00,
  03:00, and the day they go back has 01:00 twice. An event is placed by the
  real hours since the start of its day, so it sits on the row that shows its time.
- **A time that does not exist.** 02:30 on 8 March in New York is skipped. If
  the user types it, it becomes 03:30. A time that happens twice (01:30 on
  1 November) is read as the first of the two.
- **A day that does not start at midnight.** In Cairo the clocks go from 00:00
  to 01:00 on 24 April 2026. That day starts at 01:00, and a test checks it.

The other way to draw such a day is a fixed grid of 24 clock hours, with the
skipped hour left empty. Many calendars do that. It keeps one column of hour
names for the whole week. We chose real hours because then the layout function
needs no special case: `top` is always "time since the start of the day".

## How the styles ship

The component needs the rules in `src/styles.css` under the "Calendar" heading.
The rules above that heading style the demo page.

- As in `../45-minutes`, the elements carry few class names (`calendar`,
  `calendar__days`, `calendar__lists`) and the other rules find their element
  by its tag or its role.
- The rules use logical properties (`inset-inline`, `margin-inline`,
  `border-inline-start`), so the layout mirrors in a right-to-left page. A test checks that no
  physical property is left in the calendar rules.
- The row of day names is 32px tall, and the lists of events start 32px from
  the top. A test checks that the two numbers are the same.
- A week on a narrow screen is 760px wide and scrolls sideways.

The calendar rules are 968 bytes, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Calendar/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                   | What protects us                                                  | Test that proves it                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The user presses "Next" again and again    | Each week is loaded once. The next week is already there          | `shows the next week at once when it was loaded ahead, with no request for it`          |
| The user goes back                         | A week seen before costs zero requests                            | `sends no request at all when the user goes back to a week seen before`                 |
| The user jumps through ten weeks fast      | Older requests are aborted, with their neighbour requests         | `leaves one request alive after ten quick steps`                                        |
| Loading ahead must not slow the first view | The neighbour weeks start only after the visible week has arrived | `loads the week before and the week after, but only after the visible week has arrived` |
| A meeting spans two weeks                  | Events are kept by id, so it is held once                         | `keeps one copy of an event that crosses two weeks and so arrives twice`                |
| A busy Tuesday                             | Each day is laid out on its own                                   | `lays out each day on its own, with the same layout function`                           |
| The clocks go forward                      | A day has as many rows as hours                                   | `draws 23 rows on the day the clocks go forward, with no 02:00`                         |
| The clocks go back                         | The same                                                          | `draws 25 rows on the day the clocks go back, with 01:00 twice`                         |
| An event on such a day                     | Placed by real hours since the start of the day                   | `places an event after the jump by the real hours since midnight`                       |
| Many events, many dates                    | One formatter for each time zone, not one for each call           | `makes one formatter for a time zone, however often it is asked`                        |

The layout function is the one of `../45-minutes`, with the same timings:
0.05 ms for 50 events, 0.35 ms for 500 and 11 ms for 5,000 in one day.

The tests name their time zone, so they pass whatever the time zone of the
machine is. Run them in two zones to see it:

```bash
TZ=UTC npm test
```

```bash
TZ=America/New_York npm test
```

## Edge cases covered

Everything in the [45-minute list](../45-minutes/README.md#edge-cases-covered), and:

- One instant is 10:00 in India and 23:30 of the day before in New York. The event is drawn in the right day in both.
- The `timeZone` prop changes while the calendar is on screen: every label, every box and the open form change with it.
- The `date` prop moves to another day of the same week, or the view changes: no new request.
- A week in which the clocks change is asked for with its real length, one hour short or long.
- In a week with a short day, the last slot of that day is an empty, disabled button, so the columns stay in step for the arrow keys.
- An event that spans two days has a box in each, both with the same full label.
- A neighbour week that fails to load is silent, is not kept, and is asked for again when the user goes there.
- An answer for a week whose request was aborted is thrown away, and the week is asked for again later.
- A language whose week starts on Sunday or Saturday. A browser with no week information: Monday.
- A 12 hour clock or a 24 hour clock: the language decides.

## Accessibility

Everything in the [45-minute list](../45-minutes/README.md#accessibility), and:

- Each day has its own list of events, named after the day ("Events, Tuesday
  3 March 2026"). The lists are in the page before the grid of slots.
- The grid of slots has a row of column headers ("Tue 3"), so a screen reader
  says the day of a slot. ArrowUp, ArrowDown, ArrowLeft and ArrowRight move
  between the slots. One slot of the whole grid is a Tab stop.
- The arrow keys also move through the events: down the day, then on to the next day.
- In a right-to-left page ArrowLeft goes to the next day and ArrowRight to the day before.
- No text is fixed in English. A test draws the calendar with Hindi messages
  and checks that no English word is left.

## Known limits

The limits of the [45-minute answer](../45-minutes/README.md#known-limits), and:

- Events that were loaded are kept as long as the calendar is on screen. An
  event that someone else deletes on the server stays here until a reload.
- On the day the clocks go back, two slots show 01:00. Their labels are the
  same. Adding the name of the time zone ("01:00 EDT", "01:00 EST") would tell them apart.
- A few time zones change their clocks by 30 minutes (Lord Howe Island). There
  the day is 23.5 or 24.5 hours long, and its last row is half an hour too tall.
- ArrowRight on the last day of a row goes to the first day of the next row.

## Try it in the demo

1. Press "Next". The week shows at once, and the panel shows one new request: for the week after it.
2. Press "Previous" twice. No new request for a week you have seen.
3. Press "New York, 8 March 2026: a day of 23 hours". Count the rows: 00:00, 01:00, 03:00.
4. Press "New York, 1 November 2026: a day of 25 hours". 01:00 is there twice.
5. Change the time zone to Asia/Kolkata. The same events move, and the day has 24 rows again.
6. Change the language to hi-IN (a 12 hour clock, the week from Sunday) and to ar-EG (right to left, the week from Saturday).
