# Chapter 7: Analytics SDK, the production version

A JavaScript library that product teams add to their web apps. It sends events
to our collector, in batches, and it must never break or slow down the page it
runs in.

**This is not an interview answer.** Nobody writes this in 45 or 60 minutes.
It is the staff answer from [`../60-minutes`](../60-minutes), plus what a team
adds in the first week before real pages load it. It also holds the parts of
the design that do not fit in a 60-minute interview. The
[chapter README](../README.md) compares the three folders.

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

## Build the library and check its size

```bash
npm run build:lib
```

This writes four things to `dist-lib/`:

| File               | What it is                                                                        |
| ------------------ | --------------------------------------------------------------------------------- |
| `analytics.js`     | The SDK as an ES module, for apps that use a bundler.                             |
| `analytics.umd.js` | The SDK as one minified file for a `<script>` tag. It sets `window.AnalyticsSdk`. |
| `react.js`         | `AnalyticsProvider` and `useAnalytics` as an ES module. React is not inside.      |
| `types/`           | The TypeScript declarations, made by `tsc -p tsconfig.lib.json`.                  |

```bash
npm run size
```

This builds the library and then fails when `analytics.umd.js`, compressed
with gzip, is larger than the budget in `scripts/check-size.mjs`. The budget is
5,200 bytes. The file was 4,942 bytes when the budget was set. Run it in CI, so
a change that adds bytes must say so.

## What was added to the 60-minute answer

