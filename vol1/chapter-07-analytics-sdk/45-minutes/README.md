# Chapter 7: Analytics SDK, the 45-minute answer

A JavaScript library that product teams add to their web apps. It sends events
to our collector, in batches, and it must never break or slow down the page it
runs in.

This is the senior answer. The staff answer is in [`../60-minutes`](../60-minutes).
What a team adds after the interview is in [`../production`](../production).
The [chapter README](../README.md) compares the three.

This chapter is about a library, not a component. The SDK is plain TypeScript
with no React and no styles. React is used only for the demo page.

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

## The API

```ts
const analytics = createAnalytics({
  endpoint: "https://collector.example.com/v1/batch",
  writeKey: "…",
});

analytics.track("checkout_started", { cartValue: 1200 });
analytics.identify("user_42", { plan: "pro" });
analytics.page();
await analytics.flush();
analytics.optOut();
analytics.optIn();
```

| Option            | Default | What it does                                                                |
| ----------------- | ------- | --------------------------------------------------------------------------- |
| `endpoint`        |         | The URL of the collector.                                                   |
| `writeKey`        |         | Says which product the events belong to. It is not a secret.                |
| `flushIntervalMs` | 5000    | Send what is waiting after this long.                                       |
| `batchSize`       | 20      | Send at once when this many events wait. Also the most events in a request. |
| `maxQueueSize`    | 500     | Never hold more events than this. The oldest are dropped first.             |
| `transport`       | `fetch` | How a batch is sent. Tests and the demo pass a fake.                        |

## What is part of the interview

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                               | In the interview? | Time       | Lines of code |
| ---------------------------------- | ----------------- | ---------- | ------------- |
| `src/analytics/types.ts`           | Yes               | 4 minutes  | 34            |
| `src/analytics/uuid.ts`            | Yes               | 2 minutes  | 9             |
| `src/analytics/backoff.ts`         | Yes               | 2 minutes  | 6             |
| `src/analytics/transport.ts`       | Yes               | 4 minutes  | 20            |
| `src/analytics/createAnalytics.ts` | Yes               | 30 minutes | 241           |
| `src/analytics/index.ts`           | No                |            | 11            |
| `*.test.ts`, `testHelpers.ts`      | No                |            |               |
| `src/App.tsx`, `src/api/`          | No                |            |               |
| `src/styles.css`                   | No                |            |               |

Lines of code are counted without blank lines and comments: 310 in the five
interview files. That is about 42 minutes of typing for someone who has
practised it. The other 3 minutes go to walking the interviewer through the
page exit. The folder has 74 tests.

The SDK is 1,466 bytes when it is minified and compressed with gzip. Measure it
again with:

```bash
npx esbuild src/analytics/index.ts --bundle --minify --format=esm | gzip -9 -c | wc -c
```

## What the collector receives

One request is one batch:

```json
{
  "writeKey": "demo",
  "sentAt": 1767323045000,
  "dropped": 0,
  "events": [
    {
      "id": "36b8f84d-df4e-4d49-b662-bcde71a8764f",
      "type": "track",
      "name": "checkout_started",
      "properties": { "cartValue": 1200 },
      "timestamp": 1767323041200,
      "anonymousId": "9c5b94b1-35ad-49bb-b118-8e8fc24abf80",
      "userId": "user_42"
    }
  ]
}
```

- `id` is made once and never changes. A retry can deliver an event twice, so the collector must drop an `id` it has seen.
- `timestamp` is the clock of the device, which can be wrong. `sentAt` is the same clock at the moment of sending. The collector knows its own time of arrival, so it can correct `timestamp` by the difference. `sentAt` is on the batch, not on each event: it is the same for all of them.
- `dropped` is how many events this page has thrown away so far (queue full, or refused by the collector). Without it, nobody would know that data is missing.
- The body is sent as a string, so the browser labels it `text/plain`. The collector must parse it as JSON anyway. This keeps the request "simple": the browser sends no CORS preflight request before each batch. The write key is in the body for the same reason.

## The transport contract

The SDK cannot see an HTTP status when a team passes its own `transport`. So a
transport must answer with one of three results:

| Result              | Meaning                                          | What the SDK does                                                                  |
| ------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `{ kind: "ok" }`    | The collector has the batch.                     | Forgets the batch.                                                                 |
| `{ kind: "retry" }` | It may work later: network error, 5xx, 408, 429. | Puts the batch back at the front. Waits 1 s, 2 s, 4 s … up to 30 s, partly random. |
| `{ kind: "drop" }`  | It will never work: any other 4xx.               | Throws the batch away and counts it in `dropped`.                                  |

A transport that throws, rejects or resolves with nothing counts as `retry`.
The transport gets an `AbortSignal`. The SDK aborts it after 10 seconds, and
the transport must then reject, as `fetch` does. The default transport treats
429 like a 5xx: it does not read `Retry-After` (the production folder does).

There is no limit on the number of retries. The wait between them is capped,
the queue is capped, and one page never has more than one request in flight,
so a collector that is down gets at most one request every 15 to 30 seconds
from each open page.

## Why it holds at scale

