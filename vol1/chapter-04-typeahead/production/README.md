# Chapter 4: Typeahead, the production version

The user types in a box, and we show matching suggestions from a server.

**This is not an interview answer.** Nobody writes this in 45 or 60 minutes.
It is the staff answer from [`../60-minutes`](../60-minutes), plus what a team
adds in the first week before real users see it. The
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

## What was added to the 60-minute answer

| Feature                                                                          | Why                                                                                                                                                                                                                                                | Test that proves it                                                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a. Text cleaning: `normaliseQuery(text)`                                         | "New Delhi", " new delhi " and "NEW DELHI" become one cache key and one URL, so a CDN can answer all of them from one copy. Lower case is the same in every browser language.                                                                      | `sends “indore” for “INDORE” when the language is Turkish`                                                                                                               |
| b. Visible characters: `minChars` counts graphemes                               | "दि" is one character for the user but two for JavaScript. The search must start when the user has typed two, not one.                                                                                                                             | `does not search for one Hindi character stored as two code units`                                                                                                       |
| c. Request timeout: `timeoutMs` (default 5000)                                   | A request that never answers must not leave the user looking at "Searching…" for ever.                                                                                                                                                             | `shows a timeout error and aborts the request after five seconds`                                                                                                        |
| d. Error reasons: `errorReason` is `"failed"`, `"timeout"` or `"offline"`        | "You are offline." helps the user more than "Something went wrong." The browser's offline flag is only a hint, so the request is always sent. The flag only picks the message after a failure. The search runs again when the network is back.     | `sends the request when the browser says it is offline, because that is only a hint`                                                                                     |
| e. Rate limit: `RetryLaterError` with `retryAfterMs`, `MAX_RETRY_WAIT_MS` (2000) | When the server says "too many requests", we wait as long as it asks and try once more. Only once, so we do not add to its trouble. If it asks for more than 2 seconds, we do not wait: the user gets the error at once and can press "Try again". | `stays in loading, waits, and tries once more when the server says try later`, `shows the error at once, and does not try again, when the server asks for a longer wait` |
| f. Shared cache: `cacheKey` and `clearSharedCaches()`                            | A "From" box and a "To" box search the same places. The second box gets the answer of the first with no request. A typeahead follows its `cacheKey`: change the key and it moves to the cache of the new key.                                      | `two typeaheads with the same cacheKey send one request for the same text`, `moves to a new cache when cacheKey changes, and the old key keeps its answers`              |
| g. Events: `onEvent`                                                             | The team can measure speed, failures and which row people pick. People type private things, so an event holds numbers only.                                                                                                                        | `never puts the typed text in an event`                                                                                                                                  |
| h. Honest timing: `results_shown.durationMs`                                     | The time runs from the user's last key press to the rows being painted, for cache hits too. That is the wait the user felt, not only the time of the server.                                                                                       | `reports the result after the rows are painted, with the time since the last key press`                                                                                  |
| i. No flash: `searchingDelayMs` (default 300)                                    | "Searching…" appears only when a request has taken longer than this. A fast answer never makes the message flash.                                                                                                                                  | `never shows the message when the answer comes in 100 ms`                                                                                                                |
| j. Plural forms: `Intl.PluralRules`                                              | The default English message, and the Hindi one in the demo, ask the browser which plural form fits the count.                                                                                                                                      | `asks Intl.PluralRules which English form fits the count`                                                                                                                |

The form value (`name` sends the key of the picked row in a hidden input) is
not in this table any more: it is part of the 60-minute answer now.

The demo page shows them: two typeaheads that share
`cacheKey="places"`, switches for a rate-limited and a very slow server, and
the last few events.

## Lines of code

Counted without blank lines and comments, in `src/typeahead`:

| File                 | What it holds                          | Lines of code |
| -------------------- | -------------------------------------- | ------------- |
| `types.ts`           | The contract, error reasons and events | 19            |
| `messages.ts`        | Every text the user reads or hears     | 22            |
| `text.ts`            | `normaliseQuery`, `countGraphemes`     | 16            |
| `retryLaterError.ts` | `RetryLaterError`, `MAX_RETRY_WAIT_MS` | 7             |
| `sharedCache.ts`     | The caches shared through `cacheKey`   | 13            |
| `lruCache.ts`        | The cache, plus `clear`                | 38            |
| `useTypeahead.ts`    | The hook                               | 177           |
| `Typeahead.tsx`      | The component                          | 284           |
| `index.ts`           | Shorter imports                        | 9             |

That is 585 lines in total: 192 more than the 60-minute answer (393), and 278
more than the 45-minute answer (307). The tests grow from 98 to 163.

The component code is 3,194 bytes when it is minified and compressed with gzip,
without React (45-minute answer: 1,819, 60-minute answer: 2,229). Measure it again with:

```bash
npx esbuild src/typeahead/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## How the styles ship

The component needs CSS to work as described. It needs the rules in
`src/styles.css` whose selectors start with `.typeahead`, plus
`.visually-hidden`. They are the part of the file under the "Typeahead"
heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) and the stacking order of the popup (`--typeahead-z-index`, default 10) are CSS variables, so a host app can theme the component without changing its rules.
- The input sets `font-size: max(16px, 1em)`, because Safari on iPhone zooms the page when a focused input has text smaller than 16px.
- Every row is at least 44px tall, so a finger can hit it.

The measured JavaScript size does not include this CSS. The typeahead rules are
650 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Typeahead/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## How to use the new parts

### The contract of `search`

The typeahead cannot see HTTP status codes. It only sees whether the promise
from `search` resolves or rejects. So your `search` function must keep three rules:

1. For HTTP 429 ("too many requests"), reject with `new RetryLaterError(retryAfterMs)`. The typeahead waits that long and tries once more. If `retryAfterMs` is more than `MAX_RETRY_WAIT_MS` (2000), it does not wait and shows the error at once.
2. For every other failure, reject with any other error. The user sees an error and "Try again".
3. Resolve with an empty array only when the server really found nothing. The user then reads "No results", and that answer is kept in the cache.

A function that returns `[]` for a failed request breaks rule 3: the user is
told that nothing exists, and the cache remembers it.

```ts
const DEFAULT_RETRY_MS = 1000;