| Feature                                                  | Why                                                                                                                                                                                                                                                         | Test that proves it                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Consent: `consent`, `setConsent()`                       | Before the user has chosen (`"pending"`), events wait in memory and nothing is sent or stored. After a "no", everything is thrown away and what was stored is removed. `optOut()` and `optIn()` are now `setConsent("denied")` and `setConsent("granted")`. | `holds events in memory: nothing is sent, on a timer or on page exit`, `stores nothing: no id, no session, no queue`              |
| Default scrubber: `scrubPageUrls`                        | A page event loses the query string and the hash of its URLs. They hold email addresses, search words and the tokens of password reset links. It is the default `beforeSend`.                                                                               | `removes the query string and the hash from the URL of a page event`                                                              |
| Sampling: `sampleRate`                                   | A busy product can send one session in ten. The choice comes from the session id, so a session is kept whole or left out whole, in every tab.                                                                                                               | `keeps about one session in ten at 0.1`, `keeps all events of a session or none of them`                                          |
| Session id: `sessionId` on every event                   | It changes after 30 minutes with no event, and all tabs share it.                                                                                                                                                                                           | `changes after 30 minutes with no event`, `stays alive in a quiet tab while the user is active in another tab`                    |
| Size limit of a batch: `MAX_BATCH_BYTES`                 | A batch is cut at about 60 KB, because the browser holds at most 64 KiB of beacon data.                                                                                                                                                                     | `splits a batch that would be larger than about 60 KB`, `keeps every beacon of a page exit under the 64 KiB limit of the browser` |
| Size limit of the stored queue: `MAX_STORED_CHARS`       | The stored queue is limited to 100,000 characters, not to 200 events, so large events cannot fill the storage.                                                                                                                                              | `never stores more than its size limit, and keeps the newest events`                                                              |
| `Retry-After`                                            | For a 429 the SDK waits as long as the collector asks: at least its own backoff, at most 60 seconds. The header can be seconds or a date.                                                                                                                   | `waits as long as the collector asks when it is rate limited`, `never waits more than 60 seconds, whatever the collector asks`    |
| A time limit that needs no help                          | After 10 seconds the batch is retried even when the transport ignores the abort signal. An answer that arrives later is ignored.                                                                                                                            | `ignores an answer that arrives after the time limit`                                                                             |
| React: `AnalyticsProvider`, `useAnalytics`               | A separate entry file, `src/analytics/react.tsx`, so an app without React does not download it. Without a provider the hook returns a client that does nothing.                                                                                             | `does not break the page when there is no provider: the click does nothing`                                                       |
| a. Idle-time work: `idle.ts`                             | `track` only writes the call down. The hooks, the JSON and the `localStorage` write run when the browser is idle (`requestIdleCallback`, or a timer where it does not exist). A click handler is not slowed.                                                | `takes less than 0.05 ms for the median of 10,000 calls`, `sends in the next idle moment when a full batch is waiting`            |
| b. Each event becomes JSON once                          | The request body and the stored queue are made by joining the texts. An event that cannot become JSON is dropped alone, not with its batch.                                                                                                                 | `does not throw for properties that cannot become JSON, and still sends later events`                                             |
| c. Loader snippet: `buildLoaderSnippet`, `startFromStub` | The page gets a small inline script. It makes a stub that records calls, and loads the SDK with an `async` script. Calls made before the SDK arrives are replayed with their own time.                                                                      | `sends the calls made before the SDK loaded, in order, each with its own time`                                                    |
| d. Automatic page events: `trackPages` (default true)    | A single-page app changes the URL with `history.pushState`. The SDK wraps it and `replaceState`, listens to `popstate`, and sends a page event for each new path.                                                                                           | `sends one page event at the start and one for each new path`, `can be turned off: the history methods are not touched`           |
| e. Plugins: `use(plugin)`, `plugins`                     | `enrich` adds to or drops an event. `deliver` hands a copy to another tool. An error in a plugin stays in the SDK.                                                                                                                                          | `can add to every event, after beforeSend`, `does not stop the event from reaching the collector when it throws`                  |
| f. Example destination: `dataLayerDestination`           | One `track` call feeds our collector and a tag manager.                                                                                                                                                                                                     | `pushes the name and the properties of each event to the array, and no ids`                                                       |
| g. Consent for destinations                              | A destination gets nothing while consent is pending or denied.                                                                                                                                                                                              | `gets nothing while consent is pending, and the held events once after a yes`                                                     |
| h. Health counters: `getStats()`                         | `queued`, `sent`, `retried`, `dropped`, `lastError`. A team can show them on a status page or send them to its own monitoring. They hold numbers and one message, never event data.                                                                         | `counts an event as queued from the call until the collector has it`, `never holds event data: only numbers and the last error`   |
| i. Error hook: `onError(error, source)`                  | The SDK hides its failures from the page. The team that owns it still needs to hear about them.                                                                                                                                                             | `is told when beforeSend throws, with the error and where it came from`, `cannot break the SDK or the page when it throws itself` |
| j. Debug mode: `debug`                                   | Logs what is queued, sent and answered to the console, without the properties. Warns once about an event name that breaks the naming rule (`isValidEventName`).                                                                                             | `logs what was queued, sent and answered`, `warns once about an event name that breaks the naming rule`                           |
| k. `shutdown()`                                          | Hands what is waiting to the browser, removes the listeners, the timers and the history wrappers. For a micro-frontend that is removed from the page.                                                                                                       | `hands what is waiting to the browser, then removes its listeners and timers`                                                     |
| l. Library build and size budget                         | ESM, UMD and type declarations. `npm run size` fails over the budget.                                                                                                                                                                                       | `npm run size`                                                                                                                    |

The first nine rows are the parts of the design brief that moved here from
the interview answers, because of the line budgets of those answers. The
rows a to l are what the first week adds.

New options: `consent` (default `"granted"`), `sampleRate` (default 1),
`trackPages` (default `true`), `plugins` (default none), `debug` (default
`false`), `onError`. `beforeSend` now defaults to `scrubPageUrls`. New
methods: `setConsent`, `use`, `getStats`, `replay`, `shutdown`. The opt-out is
stored under `analytics:consent` here, not under `analytics:optOut` as in the
60-minute answer.

The demo page shows them: the health counters, three "Go to" buttons that
change the path like a single-page app, a count of the events handed to the
example destination, and debug logs in the console.

