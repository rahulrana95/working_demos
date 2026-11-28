# Chapter 10: Calendar, the production version

**This is not an interview answer.** Nobody writes this in 45 or 60 minutes.
It is the [60-minute answer](../60-minutes) plus what a team builds in the
first weeks, before real users plan their day with it: events that repeat, a
month view, dragging, a page that stays small with thousands of events,
conflicts, working offline, and monitoring.

In an interview you do not type any of this. You name one or two of these when
the interviewer asks, "What would you do next?" The [chapter README](../README.md)
compares the three folders.

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

## The files

Every source file starts with `NOT PART OF THE INTERVIEW: production version.`

| File                                | What it holds                                                                         | Lines of code |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ------------- |
| `src/calendar/types.ts`             | The event, the rule of a series, the server functions, the two errors, the log events | 55            |
| `src/calendar/layoutDay.ts`         | The layout of one day. As in `../60-minutes`, but an all-day event is left out        | 40            |
| `src/calendar/time.ts`              | Time zones and formatters. As in `../60-minutes`, plus `dateOf` and the month texts   | 65            |
| `src/calendar/recurrence.ts`        | `expandRecurrence`, and "this event" or "all events" as plain functions               | 137           |
| `src/calendar/boundBoxes.ts`        | The limit of columns ("+N more") and the window of boxes near the screen              | 44            |
| `src/calendar/monthGrid.ts`         | The 42 days of a month view, and the events of one day                                | 38            |
| `src/calendar/dragEvent.ts`         | What a drag does to an event, as one plain function                                   | 26            |
| `src/calendar/timeout.ts`           | A time limit for any request                                                          | 50            |
| `src/calendar/writeQueue.ts`        | The queue of edits: in order, kept while offline, kept over a reload                  | 117           |
| `src/calendar/messages.ts`          | Every text, and the plural forms                                                      | 48            |
| `src/calendar/useCalendarEvents.ts` | Loading by week, the queue, conflicts, other tabs, the log events                     | 210           |
| `src/calendar/useEventDrag.ts`      | Moving and resizing by pointer and by keyboard                                        | 136           |
| `src/calendar/EventForm.tsx`        | The form, with "All day", "Repeat" and "this event or all events"                     | 146           |
| `src/calendar/TimeGrid.tsx`         | The day view and the week view                                                        | 234           |
| `src/calendar/MonthView.tsx`        | The month view                                                                        | 115           |
| `src/calendar/Calendar.tsx`         | Puts the parts together                                                               | 189           |

Lines of code are counted without blank lines and comments: 1,650 in total,
against 422 in the 60-minute answer. The folder has 445 tests.

The component code is 9,924 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/calendar/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What this folder adds

