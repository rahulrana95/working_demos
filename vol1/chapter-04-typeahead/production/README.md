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

| Feature                                                                   | Why                                                                                                                                                                                                                                            | Test that proves it                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| a. Text cleaning: `normaliseQuery(text)`                                  | "New Delhi", " new delhi " and "NEW DELHI" become one cache key and one URL, so a CDN can answer all of them from one copy. Lower case is the same in every browser language.                                                                  | `sends “indore” for “INDORE” when the language is Turkish`                              |
| b. Visible characters: `minChars` counts graphemes                        | "दि" is one character for the user but two for JavaScript. The search must start when the user has typed two, not one.                                                                                                                         | `does not search for one Hindi character stored as two code units`                      |
| c. Request timeout: `timeoutMs` (default 5000)                            | A request that never answers must not leave the user looking at "Searching…" for ever.                                                                                                                                                         | `shows a timeout error and aborts the request after five seconds`                       |
| d. Error reasons: `errorReason` is `"failed"`, `"timeout"` or `"offline"` | "You are offline." helps the user more than "Something went wrong." The browser's offline flag is only a hint, so the request is always sent. The flag only picks the message after a failure. The search runs again when the network is back. | `sends the request when the browser says it is offline, because that is only a hint`    |
| e. Rate limit: `RetryLaterError` with `retryAfterMs`                      | When the server says "too many requests", we wait as long as it asks and try once more. Only once, so we do not add to its trouble.                                                                                                            | `stays in loading, waits, and tries once more when the server says try later`           |
| f. Shared cache: `cacheKey` and `clearSharedCaches()`                     | A "From" box and a "To" box search the same places. The second box gets the answer of the first with no request.                                                                                                                               | `two typeaheads with the same cacheKey send one request for the same text`              |
| g. Events: `onEvent`                                                      | The team can measure speed, failures and which row people pick. People type private things, so an event holds numbers only.                                                                                                                    | `never puts the typed text in an event`                                                 |
| h. Honest timing: `results_shown.durationMs`                              | The time runs from the user's last key press to the rows being painted, for cache hits too. That is the wait the user felt, not only the time of the server.                                                                                   | `reports the result after the rows are painted, with the time since the last key press` |
| i. No flash: `searchingDelayMs` (default 300)                             | "Searching…" appears only when a request has taken longer than this. A fast answer never makes the message flash.                                                                                                                              | `never shows the message when the answer comes in 100 ms`                               |
| j. Form value: `name` sends the key                                       | The form gets `getItemKey(item)` of the picked row in a hidden input, not the text on screen. A text that was typed but not picked sends an empty value.                                                                                       | `sends the key of the picked item, not the text on screen`                              |
| k. Plural forms: `Intl.PluralRules`                                       | The default English message, and the Hindi one in the demo, ask the browser which plural form fits the count.                                                                                                                                  | `asks Intl.PluralRules which English form fits the count`                               |

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
| `retryLaterError.ts` | `RetryLaterError`                      | 6             |
| `sharedCache.ts`     | The caches shared through `cacheKey`   | 13            |
| `lruCache.ts`        | The cache, plus `clear`                | 38            |
| `useTypeahead.ts`    | The hook                               | 174           |
| `Typeahead.tsx`      | The component                          | 280           |
| `index.ts`           | Shorter imports                        | 9             |

That is 577 lines in total: 195 more than the 60-minute answer (382), and 274
more than the 45-minute answer (303). The tests grow from 90 to 154.

The component code is 3,143 bytes when it is minified and compressed with gzip,
without React (45-minute answer: 1,813, 60-minute answer: 2,154). Measure it again with:

```bash
npx esbuild src/typeahead/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## How to use the new parts

### The contract of `search`

The typeahead cannot see HTTP status codes. It only sees whether the promise
from `search` resolves or rejects. So your `search` function must keep three rules:

1. For HTTP 429 ("too many requests"), reject with `new RetryLaterError(retryAfterMs)`. The typeahead waits that long and tries once more.
2. For every other failure, reject with any other error. The user sees an error and "Try again".
3. Resolve with an empty array only when the server really found nothing. The user then reads "No results", and that answer is kept in the cache.

A function that returns `[]` for a failed request breaks rule 3: the user is
told that nothing exists, and the cache remembers it.

```ts
const searchPlaces: SearchFn<Place> = async (query, signal) => {
  const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal });

  if (response.status === 429) {
    // The header holds seconds. A missing or unreadable header means 1 second.
    const seconds = Number(response.headers.get("Retry-After"));
    throw new RetryLaterError(seconds > 0 ? seconds * 1000 : 1000);
  }
  if (!response.ok) {
    throw new Error(`The server answered ${response.status}`);
  }
  return response.json();
};
```

If the API is on another origin, the browser hides `Retry-After` from
JavaScript. The server must send `Access-Control-Expose-Headers: Retry-After`.
The same example, with more comments, is in `src/api/searchCities.ts`.

The `query` it receives is already clean: trimmed, with single spaces, in one
Unicode form, and in lower case made the same way in every browser language.
So two users who type the same letters, in any mix of upper and lower case and
spaces, ask for the same URL.

### The form value

With `name`, the component adds a hidden input with that name. Its value is
`getItemKey(item)` of the picked row. The visible input has no name, so the
text on screen is not sent. The value is empty until the user picks a row, and
it is empty again as soon as the text changes after a pick. `required` still
checks only that the visible input has some text.

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
- The user picks a row, then types the same label by hand: the form value stays empty until they pick again.
- The parent clears the text from outside after a pick: the form value is empty.
- The network comes back after the text was cleared: no request is sent.
- The second try after "try later" also fails: a normal error, and no third try.
- The user types, or the component is removed, while we wait to try again: the wait is cancelled.
- "Try later" and then success is one `search_started` event, not two.

## What is still missing

This is a first week, not a finished product. Two typeaheads that ask for the
same text at the same moment still send two requests. A selected item is not
remembered across page loads. Results are not drawn as a virtual list, because
we never draw more than 10 rows.

## Known limits, described in the book but not built here

- The popup does not flip above the input when there is no room below it.
- The height of the list does not follow `visualViewport`, so an on-screen keyboard can cover the last rows.
- The popup has no animation, so there is nothing to switch off for `prefers-reduced-motion`.
- A changed `search` function does not clear the cache. Change `cacheKey` instead.

## Try it in the demo

1. Type `mum` in "From", then `mum` in "To". The panel shows one request, because both boxes share one cache.
2. Tick "Server is rate limited (429 once)" and type `pun`. The panel shows two requests one second apart, and then the results. No error is shown.
3. Tick "Server is very slow (times out)" and type `del`. After five seconds you see "The search took too long."
4. Turn the network off in the developer tools, tick "Make the server fail" and type `jai`. The fake server needs no network, so the tick box plays the part of the failed request. You see "You are offline." Untick the box and turn the network on again, and the search runs by itself.
5. Read the "Last events" list. It holds lengths, counts and times, never the text you typed.
