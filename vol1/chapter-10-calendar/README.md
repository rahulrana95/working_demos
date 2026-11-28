# Chapter 10: Calendar

A calendar like the ones people use at work: a day and a week with events,
making an event and moving it.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                            |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | One day: events that overlap sit side by side, a form to make, change and delete, saves that show at once.            |
| [`60-minutes`](60-minutes) | Staff                   | The same, plus a week view, any time zone with its clock changes, a cache of weeks, and texts that can be translated. |
| [`production`](production) | Not an interview answer | The staff answer, plus dragging, series, a month view, a page that stays small, conflicts, offline and monitoring.    |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are the lines in `src/calendar`, without tests, test helpers,
blank lines and comments. The size is the component code without React,
minified and compressed with gzip. Each folder's README has the command that
measures it. For the two interview answers the lines are the files you write
in the interview, so without `index.ts` (5 and 8 lines). For `production` they
are all sixteen files.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 110   | 318           | 2,463 bytes             | 824 bytes           |
| `60-minutes` | 187   | 422           | 3,369 bytes             | 968 bytes           |
| `production` | 445   | 1,650         | 9,924 bytes             | 1,543 bytes         |

The two interview answers have a hard limit, because the book promises they
can be typed in the stated time: 320 lines for `45-minutes` and 430 for `60-minutes`.

## Which feature lives in which folder

The design of the chapter asked for more than fits in those limits. So some
features moved one folder down. This table is the truth about where each one is.

| Feature                                                                   | 45-minutes | 60-minutes | production |
| ------------------------------------------------------------------------- | ---------- | ---------- | ---------- |
| `layoutDay`: clusters and columns, clipped at midnight, a smallest height | Yes        | Yes        | Yes        |
| Day view, with a grid of slots and a list of events                       | Yes        | Yes        | Yes        |
| Make, change and delete an event in a form                                | Yes        | Yes        | Yes        |
| A save shows at once and is undone if the server says no                  | Yes        | Yes        | Yes        |
| Times stored in UTC and shown with `Intl.DateTimeFormat`                  | Yes        | Yes        | Yes        |
| Keyboard, spoken labels, focus goes back after the form                   | Yes        | Yes        | Yes        |
| Week view, events that span days                                          |            | Yes        | Yes        |
| A `timeZone` prop, days of 23 and 25 hours                                |            | Yes        | Yes        |
| Events loaded by week, kept, and the neighbour weeks loaded ahead         |            | Yes        | Yes        |
| `messages`, week start and clock by language, right-to-left               |            | Yes        | Yes        |
| The line for the present time                                             |            |            | Yes        |
| Drag to move, drag to resize, move with the keyboard                      |            |            | Yes        |
| All-day events in a row above the hours                                   |            |            | Yes        |
| Series, exceptions, "this event" or "all events"                          |            |            | Yes        |
| Month view with "+3 more"                                                 |            |            | Yes        |
| A bounded page for a very busy week                                       |            |            | Yes        |
| Conflicts, the offline queue, other tabs                                  |            |            | Yes        |
| Print styles, `onEvent`                                                   |            |            | Yes        |

Two more choices kept the interview answers inside their limits:

- In both, **the page owns the date** (and in `60-minutes` the view). The
  calendar shows what its `date` prop says. The "Previous" and "Next" buttons
  are on the demo page. In `production` the calendar asks the page for another
  day with `onNavigate`.
- In both, the calendar elements carry few class names, and the CSS finds them
  by tag and role. `production` gives every element a class name.

## What the extra 15 minutes buys

The 45-minute answer is right for one day in the time zone of the browser.
The 60-minute answer is right for a team in Bengaluru and New York.

| Addition                         | Why it matters                                                                                                              | Minutes |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| Time zones done properly         | A day is 23 or 25 hours long twice a year. The grid, the layout and the form are right on those days.                       | 5       |
| Week view                        | Seven calls of the same layout function. An event that crosses midnight is drawn in both days.                              | 4       |
| A cache of weeks, loaded ahead   | "Next" shows its events at once. Going back costs no request. Jumping fast leaves one request alive.                        | 3       |
| `messages` and language settings | No English is fixed in the component. The week starts on the right day, and the clock has 12 or 24 hours, for the language. | 3       |

## What the first weeks add

The `production` folder is what a team builds after the interview. Do not try
to write it in an interview. Know that it exists, and name one or two of its
parts when the interviewer asks, "What would you do next?" The
[production README](production/README.md) lists every part, names the test that
proves it, and has the full list of what is still not built.

## Measure the layout function

`scripts/measure-layout.mjs` runs `layoutDay` in Node for one day with 50, 500
and 5,000 events and prints the median time of 100 runs. Install the packages
of a folder first, because the script reads its TypeScript file:

```bash
cd 45-minutes && npm install && cd ..
```

```bash
node scripts/measure-layout.mjs
```

To measure another folder, pass its name: `node scripts/measure-layout.mjs production`.

This is the 45-minute answer on our machine (Node 22, an Intel Xeon at 2.3 GHz):

```text
   50 events: median 0.047 ms of 100 runs (fastest 0.032, slowest 3.539); widest part of the day: 11 columns
  500 events: median 0.352 ms of 100 runs (fastest 0.304, slowest 0.795); widest part of the day: 46 columns
 5000 events: median 10.959 ms of 100 runs (fastest 9.586, slowest 20.841); widest part of the day: 425 columns
```

What the numbers mean:

- One call lays out one day. A week is seven calls.
- A person with a very full day has 20 to 30 events. That is well under a tenth of a millisecond.
- From 500 to 5,000 events the time grows 31 times, not 10 times. Each event
  looks at every column of its cluster, and the random day of 5,000 events is
  425 columns wide. A real day is never that wide.

What they do not mean:

- They are numbers from one server machine, not from a phone. A mid-range
  phone is several times slower.
- They are the time of the function only. Drawing 5,000 boxes costs the
  browser far more than working out where they go. That is why `production`
  draws at most a few hundred.
- Your numbers will differ from ours, and from one run to the next.
