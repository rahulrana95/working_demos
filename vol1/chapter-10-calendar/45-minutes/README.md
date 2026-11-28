# Chapter 10: Calendar, the 45-minute answer

One day of a calendar: a grid of hours, the events of the day on top of it, and a
form to make, change and delete an event.

This is the senior answer. The staff answer, with 15 more minutes of work, is
in [`../60-minutes`](../60-minutes). What a team adds after the interview is in
[`../production`](../production). The [chapter README](../README.md) compares the three.

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

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                                | In the interview? | Time       | Lines of code |
| ----------------------------------- | ----------------- | ---------- | ------------- |
| `src/calendar/types.ts`             | Yes               | 1 minute   | 18            |
| `src/calendar/layoutDay.ts`         | Yes               | 10 minutes | 40            |
| `src/calendar/time.ts`              | Yes               | 4 minutes  | 29            |
| `src/calendar/useCalendarEvents.ts` | Yes               | 9 minutes  | 65            |
| `src/calendar/EventForm.tsx`        | Yes               | 6 minutes  | 58            |
| `src/calendar/Calendar.tsx`         | Yes               | 10 minutes | 108           |
| `*.test.ts`, `*.test.tsx`           | No                |            |               |
| `src/calendar/testHelpers.ts`       | No                |            |               |
| `src/App.tsx`, `src/api/`           | No                |            |               |
| `src/styles.css`                    | No                |            |               |

Lines of code are counted without blank lines and comments: 318 in total.
The folder has 110 tests.

The component code is 2,463 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/calendar/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 40 minutes of typing for someone who has practised it. The other
5 minutes go to drawing three events on the board: A overlaps B, B overlaps C,
and A and C do not overlap.

## The centre of the answer: `layoutDay`

`layoutDay(events, dayStart, dayEnd)` is a plain function with no React in it.
It gives every event of one day its `top`, `height`, `column` and `columnCount`.
Events that overlap sit side by side.

1. Sort by start. Of two events that start together, the longer is first.
2. Walk down the day and group the events into clusters. A cluster is a run of
   events that overlap, directly or through a chain.
3. Inside a cluster, put each event in the first column that is free again.
   All events of the cluster share the width equally.

Three more rules that the tests pin down:

- An event that crosses midnight is clipped to the day.
- A very short event is drawn 24px tall, and it is laid out as that box, not
  as its real length. So two boxes never cover each other.
- All comparing is done in whole milliseconds. Pixels are worked out at the
  end. An event that ends at 11:00 and one that starts at 11:00 never overlap
  because of rounding.

`dayStart` and `dayEnd` are not in the design brief's signature. The function
needs them to clip an event to the day and to know where pixel 0 is.

## What is NOT handled in this folder

Say these aloud in the interview. Each one is built in another folder.

- **Days on which the clocks change.** This folder shows times in the time
  zone of the browser and treats every day as 24 rows of one hour. On the day
  the clocks go forward, a day is 23 hours long, and the last row would show
  00:00 of the next day. `../60-minutes` handles it.
- **A week view, a time zone you can choose, a cache, translations.** All in
  `../60-minutes`.
- **Moving between days inside the calendar.** The calendar shows the day of
  its `date` prop. The demo page owns the "Previous day" and "Next day"
  buttons.
- **A line for the present time, all-day events, colours, dragging, events
  that repeat.** All in `../production`. The design brief put the line for the
  present time here. It did not fit in the 320 lines, so it moved.

## How the styles ship

The component needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Calendar" heading. The rules above that heading
style the demo page.

- To keep the interview files short, the elements of the calendar carry only
  two class names (`calendar` and `calendar__day`). The other rules find
  their element by its tag or its role inside `.calendar`, for example
  `.calendar li > button` and `.calendar [role="gridcell"] > button`. A real
  package would give every element a class name.
- The colours (`--color-…`) are CSS variables, so a host app can theme the component.
- A slot is 48px tall, which is the `HOUR_HEIGHT` of the layout. A test checks
  that the two numbers are the same.
- The inputs set `font-size: max(16px, 1em)`, because Safari on iPhone zooms
  the page when a focused input has text smaller than 16px.
- The list of events lies over the grid of slots with `pointer-events: none`,
  and each event turns them on again. So a click between two events reaches
  the slot under them. A strip of 16px on the end side is always free.