| Pressure                                       | What protects us                                              | Test that proves it                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A page fires many events                       | Batching: 20 events are one request                           | `sends 25 events as two batches: 20 at once and 5 after the interval`                 |
| The collector is slow                          | One request in flight for each page                           | `sends one request when 10,000 events arrive while a request is in flight`            |
| The collector is down for all pages at once    | The wait doubles after each failure, and half of it is random | `waits twice as long after each failure, and never more than 30 seconds`              |
| The collector comes back                       | A full batch does not jump the retry timer                    | `does not send new full batches while it waits to retry`                              |
| The network is gone for hours                  | The queue holds at most 500 events, and the loss is counted   | `holds at most maxQueueSize events through 10,000 events with the collector down`     |
| A retry delivers a batch twice                 | Every event keeps its id                                      | `sends a failed batch again with the same ids, before newer events`                   |
| The user closes the tab                        | `sendBeacon` on `visibilitychange` and `pagehide`             | `hands the waiting events to sendBeacon when the page becomes hidden`                 |
| The SDK has a bug, or the host passes bad data | Every entry point is wrapped: nothing is thrown into the page | `does not throw for properties that cannot become JSON, and still sends later events` |
| The page is rendered on a server               | No `window`: every method does nothing                        | `does nothing, and does not throw, where there is no window (server rendering)`       |
| The SDK is imported but not used               | No work at import time                                        | `does nothing on import: no listener, no timer, no storage access`                    |

## Edge cases covered

- The host changes its properties object after `track`: the event keeps the values of the call.
- A plain HTTP page has no `crypto.randomUUID`: the id is made another way.
- `localStorage` throws on every call (blocked, full, private window): the SDK works, with an anonymous id that lasts for the page.
- A request gets no answer for 10 seconds: it is aborted and tried again.
- The server answers 429: the batch is retried with the normal backoff.
- The page becomes hidden while a request is in flight: that batch goes out again by beacon, with the same ids, and the answer of the old request is ignored.
- The browser refuses a beacon (too much data): the events stay in the queue and are sent when the page is alive again.
- A browser without `sendBeacon`: `fetch` with `keepalive`.
- A property that cannot become JSON (it points back to itself): the batch that holds it is dropped and counted. Later batches are sent.
- `flush()` while a request is in flight: it waits for that request, then sends the rest.
- `optOut()` while a request is in flight: the request is aborted and its batch is not retried.
- `optIn()` after `optOut()`: events are collected again, with no user id.
- The host calls a method with wrong arguments: nothing is thrown.

## Page exit: which events, and why

The SDK listens to `visibilitychange` (and acts when the page is `hidden`) and
to `pagehide`. It never listens to `unload` or `beforeunload`.

- `hidden` is the last event a page can count on. On a phone, the user switches to another app and the system may kill the browser later with no further event.
- `pagehide` is the fallback for a navigation in a browser that did not report `hidden`.
- `unload` and `beforeunload` are often not fired on phones, and a page with an `unload` handler is kept out of the back/forward cache by some browsers.
- `sendBeacon` hands the data to the browser, which sends it after the page is gone. The browser holds at most 64 KiB of beacon data at a time and returns `false` for more. `sendBeacon` always sends a POST, and no header can be set on it.

## What this answer does not do

The design has more than fits in 45 minutes. This is where the rest lives:

| Feature                                                                                           | Where it is                      |
| ------------------------------------------------------------------------------------------------- | -------------------------------- |
| The queue stored in `localStorage`, and several tabs                                              | [`../60-minutes`](../60-minutes) |
| `optOut()` remembered after a reload                                                              | [`../60-minutes`](../60-minutes) |
| `beforeSend`, typed events                                                                        | [`../60-minutes`](../60-minutes) |
| `Retry-After` for a 429                                                                           | [`../production`](../production) |
| A time limit that also works for a transport that ignores the abort                               | [`../production`](../production) |
| Consent before the user has chosen, the URL scrubber, sampling, session id, size limit of a batch | [`../production`](../production) |

So in this folder: a crash loses up to 500 events; `optOut()` lasts until
`optIn()` or the next page load, and the host app must call it again on each
load; a page event sends the full URL with its query string; a transport that
ignores the abort signal and never answers stops the queue; one event with a
very large property can make a batch too big for a beacon; and the anonymous
id is written to `localStorage` at the first load, which needs the user's
consent in the EU.

The SDK adds two page listeners and never removes them. It is made once for
the life of the page.

## The demo page

The demo page is a plain page of buttons and tick boxes. Every control is a
real `<button>` or `<input type="checkbox">` with a label, is at least 44px
tall, and shows a focus ring. The pressed state of "Opt out" is given by
`aria-pressed`, a thicker border and a tick mark, not by colour alone.

## Try it in the demo

1. Press "Track one event" 25 times. The panel shows a batch of 20 at once and a batch of 5 after five seconds.
2. Tick "Fail with 500" and press "Track one event", then "Flush now". The panel shows the same batch again and again, with longer and longer waits. Untick the box: the batch arrives once, and "Copies the collector dropped by id" stays at 0.
3. Press "Track 600 events" while "Fail with 500" is ticked. "Dropped by the SDK" goes up by 100 at the next request, because the queue holds 500.
4. Press "Track one event" three times and switch to another browser tab. Come back: the panel shows one request "beacon, 3 events".
5. Tick "Fail with 400" and track: the batch is tried once and dropped.