/**
 * `Retry-After` comes in two forms: a number of seconds ("2"), or an HTTP
 * date ("Fri, 27 Nov 2026 07:28:00 GMT"). A missing or unreadable header
 * means 1 second.
 */
function readRetryAfterMs(header: string | null): number {
  if (header === null || header.trim() === "") {
    return DEFAULT_RETRY_MS;
  }

  // Form 1: seconds.
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  // Form 2: a date. We wait until that moment. A date in the past means "now".
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? DEFAULT_RETRY_MS : Math.max(0, dateMs - Date.now());
}

const searchPlaces: SearchFn<Place> = async (query, signal) => {
  const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal });

  if (response.status === 429) {
    throw new RetryLaterError(readRetryAfterMs(response.headers.get("Retry-After")));
  }
  if (!response.ok) {
    throw new Error(`The server answered ${response.status}`);
  }
  return response.json();
};
```

If the API is on another origin, the browser hides `Retry-After` from
JavaScript. The server must send `Access-Control-Expose-Headers: Retry-After`.
Without it the header reads as missing, and the wait is 1 second.
The same example, with more comments, is in `src/api/searchCities.ts`.

The `query` it receives is already clean: trimmed, with single spaces, in one
Unicode form, and in lower case made the same way in every browser language.
So two users who type the same letters, in any mix of upper and lower case and
spaces, ask for the same URL.

### The shared cache

Give the same `cacheKey` to every typeahead that uses the same search
function. They then share the answers they already have.

A typeahead follows its `cacheKey`, also when it is already on the page. So
when the answers for a text change (a new search function, another language,
another account), change the key, for example from `"places"` to
`"places-hi"`. The typeahead moves to the cache of the new key and asks the
server again. Typeaheads that still use the old key keep their answers.

On logout, call `clearSharedCaches()`, so the next user never sees the answers
of the last one.

## Edge cases covered, on top of the 60-minute answer

- Two ways of storing the same letter ("é" as one code, or "e" plus an accent) are one query.
- Lower case does not follow the language of the browser: "INDORE" is "indore" in a Turkish browser too, not "ındore".
- An emoji with a skin tone counts as one character.
- A browser without `Intl.Segmenter` still counts characters.
- An answer that arrives after the timeout is ignored.
- Offline, an answer in the cache is still shown.
- The browser says "offline" but the network works: the request is sent and the rows are shown.
- The network comes back while a normal error is shown: no request is sent.
- The user types again before the rows of the last answer are painted: no `results_shown` event for them.
- The parent clears the text from outside after a pick: the form value is empty.
- The network comes back after the text was cleared: no request is sent.
- The second try after "try later" also fails: a normal error, and no third try.
- The server asks us to wait longer than 2 seconds: the error is shown at once, with "Try again".
- `cacheKey` changes while the typeahead is on the page: it uses the cache of the new key.
- The user types, or the component is removed, while we wait to try again: the wait is cancelled.
- "Try later" and then success is one `search_started` event, not two.

## What is still missing

This is a first week, not a finished product. A selected item is not
remembered across page loads. Results are not drawn as a virtual list, because
we never draw more than 10 rows. The next section lists what the book
describes and this folder does not build.

## Known limits, described in the book but not built here

- The popup does not flip above the input when there is no room below it.
- The height of the list does not follow `visualViewport`, so an on-screen keyboard can cover the last rows.
- There is no portal and no Popover API. The popup is drawn inside the component, so a parent that clips its content (`overflow: hidden`) cuts the popup.
- The popup has no animation, so there is nothing to switch off for `prefers-reduced-motion`.
- `minChars` is one fixed number. It does not change with the language, although one Chinese character says more than one Latin letter.
- Requests in flight are not shared between typeaheads. Only finished results are, through `cacheKey`. Two typeaheads that ask for the same text at the same moment send two requests.
- On a server-rendered page, text typed before the JavaScript loads is not kept.
- Searching is not paused while an IME composition is in progress. Only Enter is ignored during a composition.
- No build step fails when the size budget is crossed. The size is measured by hand, with the command above.
- No event is sent when the list closes without a pick.
- A changed `search` function alone does not empty the cache. Change `cacheKey` together with it: the typeahead, also one that is already on the page, then moves to a new cache. A typeahead without a `cacheKey` keeps its own cache until it is removed from the page.

## Try it in the demo

1. Type `mum` in "From", then `mum` in "To". The panel shows one request, because both boxes share one cache.
2. Tick "Server is rate limited (429 once)" and type `pun`. The panel shows two requests one second apart, and then the results. No error is shown.
3. Tick "Server is very slow (times out)" and type `del`. After five seconds you see "The search took too long."
4. Turn the network off in the developer tools, tick "Make the server fail" and type `jai`. The fake server needs no network, so the tick box plays the part of the failed request. You see "You are offline." Untick the box and turn the network on again, and the search runs by itself.
5. Read the "Last events" list. It holds lengths, counts and times, never the text you typed.
