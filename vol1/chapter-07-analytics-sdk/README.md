# Chapter 7: Analytics SDK

A JavaScript library that product teams add to their web apps. It sends events
to our collector. Its first rule: it must never break or slow down the page it
runs in.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

This chapter is about a library, not a UI component. The SDK is plain
TypeScript with no React and no styles. Each folder is still a Vite project
with a React demo page, so that it runs and tests like the other chapters.

| Folder                     | Level                   | What it is                                                                                                  |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | An SDK that batches, retries with backoff, survives the page exit, stays bounded and never throws.          |
| [`60-minutes`](60-minutes) | Staff                   | The same code, plus a stored queue that several tabs share safely, `beforeSend` and typed events.           |
| [`production`](production) | Not an interview answer | The staff answer, plus the rest of the design and what you add in the first week before real pages load it. |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are the lines in `src/analytics`, without tests, blank lines and
comments. For the two interview answers they are the files you write in the
interview, so without `index.ts` (11 and 12 lines). For `production` they are
all 18 files. The size is the SDK, minified and compressed with gzip. Each
folder's README has the command that measures it.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- |
| `45-minutes` | 74    | 310           | 1,466 bytes             |
| `60-minutes` | 123   | 428           | 1,941 bytes             |
| `production` | 273   | 971           | 4,715 bytes             |

The SDK has no styles. The React wrapper of `production` is a separate entry
file of 305 bytes, without React itself.

## Which feature lives in which folder

The interview answers have a hard line budget: at most 320 lines for 45
minutes and at most 430 for 60. The design is larger than that, so each
feature lives in the first folder where it fits, and in every folder after it.

| Feature                                                                         | 45-minutes | 60-minutes | production |
| ------------------------------------------------------------------------------- | ---------- | ---------- | ---------- |
| `track`, `identify`, `page`, `flush`, the event with its id                     | Yes        | Yes        | Yes        |
| Queue, batches by count and by time, one request in flight                      | Yes        | Yes        | Yes        |
| Retry with backoff and a random part; 4xx drops the batch                       | Yes        | Yes        | Yes        |
| Page exit: `sendBeacon` on `visibilitychange` and `pagehide`                    | Yes        | Yes        | Yes        |
| Bounded queue, with a count of the dropped events                               | Yes        | Yes        | Yes        |
| Nothing throws into the page; no work on import; safe without `window`          | Yes        | Yes        | Yes        |
| `optOut()` and `optIn()`, for the life of the page                              | Yes        | Yes        | Yes        |
| A 10-second time limit, through the abort signal                                | Yes        | Yes        | Yes        |
| `optOut()` remembered after a reload                                            |            | Yes        | Yes        |
| The queue stored in `localStorage`                                              |            | Yes        | Yes        |
| Several tabs: one key for each tab, take-over inside a Web Lock                 |            | Yes        | Yes        |
| `beforeSend`                                                                    |            | Yes        | Yes        |
| Typed events                                                                    |            | Yes        | Yes        |
| Consent before the choice (`"pending"`), `setConsent`                           |            |            | Yes        |
| Default scrubber for the URLs of page events                                    |            |            | Yes        |
| Sampling by session, session id                                                 |            |            | Yes        |
| A batch cut at about 60 KB                                                      |            |            | Yes        |
| `Retry-After` for a 429                                                         |            |            | Yes        |
| A time limit that works when the transport ignores the abort                    |            |            | Yes        |
| React: `AnalyticsProvider`, `useAnalytics`                                      |            |            | Yes        |
| Idle-time work, loader snippet, automatic page events, plugins, health counters |            |            | Yes        |
| Debug mode, `onError`, `shutdown`, library build, size budget                   |            |            | Yes        |

## What the extra 15 minutes buys

The 45-minute answer keeps events in memory. That is correct and bounded, but
a crashed tab loses its queue, and nothing protects a team from sending data
it should not send. The 60-minute answer fixes both.

| Addition                 | Why it matters                                                                                                            | Minutes |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------- |
| Stored queue             | A crash, a reload or a refused beacon loses nothing. The next page sends what is left, with the same ids.                 | 5       |
| Several tabs             | Five open tabs do not send the same stored events five times, and a live tab's queue is never taken.                      | 5       |
| `optOut()` is remembered | The choice holds after a reload, and it removes what was stored.                                                          | 1       |
| `beforeSend`             | A team removes personal data before the event is queued or stored. A hook that throws drops the event and breaks nothing. | 2       |
| Typed events             | A wrong event name does not compile. With hundreds of teams, this is what keeps the reports clean.                        | 2       |

