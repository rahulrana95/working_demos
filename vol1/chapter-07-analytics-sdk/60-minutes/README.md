# Chapter 7: Analytics SDK, the 60-minute answer

A JavaScript library that product teams add to their web apps. It sends events
to our collector, in batches, and it must never break or slow down the page it
runs in.

This is the staff answer: the [45-minute answer](../45-minutes), plus what a
staff candidate adds in 15 more minutes so that the SDK loses less data and
many teams can use it. What a team adds after the interview is in
[`../production`](../production). The [chapter README](../README.md) compares
the three.

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

## What was added to the 45-minute answer

| Addition                                  | Why it matters                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored queue                              | The queue is mirrored to `localStorage`, at most 200 events. A crash, a reload or a refused beacon loses nothing: the next page sends what is left, with the same ids.           |
| Several tabs                              | Each tab stores under its own key. A queue is taken over only when its tab has been silent for a minute, and one tab at a time does the taking, inside a Web Lock.               |
| `optOut()` is remembered                  | The choice is stored. An opt-out also removes the anonymous id and every stored queue, also of other tabs. `optIn()` starts with a new id.                                       |
| `beforeSend(event)`                       | A team can remove personal data from an event, or drop it, before it is queued or stored. If the hook throws, the event is dropped: a failed hook may not have removed the data. |
| Typed events: `createAnalytics<Events>()` | `track` accepts only the event names of the product, each with its own properties. A wrong name or a missing property does not compile.                                          |

These are 118 more lines of code. The two new files, `storage.ts` and
`storedQueue.ts`, are 73 of them.

One new option:

| Option       | Default   | What it does                                                               |
| ------------ | --------- | -------------------------------------------------------------------------- |
| `beforeSend` | no change | Gets every event. Returns the event, a changed copy, or `null` to drop it. |

## What is part of the interview

| File                               | In the interview? | Time       | Lines of code |
| ---------------------------------- | ----------------- | ---------- | ------------- |
| `src/analytics/types.ts`           | Yes               | 5 minutes  | 37            |
| `src/analytics/uuid.ts`            | Yes               | 2 minutes  | 9             |
| `src/analytics/backoff.ts`         | Yes               | 2 minutes  | 6             |
| `src/analytics/transport.ts`       | Yes               | 4 minutes  | 20            |
| `src/analytics/storage.ts`         | Yes               | 2 minutes  | 17            |
| `src/analytics/storedQueue.ts`     | Yes               | 6 minutes  | 56            |
| `src/analytics/createAnalytics.ts` | Yes               | 36 minutes | 283           |
| `src/analytics/index.ts`           | No                |            | 12            |
| `*.test.ts`, `testHelpers.ts`      | No                |            |               |
| `src/App.tsx`, `src/api/`          | No                |            |               |
| `src/styles.css`                   | No                |            |               |

Lines of code are counted without blank lines and comments: 428 in the seven
interview files, 118 more than the 45-minute answer (310). That is about 57
minutes of typing for someone who has practised it. The folder has 123 tests.

The SDK is 1,941 bytes when it is minified and compressed with gzip (45-minute
answer: 1,466). Measure it again with:

```bash
npx esbuild src/analytics/index.ts --bundle --minify --format=esm | gzip -9 -c | wc -c
```

## Why it holds at scale

The rows of the [45-minute README](../45-minutes/README.md) still hold. Their
tests are in this folder too. These rows are new:

| Pressure                                           | What protects us                                                     | Test that proves it                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| The tab crashes, or the browser refuses the beacon | The queue is in `localStorage`, and the next page sends it           | `are sent by the next page, with the same ids`                                   |
| The user has several tabs open                     | One key for each tab: a live tab's queue is never touched            | `are not taken while their tab is alive`                                         |
| Two new tabs find the same old queue               | The take-over runs inside a Web Lock, one tab at a time              | `are sent once when two new tabs open at the same moment`                        |
| The collector is down and other tabs are open      | Each retry stores the queue again, which shows that the tab is alive | `are not taken from a tab that keeps failing: each retry shows it is alive`      |
| The host app also needs `localStorage`             | At most 200 events are stored, and the newest win                    | `never stores more than 200 events, and keeps the newest`                        |
| Hundreds of teams, each with its own events        | Typed events: mistakes are found by the compiler, not in the reports | `refuses an unknown name, a missing property and a wrong type`                   |
| A team's hook has a bug                            | The error stays inside the SDK, and the event is not sent            | `does not let an error in the hook reach the page, and does not send that event` |