The measured JavaScript size does not include this CSS. The calendar rules are
824 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Calendar/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                  | What protects us                                                            | Test that proves it                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Three meetings overlap in a chain         | Clusters and columns, not "half the width for each"                         | `uses two columns, not three, when A overlaps B and B overlaps C but A does not overlap C` |
| A day with 500 events                     | One sort and one walk. No event is compared with every other event          | `lays out 500 events of one day without an overlap, and stays fast`                        |
| Any mix of events                         | The layout never puts two boxes of one column over each other               | `never lets two boxes of one column overlap, for 200 random days`                          |
| Times that are not whole pixels           | Comparing in milliseconds, pixels only at the end                           | `keeps back-to-back events apart at times that do not divide evenly into pixels`           |
| The user moves through many days fast     | The old request is aborted and its answer is ignored                        | `ignores an old answer that arrives after a newer one`                                     |
| The user saves the same event twice, fast | The second edit replaces the first. The first answer can never overwrite it | `lets a second edit of the same event replace the first, and aborts the first request`     |
| The server refuses a save                 | The edit is dropped and the confirmed event is back. No old state to copy   | `goes back to the last confirmed event, not to the first edit, when the second edit fails` |
| The parent draws again very often         | New functions from the parent do not start a new load                       | `does not load again when the parent passes new functions with the same range`             |

Measured with `node ../scripts/measure-layout.mjs` on one machine (median of
100 runs): 0.05 ms for 50 events, 0.35 ms for 500 events and 11 ms for 5,000
events in one day. The time grows faster than the number of events, because
each event looks at every column, and a day of 5,000 random events is 425
columns wide.

## Edge cases covered

- An event that ends exactly when the next one starts: no overlap.
- An event of zero minutes, or of five minutes: drawn 24px tall.
- A short event at the very end of the day: its box is moved up, so it stays inside the day.
- An event that started yesterday or ends tomorrow: clipped. An event that covers the whole day: it fills the day.
- An event with a date that cannot be read, or with an end before its start: left out, and the page does not break.
- The same events in another order give the same layout.
- A failed load shows an error with "Try again".
- A failed save or delete is undone, and a message says so.
- A load that finishes while an edit is still on its way does not hide the edit.
- A second edit of the same event while the first is on its way: the first request is aborted, and the second wins.
- A save is not aborted when the calendar is removed, so the edit still reaches the server. A load is aborted.
- An end that is not after the start, or an empty date: the form says so and does not save.
- An empty title, or a title of only spaces: the browser refuses it (`required` and `pattern`).
- An event that ends on the next day can be made in the form.
- Escape closes the form. Escape that closes the popup of a Hindi or Japanese keyboard does not.
- The `date` prop changes inside the same day: no new request.

## Accessibility

- The events of the day are one list (`<ol>`) in time order, named "Events,
  Tuesday 3 March 2026". Each event is a button with a full spoken label:
  "Design review, 10:00 to 11:00, Tuesday 3 March 2026". This is the list
  alternative: a screen reader user reads the day as a list, without the grid.
- The empty slots are a grid (`role="grid"`, one row and one cell for each
  hour) named "New event, Tuesday 3 March 2026". Each cell holds one button.
  One slot is a Tab stop, and ArrowDown and ArrowUp move between the slots.
  This is the roving tabindex of the WAI-ARIA grid pattern.
- ArrowDown and ArrowUp also move between the events. Every event is a Tab stop as well.
- Enter or Space on a slot opens the form for a new event. Enter on an event opens it.
- The form is a plain form, not a modal dialog. Focus moves into its title
  when it opens. When it closes, focus goes back to the event, or to the slot
  the user came from if the event is not there.
- Errors are in `role="alert"`, so they are read out. They have a border, so
  they are not marked by colour alone.
- Focus is a real outline. In high-contrast mode an event box keeps its border.
- An event box is at least 24px tall, which is the minimum of WCAG 2.2. It is
  not 44px, because a box of 44px would make a meeting of 15 minutes look
  almost an hour long. The slots and the buttons and inputs of the form are 44px or more.

## Known limits

- If saving a new event fails, the event leaves the screen, and the focus
  that was on it goes back to the page. The error is still read out.
- A load that started before a save finished can bring an older copy of that
  event and put it over the saved one. `../production` compares `updatedAt`.
- When a second edit replaces the first, the first request is aborted here,
  but it may already have reached the server. The server could then store the
  two in the wrong order. `../production` sends edits one at a time.
- An event does not grow into free columns on its side. A, B and C of the
  example are all half wide, although C has nothing beside it at the end.
- The label of an event that crosses midnight says only the day of its start.

## Try it in the demo

1. Look at "Design review (A)", "Budget call (B)" and "Interview (C)": two columns, not three.
2. Click an hour, type a title and press Enter. The event shows at once.
3. Tick "Make the server fail" and make another event. It shows, then it is undone, and a message says so.
4. Press "Load 500 random events into today". No two boxes cover each other.
5. Use Tab, ArrowDown, ArrowUp and Enter without touching the mouse.