## What the first week adds

The `production` folder is what a team builds after the interview. Do not try
to write it in an interview. Know that it exists, and name one or two of
these when the interviewer asks, "What would you do next?"

| Addition                                | Why it matters                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Consent, scrubber, sampling, session id | The parts of the design that are short to say and long to type.                                             |
| Batch size limit, `Retry-After`         | A batch always fits in a beacon. A rate-limited page waits as long as the collector asks, up to 60 seconds. |
| Idle-time work                          | `track` only writes the call down. Hooks, JSON and storage writes run when the browser is idle.             |
| Loader snippet                          | The page can call the SDK before it has loaded. The calls are replayed with their own time.                 |
| Automatic page events                   | A single-page app sends a page event for each new path.                                                     |
| Plugins                                 | A team adds a field to every event, or hands events to another tool, without a change to the SDK.           |
| Health counters, `onError`, debug mode  | The SDK hides its failures from the page. The team that owns it can still see them.                         |
| Library build and size budget           | ESM, UMD and type declarations. A script fails when the SDK grows past 5,200 bytes.                         |

The [production README](production/README.md) names the test that proves each
one, and has the sections on Content Security Policy, ad blockers and privacy.

## Measure the cost of one track() call

`scripts/measure-track.mjs` calls `track()` 10,000 times in each folder, in
Node and in a real Chromium, and prints how long one call took. It needs
`npm install` to have run in each of the three folders, and
[Playwright](https://playwright.dev) with its Chromium browser for the second half.

```bash
node scripts/measure-track.mjs
```

```bash
node scripts/measure-track.mjs --node
```

It measures two cases. In "working collector" the page gives the event loop a
turn after every 20 calls and every batch is accepted, so the queue stays
short. In "collector down" all calls come in one go and no batch is accepted,
so the queue is full. This is one run on our machine:

```text
Node     | 45-minutes | working collector: median 0.0004 ms, p99 0.0345 ms, worst 0.0951 ms, mean 0.0022 ms
Node     | 45-minutes | collector down: median 0.0003 ms, p99 0.0028 ms, worst 1.0550 ms, mean 0.0011 ms
Node     | 60-minutes | working collector: median 0.0070 ms, p99 0.0524 ms, worst 2.1766 ms, mean 0.0099 ms
Node     | 60-minutes | collector down: median 0.0946 ms, p99 0.1892 ms, worst 0.7138 ms, mean 0.1055 ms
Node     | production | working collector: median 0.0002 ms, p99 0.0013 ms, worst 0.0514 ms, mean 0.0002 ms
Node     | production | collector down: median 0.0003 ms, p99 0.0007 ms, worst 5.2919 ms, mean 0.0009 ms
Chromium | 45-minutes | working collector: median 0.0000 ms, p99 0.1000 ms, worst 5.3000 ms, mean 0.0053 ms
Chromium | 45-minutes | collector down: median 0.0000 ms, p99 0.1000 ms, worst 3.1000 ms, mean 0.0042 ms
Chromium | 60-minutes | working collector: median 0.0000 ms, p99 0.4000 ms, worst 4.4000 ms, mean 0.0461 ms
Chromium | 60-minutes | collector down: median 0.1000 ms, p99 0.4000 ms, worst 5.9000 ms, mean 0.1399 ms
Chromium | production | working collector: median 0.0000 ms, p99 0.0000 ms, worst 0.2000 ms, mean 0.0004 ms
Chromium | production | collector down: median 0.0000 ms, p99 0.0000 ms, worst 0.4000 ms, mean 0.0004 ms
```

What the numbers mean:

- The 45-minute answer is cheap: `track` adds an object to an array. The slow calls are the ones that start a request.
- The 60-minute answer pays for its stored queue. Every `track` writes the queue to `localStorage` again: about 0.1 ms for a call when 200 events are stored. That is the price of the simple design, and the reason the production folder exists.
- The production folder does the storing in idle time, once for many events. `track` is cheaper than in the 45-minute answer, and it stays cheap when the collector is down.

What they do not mean:

- They are lab numbers from one desktop computer. They are not numbers from real users on real phones.
- In Node, `localStorage` is a fake made of a `Map`, so the storage writes cost less than in a browser.
- The clock of a page in Chromium has steps of 0.1 ms here. A median of 0.0000 means "less than one step", and the mean is the better number to compare.
- The worst call is one call out of 10,000. A pause of the JavaScript engine can land on any of them, so it changes from run to run.
- Your numbers will differ from ours, and from one run to the next.