## How the tabs share the work

- Each SDK instance stores its queue under `analytics:queue:<writeKey>:<random id>`, with the time of the write. The batch in flight is in the stored queue too, until the collector has it.
- At the start, and after each batch that the collector accepted, the SDK looks for queues of the same write key whose last write is more than 60 seconds old. Their tab has been closed or has crashed. It removes them from storage and puts their events at the front of its own queue. The ids do not change.
- A tab that is alive but cannot reach the collector stores its queue again at every retry, at least every 40 seconds, so its queue never looks old.
- The look-and-remove step runs inside `navigator.locks.request("analytics:take-over", …)`. The lock is held for a moment only, never for the life of the page.
- Without the Web Locks API (older browsers, pages that are not on HTTPS) the step runs without a lock. Two tabs could then, very rarely, both take the same queue. The collector drops the copies by id.
- After a reload the old page's key is less than a minute old. The new page takes it over after the first batch it gets accepted when that minute has passed.

## Edge cases covered, on top of the 45-minute answer

- `localStorage` is full: the write fails without an error, and the events are still sent.
- A stored queue holds broken text: it is removed, and nothing is thrown.
- A stored queue of another write key is left alone.
- A user who has opted out: the queues of old tabs are not sent.
- An opt-out removes the queues that other tabs stored. The only key left is `analytics:optOut`.
- `beforeSend` returns `null`: the event is dropped and not counted as a loss.
- `beforeSend` changes the event: the host's own object is not changed, and the removed data never reaches `localStorage`.
- An old queue would make our queue longer than `maxQueueSize`: the oldest events are dropped and counted.

## What this answer does not do

The design has more than fits in 60 minutes. This is where the rest lives:

| Feature                                                             | Where it is                      |
| ------------------------------------------------------------------- | -------------------------------- |
| Consent before the user has chosen (`"pending"`), `setConsent`      | [`../production`](../production) |
| The default scrubber that removes query strings from page URLs      | [`../production`](../production) |
| Sampling (`sampleRate`) and the session id                          | [`../production`](../production) |
| A batch cut at about 60 KB, for the 64 KiB limit of `sendBeacon`    | [`../production`](../production) |
| `Retry-After` for a 429                                             | [`../production`](../production) |
| A time limit that also works for a transport that ignores the abort | [`../production`](../production) |
| `AnalyticsProvider` and `useAnalytics` for React                    | [`../production`](../production) |

Say these out loud in the interview. They are short to explain and long to type.

Known weak points of the code in this folder:

- **`track()` is not cheap any more.** Every call writes the whole stored queue to `localStorage` again. With a short queue that is a few hundredths of a millisecond. With the collector down and 200 events stored, we measured about 0.1 ms for one call in Chromium (see the [chapter README](../README.md)). The production folder moves this work to idle time.
- A property that cannot become JSON still costs the whole batch, as in the 45-minute answer.
- A page event still sends the full URL with its query string, unless the team's `beforeSend` removes it.
- A tab that is alive but has not stored for more than a minute (a `flushIntervalMs` above 60 seconds, or a background tab whose timers the browser has slowed down) can have its stored queue taken by another tab. Both then send the events, and the collector drops the copies by id.
- A stored queue has no age limit. Events of a tab that crashed a month ago are sent at the next visit, with their old `timestamp`.
- The stored queue is limited by a count of events, not by bytes. A write that is too big for the storage fails silently, and those events are then only in memory.

## The demo page

The demo page is the one of the 45-minute answer with two more things: a tick
box that makes `beforeSend` throw, and a count of the events in
`localStorage`. The same rules hold: real buttons and tick boxes with labels,
44px tall, a focus ring, and no state shown by colour alone.

## Try it in the demo

1. Do the steps of the [45-minute demo](../45-minutes/README.md#try-it-in-the-demo). They work the same.
2. Tick "Make the beforeSend hook throw" and press "Track one event". Nothing breaks, the console shows no error, and "Dropped by the SDK" goes up at the next request.
3. Tick "Fail with 500" and "Refuse beacons on page exit", press "Track one event" five times and reload the page. The reload clears the tick boxes, and "Events in localStorage" shows 5: the old page could not send them. Wait a minute and press "Track one event". After that batch is accepted, the new page takes over the 5 old events and sends them.
4. Press "Opt out" and reload the page. The button is still pressed, and events are not collected.