## Lines of code

Counted without blank lines and comments, in `src/analytics`:

| File                              | What it holds                                   | Lines of code |
| --------------------------------- | ----------------------------------------------- | ------------- |
| `types.ts`                        | The contract: events, options, plugins, stats   | 71            |
| `createAnalytics.ts`              | The SDK                                         | 531           |
| `idle.ts`                         | `whenIdle`                                      | 16            |
| `storedQueue.ts`                  | The stored queue and the take-over between tabs | 63            |
| `batchBytes.ts`                   | `byteLength`, `countThatFit`                    | 21            |
| `session.ts`                      | The session id and sampling                     | 23            |
| `scrub.ts`                        | The default scrubber                            | 18            |
| `pageTracking.ts`                 | `watchPageChanges`                              | 36            |
| `loader.ts`                       | `buildLoaderSnippet`, `startFromStub`           | 55            |
| `eventNames.ts`                   | `isValidEventName`                              | 4             |
| `plugins/dataLayerDestination.ts` | The example destination                         | 9             |
| `transport.ts`                    | `fetchTransport`, `sendOnExit`                  | 23            |
| `backoff.ts`                      | `backoffDelayMs`, `parseRetryAfter`             | 18            |
| `storage.ts`                      | `readStorage`, `writeStorage`                   | 17            |
| `uuid.ts`                         | `uuid`                                          | 9             |
| `noop.ts`                         | The client that does nothing                    | 16            |
| `react.tsx`                       | `AnalyticsProvider`, `useAnalytics`             | 19            |
| `index.ts`                        | The entry file                                  | 22            |

That is 971 lines in total. The 60-minute answer has 440 with its `index.ts`,
and the 45-minute answer 321. The tests grow from 123 to 273.

The SDK is 4,715 bytes when it is minified and compressed with gzip (45-minute
answer: 1,466, 60-minute answer: 1,941). Measure it again with:

```bash
npx esbuild src/analytics/index.ts --bundle --minify --format=esm | gzip -9 -c | wc -c
```

The UMD file that `npm run size` checks is a little larger (4,942 bytes),
because of the UMD wrapper and a different minifier.

## The loader snippet

`buildLoaderSnippet({ src, endpoint, writeKey })` returns the text a team
pastes into a `<script>` tag in the `<head>` of its page. With the three
values filled in, it looks like this:

```html
<script>
  (function (w, d, name) {
    if (w[name]) return;
    var stub = (w[name] = { calls: [] });
    ["track", "identify", "page", "flush", "setConsent", "optOut", "optIn"].forEach(
      function (method) {
        stub[method] = function () {
          if (stub.calls.length < 500) {
            stub.calls.push({ method: method, args: [].slice.call(arguments), at: Date.now() });
          }
        };
      },
    );
    var script = d.createElement("script");
    script.async = true;
    script.src = "https://cdn.example.com/analytics.umd.js";
    script.onload = function () {
      if (w.AnalyticsSdk)
        w.AnalyticsSdk.startFromStub(stub, {
          endpoint: "https://collect.example.com/v1/batch",
          writeKey: "…",
        });
    };
    d.head.appendChild(script);
  })(window, document, "analytics");
</script>
```

- The page can call `analytics.track(…)` on its first line. Nothing waits for the network.
- The `async` script does not block the page. If it never loads (an ad blocker, a network error), the stub records at most 500 calls and nothing else happens.
- Each recorded call keeps its time, so the event has the time of the click, not the time the SDK arrived.
- After the SDK has loaded, the methods of the stub call the SDK. Code that kept a reference to the stub keeps working.
- An opt-out that was recorded by the stub is honoured: the events recorded before it are thrown away.
- A page event recorded by the stub gets the URL of the moment of the replay, not of the call.

## Content Security Policy

A page with a Content Security Policy must allow three things, or the browser
blocks the SDK without telling the page:

| Directive     | What to allow                            | Why                                                                                              |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `connect-src` | The origin of `endpoint`                 | `fetch`, `sendBeacon` and `fetch` with `keepalive` are all checked against `connect-src`.        |
| `script-src`  | The origin of `analytics.umd.js`         | Only when the SDK is loaded by a `<script>` tag. An app that bundles the SDK needs nothing here. |
| `script-src`  | A nonce or a hash for the loader snippet | The snippet is an inline script. Do not allow `'unsafe-inline'` for it.                          |

When `connect-src` blocks the endpoint, `fetch` rejects, the SDK retries with
backoff, and `getStats().retried` goes up while `sent` stays at 0. `sendBeacon`
may still return `true`, because the browser checks the policy after it has
accepted the data.

## Ad blockers

Many ad and tracker blockers block requests by host name and by path. A
collector on a third-party host with a well-known name is on their lists. For
the SDK this looks like a network error: it retries with backoff, holds at
most 500 events, and gives up nothing but those events. It never shows an
error to the user and never tries to get around the blocker.

What a team can do:

- Serve the collector from its own site, for example `https://www.example.com/collect`, with a reverse proxy in front of the real collector. This is called a first-party endpoint. It also needs no CORS and no change to `connect-src` beyond `'self'`.
- Serve `analytics.umd.js` from its own site too, or bundle the SDK into the app.
- Accept that some users will not be counted. A user who installed a blocker has said what they want. Report the share of sessions that are missing as a number next to the dashboards, and do not treat it as a bug to fix.

## Privacy

- **Consent comes first.** In the EU, storing an id on the device and sending analytics need the user's consent. Start with `consent: "pending"` and call `setConsent` from the consent banner. While pending, nothing is sent, nothing is stored and no destination plugin is called. After a "no", the queue, the ids and the stored queues are removed.
- **An IP address is personal data in the EU.** The SDK never puts one in an event, but every request carries the address of the user to the collector. The collector must drop it or shorten it before storing, and must not log it.
- **No personal data in event names.** A name is a fixed word of the product, such as `checkout_started`. It never holds an email address, a user name or an id. Names end up in dashboards, in logs and in the debug output of this SDK. Values belong in properties, where `beforeSend` can remove them.
- **URLs hold secrets.** The default `beforeSend` removes the query string and the hash from the URLs of page events. A team that replaces it should call `scrubPageUrls` from its own hook, or keep only the parameters it needs.
- **The SDK's own monitoring holds no event data.** `getStats()` is numbers and one message. Debug logs show the type and the name of an event, never its properties. `onError` passes on the error that the team's own hook threw, and nothing of the event.
- **Requests carry no cookies.** `fetch` is called with `credentials: "omit"`. `sendBeacon` cannot be told to leave cookies out, so a collector on the same site as the page will receive that site's cookies on page-exit requests and must ignore them.
- The anonymous id, the session and the stored queue live in `localStorage` of the page's origin. They are not shared between subdomains, and other scripts on the page can read them.

## Edge cases covered, on top of the 60-minute answer

