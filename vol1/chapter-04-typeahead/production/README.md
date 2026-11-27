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

| Feature                                                                   | Why                                                                                                                                                  | Test that proves it                                                           |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| a. Text cleaning: `normaliseQuery(text, locale)`                          | "New Delhi", " new delhi " and "NEW DELHI" become one cache key and one URL, so a CDN can answer all of them from one copy.                          | `sends the text trimmed, with single spaces and in lower case`                |
| b. Visible characters: `minChars` counts graphemes                        | "दि" is one character for the user but two for JavaScript. The search must start when the user has typed two, not one.                               | `does not search for one Hindi character stored as two code units`            |
| c. Request timeout: `timeoutMs` (default 5000)                            | A request that never answers must not leave the user looking at "Searching…" for ever.                                                               | `shows a timeout error and aborts the request after five seconds`             |
| d. Error reasons: `errorReason` is `"failed"`, `"timeout"` or `"offline"` | "You are offline." helps the user more than "Something went wrong." Offline, no request is sent, and the search runs again when the network is back. | `searches again by itself when the network comes back`                        |
| e. Rate limit: `RetryLaterError` with `retryAfterMs`                      | When the server says "too many requests", we wait as long as it asks and try once more. Only once, so we do not add to its trouble.                  | `stays in loading, waits, and tries once more when the server says try later` |
| f. Shared cache: `cacheKey` and `clearSharedCaches()`                     | A "From" box and a "To" box search the same places. The second box gets the answer of the first with no request.                                     | `two typeaheads with the same cacheKey send one request for the same text`    |
| g. Events: `onEvent`                                                      | The team can measure speed, failures and which row people pick. People type private things, so an event holds numbers only.                          | `never puts the typed text in an event`                                       |

The demo page (h) shows all of them: two typeaheads that share
`cacheKey="places"`, switches for a rate-limited and a very slow server, and
the last few events.

## Lines of code

Counted without blank lines and comments, in `src/typeahead`:

| File                 | What it holds                          | Lines of code |
| -------------------- | -------------------------------------- | ------------- |
| `types.ts`           | The contract, error reasons and events | 19            |
| `messages.ts`        | Every text the user reads or hears     | 18            |
| `text.ts`            | `normaliseQuery`, `countGraphemes`     | 16            |
| `retryLaterError.ts` | `RetryLaterError`                      | 6             |
| `sharedCache.ts`     | The caches shared through `cacheKey`   | 13            |
| `lruCache.ts`        | The cache, plus `clear`                | 38            |
| `useTypeahead.ts`    | The hook                               | 132           |
| `Typeahead.tsx`      | The component                          | 265           |
| `index.ts`           | Shorter imports                        | 9             |

That is 516 lines in total: 138 more than the 60-minute answer (378), and 216
more than the 45-minute answer (300). The tests grow from 79 to 125.

## How to use the new parts

A search function that tells the typeahead about a rate limit:

```ts
const searchPlaces: SearchFn<Place> = async (query, signal) => {
  const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal });

  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After") ?? "1");
    throw new RetryLaterError(seconds * 1000);
  }
  if (!response.ok) {
    throw new Error(`The server answered ${response.status}`);
  }
  return response.json();
};
```

The `query` it receives is already clean, so the URL is the same for every
user who means the same search.

On logout, call `clearSharedCaches()`, so the next user never sees the answers
of the last one.

## Edge cases covered, on top of the 60-minute answer

- Two ways of storing the same letter ("é" as one code, or "e" plus an accent) are one query.
- Lower case follows the language in `locale`: in Turkish, "I" becomes "ı".
- An emoji with a skin tone counts as one character.
- A browser without `Intl.Segmenter` still counts characters.
- An answer that arrives after the timeout is ignored.
- Offline, an answer in the cache is still shown.
- The network comes back after the text was cleared: no request is sent.
- The second try after "try later" also fails: a normal error, and no third try.
- The user types, or the component is removed, while we wait to try again: the wait is cancelled.
- "Try later" and then success is one `search_started` event, not two.

## What is still missing

This is a first week, not a finished product. Two typeaheads that ask for the
same text at the same moment still send two requests. A selected item is not
remembered across page loads. Results are not drawn as a virtual list, because
we never draw more than 10 rows.

## Try it in the demo

1. Type `mum` in "From", then `mum` in "To". The panel shows one request, because both boxes share one cache.
2. Tick "Server is rate limited (429 once)" and type `pun`. The panel shows two requests one second apart, and then the results. No error is shown.
3. Tick "Server is very slow (times out)" and type `del`. After five seconds you see "The search took too long."
4. Turn the network off in the developer tools and type `jai`. You see "You are offline." Turn it on again, and the search runs by itself.
5. Read the "Last events" list. It holds lengths, counts and times, never the text you typed.