| Addition                                    | Why it matters                                                                                                                                         | Test that proves it                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Series (`recurrence`, `expandRecurrence`)   | The server stores one event with a rule. Only the days of the visible range are worked out, on the wall clock of the zone the series was made in.      | `keeps 10:00 on the wall clock of the zone of the series, so the instant moves by an hour` |
| "This event" or "all events"                | An edit of one day becomes an exception of the series. An edit of all days moves the series.                                                           | `'This event' saves the series with one changed occurrence, and the other days stay`       |
| Month view (`view="month"`)                 | Six weeks, three events for each day, then "+5 more", which asks the page for the day view (`onNavigate`).                                             | `shows three events of a busy day and '+5 more' for the rest`                              |
| A bounded page (`maxColumns`)               | A day draws at most 4 columns in a week, and only the boxes near the hours on screen.                                                                  | `draws the same number of boxes for 5,000 events as for 50,000`                            |
| Drag to move, drag the lower edge to resize | Pointer events, so mouse, finger and pen are one code path. Snaps to 15 minutes. The other events make room while the box moves.                       | `moves the box while the pointer moves, before anything is saved`                          |
| Move with the keyboard                      | M starts it, the arrow keys move by 15 minutes or by a day, Shift and an arrow key change the end, Enter saves, Escape cancels. Each step is read out. | `moves by a quarter of an hour with ArrowDown and ArrowUp, and says the new time`          |
| All-day events (`allDay`)                   | A date, not an instant. The same dates in every time zone. A row of their own above the hours.                                                         | `shows it on the same date in every time zone`                                             |
| The line for the present time               | Moves once a minute. Marked on the column of today too.                                                                                                | `is drawn at the present time of the day`                                                  |
| A queue of edits (`writeQueue.ts`)          | Edits are sent one at a time, in order. Two saves of one event can never arrive the wrong way round.                                                   | `sends one write at a time, in the order they were made`                                   |
| Working offline (`OfflineError`)            | The edit stays on screen and in localStorage, and is sent again later. No timer tries again and again.                                                 | `shows and sends the edits of the last visit when the calendar starts`                     |
| Conflicts (`ConflictError`, `updatedAt`)    | When someone else changed the event first, the server's version is shown and the user is told.                                                         | `shows the server's version and tells the user when someone else changed the event first`  |
| Newer wins                                  | A slow load cannot put an old copy over an event that was saved after the load began.                                                                  | `keeps the newer copy when a slow load brings an older copy of an event`                   |
| Other tabs (`storageKey`)                   | A confirmed edit is sent to the other tabs of the browser over a `BroadcastChannel`.                                                                   | `tells the other tabs about an event the server confirmed, and they show it`               |
| Time limits (`timeoutMs`)                   | A request that never answers ends as a failure after 10 seconds.                                                                                       | `reports an error when the load takes longer than the limit, and aborts it`                |
| Monitoring (`onEvent`)                      | What happened and how long it took. Never a title, an id or a date.                                                                                    | `never puts a title, an id or a date of the user in an event, through a whole session`     |
| Plural forms (`Intl.PluralRules`)           | "1 more event", "5 more events", and the right form in languages with more than two.                                                                   | `uses the plural rules of the language, not the rules of English`                          |
| Print styles                                | The whole day is printed, without the form and the buttons, and every box is drawn.                                                                    | `draws every box for printing, because paper cannot scroll`                                |

## The contract with the server

The page passes three functions. The calendar cannot see HTTP status codes, so
the contract is about what they resolve with and what they throw.

| Function                                    | Resolve with                               | Throw                                                                                                              |
| ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `fetchEvents(rangeStart, rangeEnd, signal)` | The events that touch the range            | Anything, if they could not be loaded                                                                              |
| `saveEvent(event, signal)`                  | The stored event, with its new `updatedAt` | `ConflictError(current)` if someone else changed it first. `OfflineError` if the request did not reach the server. |
| `deleteEvent(id, signal)`                   | Nothing                                    | The same as `saveEvent`                                                                                            |

- A series is one event with a `recurrence`. The server sends it once for any
  range it touches. The client works out its days.
- The client makes the id of a new event (`crypto.randomUUID()`), so sending a
  save twice stores one event.
- The client sends back the `updatedAt` it last saw. The server refuses the
  save with `ConflictError` if its own value is different.
- Any other error means "refused": the edit is undone and the user is told.
- After a time limit, or an `OfflineError`, the edit stays in the queue.

## The events for monitoring

`onEvent` receives one of these. Durations are in milliseconds.

| `type`          | Other fields                            | When                                                                    |
| --------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `view_changed`  | `view`, `durationMs`                    | A new view or a new range is on screen with its events                  |
| `events_loaded` | `weekCount`, `eventCount`, `durationMs` | A request for events was answered                                       |
| `event_created` | `durationMs`                            | The server stored a new event. The time runs from the user's action     |
| `event_moved`   | `by`, `durationMs`                      | The server stored a changed event. `by` is `drag`, `keyboard` or `form` |
| `event_deleted` | `durationMs`                            | The server deleted an event                                             |
| `save_queued`   | `queueLength`                           | Edits started to wait for the connection                                |
| `save_failed`   | `reason`, `durationMs`                  | An edit was undone. `reason` is `server` or `conflict`                  |

## How the styles ship

The component needs the rules in `src/styles.css` under the three "Calendar"
headings. The rules above them style the demo page. In this folder every
element has a class name (`calendar__event`, `calendar__more`, `calendar__now`, …).

- `touch-action: none` on an event in the time grid. Without it the browser
  takes a touch that starts on an event for scrolling, and cancels the drag.
- The hours scroll inside the calendar (`max-height: 70vh`), and the row of day names stays on screen.
- The event that is being moved, the "+N more" box, the line for the present
  time and the mark for today are all drawn with borders, not with colour
  alone, so high-contrast mode keeps them.
- `@media print` shows the whole day and hides the form, the page controls and
  the messages about the connection.

The calendar rules are 1,543 bytes, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Calendar/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                          | What protects us                                                                     | Test that proves it                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 5,000 events in one day           | At most `maxColumns` columns are kept. The rest is one count                         | `never keeps more boxes than the limit side by side, for 5,000 events in a day` |
| 5,000 events in one week          | Only the boxes near the hours on screen are in the page                              | `draws only the boxes near the hours on screen`                                 |
| 5,000 events in one month         | Three events and one "+N more" for each day                                          | `keeps the number of boxes small for a month with 5,000 events`                 |
| A daily meeting made 20 years ago | The walk starts near the visible range, not at the first event                       | `is as fast for a week 20 years later as for the first week`                    |
| A month view                      | Six weeks are one request, and weeks already loaded are not asked for again          | `asks only for the weeks it does not have, one request for each gap`            |
| The user edits fast               | One request at a time, in order                                                      | `sends the second edit of an event after the first, never both at once`         |
| The network is down for an hour   | The queue waits. It sends again on `online`, when the tab is shown, or on "Send now" | `does not try again by itself`                                                  |
| A box is dragged across days      | The handlers are on the window, so they outlive the box                              | `keeps the drag alive when the box is drawn again in another list`              |
| The server never answers          | Every request has a time limit                                                       | `rejects with a TimeoutError when the time runs out, and aborts the request`    |

In a real browser, with 5,000 events in one week and a window 900px tall, the
page held 496 event boxes and 1,875 elements in the calendar (the browser check
of this chapter).

## Accessibility

Everything in the [60-minute list](../60-minutes/README.md#accessibility), and:

- **Dragging has a keyboard way.** M on an event starts a move
  (`aria-keyshortcuts="M"`). A hidden status line says the new time after each
  step and how to finish. The form is a second way: start and end can be typed.
- A move with the keyboard keeps the focus on the event when the event goes to another day.
- The month view is a grid named after the month. The arrow keys move between
  the days. Only the day the user is on is a Tab stop, with its events.
- "+N more" has a full name: "5 more events, Tuesday 3 March 2026".
- An event of a series asks "This event" or "All events of the series" with two radio buttons in a named group.
- The message about waiting edits is a `role="status"`: it is read out, but it does not interrupt.

## Known limits, described in the book but not built here

Series:

- The full iCalendar rules (RRULE): "every second week", "the last Friday of
  the month", "the 2nd and the 15th", lists of extra dates. Use a library for these.
- "This and the following events" as a third choice.
- Changing the rule of a series that exists (its frequency, its end date, its
  count) in the form. The form sets "Repeat" only on an event that does not repeat yet.
- "All events" drops the earlier changes of single days, because their keys no longer match.
- Expanding a series on the server. Here the client always expands it.
- A month without the day of a monthly series (the 31st) has no event. Some
  calendars use the last day of the month instead.

Dragging:

- A finger that starts on an event drags it at once. Most calendars wait for a
  long press, so that the same finger can also scroll.
- The grid does not scroll by itself when a box is dragged to its edge.
- Dragging over empty slots to make a new event. Dragging in the month view. Dragging an all-day event.
- A move with the pointer is not read out step by step. The keyboard move is.
- The handle for resizing is 8px tall. With a finger, use the form or the keyboard.

A bounded page:

- The lists hold only the boxes near the hours on screen. So the list a screen
  reader user reads is only part of the day. A separate list view ("agenda")
  of the whole day would fix that.
- The slots are all drawn (24 rows by 7 days). Only the events are windowed.
- "+N more" opens the day view, which has its own limit of 12 columns.
- An event does not grow into free columns on its side.

Offline, conflicts and tabs:

- The queue is in localStorage as plain text, with the titles of the unsent
  events. On a shared computer that is a risk to name.
- Two tabs that both start with the same saved queue both send it. The Web
  Locks API would let one tab own the queue.
- After a time limit the edit is sent again. If the first try did reach the
  server, the second is answered with a conflict, and the user reads "someone
  else changed this event" about their own edit.
- Loading while offline shows the error. The loaded events are not kept for
  the next visit (IndexedDB, a service worker).
- The queue has no size limit, and a waiting edit is not marked on its box.
- Other tabs hear about edits. Other devices and other people do not: there is
  no push from the server (WebSocket, server-sent events) and no polling. An
  event that someone else deletes stays until a reload.
- A conflict is settled by "the server wins". There is no screen to compare the two versions.
- No automatic retry of a failed load, and no wait that the server asks for
  (`Retry-After`). The user presses "Try again".

Time:

- On the day the clocks go back, two slots show 01:00 with the same label.
- A few time zones change their clocks by 30 minutes. There the last row of the day is half an hour too tall.
- No second column for another time zone. No week numbers.
- The newer `Temporal` API is not used. It was not in every browser when this was written.

Other:

- Undo after a delete or a move.
- Guests, invitations, reminders, rooms, "busy" and "free", several calendars, search.
- Events that the user may read but not change.
- If saving a new event fails, the event leaves the screen and the focus that was on it goes back to the page.
- Field numbers from real users (INP, long tasks). `onEvent` gives durations of loads and saves only.
- Print is one long page for a day. It is not laid out as one sheet for a week.
- The calendar was checked with the keyboard and with automated tests, not with a real screen reader.

## Try it in the demo

1. Drag "Lunch" down. Drag its lower edge. Drag it to another day.
2. Tab to an event, press M, press ArrowDown twice and ArrowRight once, then Enter.
3. Tick "Make the server fail" and drag an event. It moves, then it goes back, and a message says so.
4. Tick "Go offline" and drag an event. It stays where you dropped it, and a
   message counts the waiting change. Reload the page: it is still there.
   Untick the box and press "Send now".
5. Press "Let someone else change an event of today", then move that event. You get their version and a message.
6. Click "Coffee (every day)", change its time, and choose "This event" or "All events of the series".
7. Press "Month". Press "+13 more" on today.
8. Press "Load 5,000 random events into this week". The panel shows about 500 event boxes in the page, not 5,000.
9. Open the page in a second tab and move an event. The first tab shows the move.