- Consent is pending: no key at all is written to `localStorage`, and the queues of old tabs are left alone.
- A stored "no" wins over `consent: "granted"` in the code after a reload. A stored "yes" wins over `consent: "pending"`.
- `setConsent` with a value that is not a choice does nothing.
- A quiet tab keeps its session id while the user is active in another tab.
- An event that is too big for a beacon alone (over 60 KB) is sent alone, by `fetch`.
- The server asks for a wait of zero, or of something that is not a number: the normal backoff is used.
- `useAnalytics()` without a provider: a click does nothing, and nothing is thrown.
- `track` is called 10,000 times before the browser is idle: at most 500 calls are kept, and the rest is counted as dropped.
- A hook calls `track` itself while the SDK is preparing events: the new call is handled after the others.
- The page is hidden before the browser was idle: the recorded calls are prepared at once and go out by beacon.
- `flush()` prepares the recorded calls first, so it sends what was tracked a moment ago.
- A browser without `requestIdleCallback` (Safari): a timer runs the work, at most 8 ms at a time.
- The browser is busy for more than a second: the work runs anyway and finishes.
- `history.pushState` to the same path with another query string or hash: no page event.
- The real `pushState` throws (a URL of another origin): the error reaches the caller as before.
- Another library wrapped `pushState` after us: on `shutdown` we leave its wrapper in place and turn ours off.
- A plugin's `enrich` throws: the event is dropped, counted, and reported to `onError`.
- Events that this tab took over from a closed tab are not handed to the destinations again.
- `onError` throws: the error is swallowed.
- A request that we aborted ourselves (page exit, opt-out) is not reported as an error.
- 300 different wrong event names in debug mode: 100 warnings, and the memory for them stays bounded.
- The loader snippet runs twice: the second run does nothing.
- A recorded stub call with an unknown method, or one that is not a call at all, is skipped.
- A setting with a quote in it cannot end the snippet early.
- After `shutdown`, every method does nothing, and what the browser refused stays in storage for the next page.

## Known limits, described in the book but not built here

- The stored queue is in `localStorage`: synchronous, about 5 MB for the whole site, and not available in workers. IndexedDB is not used.
- There is no service worker and no Background Sync. Events of a page that was closed offline wait for the next visit.
- A stored event has no maximum age and a batch has no maximum number of retries. The SDK retries for as long as the page is open, at most every 30 seconds.
- A tab that is alive but has not stored its queue for more than a minute can have it taken by another tab. Both send the events, and the collector must drop the copies by id. There is no leader tab that sends for all tabs.
- On page exit the browser takes at most 64 KiB of beacon data. What does not fit waits in storage. The newer `fetchLater()` API is not used.
- The request body is not compressed.
- The anonymous id is not shared between subdomains, because it is not a cookie. There is no way to join two devices of one person before `identify`.
- Consent is one choice for everything. There are no categories (analytics, marketing), and no reading of Global Privacy Control or of a consent platform.
- The default scrubber removes all query parameters, also campaign parameters such as `utm_source`. There is no allow list.
- Properties are not checked at run time. The typed event map is a compile-time check only, and there is no shared event catalogue or code generation.
- There is no remote configuration and no kill switch: the sample rate, the endpoint and the batch size are fixed when the page is built.
- Nothing is captured automatically except page events: no clicks, no scroll depth, no Web Vitals, no JavaScript errors.
- No context is added to events: no screen size, language, time zone, app version or campaign. A plugin with `enrich` can add them.
- The naming warning is tied to the `debug` option, not to a development build. A team must turn `debug` off in production.
- The loader does not retry a failed download, has no Subresource Integrity attribute and no versioned URL scheme.
- The library build has no `package.json` `exports` map and is not published. The size budget is checked by a script, not by CI in this repository.
- The time budget of `track` is a unit test on the machine that runs the tests. It is not measured on real devices in the field.
- The demo page does not use the loader snippet: it imports the SDK directly.
- The SDK does not send its own health counters to the collector. `dropped` is the only one that travels with a batch.

## Try it in the demo

1. Open the console of the browser. Press "Track one event": the console shows `queued track button_clicked`. After five seconds it shows the batch being sent and the answer.
2. Press "Go to /pricing". The URL changes without a page load, and a page event is queued by itself.
3. Press "Track a badly named event". The console shows one warning about the name. Press it again: no second warning. The event is sent both times.
4. Tick "Fail with 500" and press "Track one event", then "Flush now". "Retried requests" goes up and "Last error" explains why. Untick the box and wait: "Queued" goes back to 0.
5. Tick "Make the beforeSend hook throw" and press "Track one event". "Dropped" goes up by one and "Last error" names the hook. The page goes on.
6. Press "Track 600 events". The button answers at once: the work is done later, in idle time. "Dropped" goes up by 100, because the SDK keeps at most 500 calls.
