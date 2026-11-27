# Chapter 4: Typeahead

The user types in a box, and we show matching suggestions from a server.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                        |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | A typeahead that is correct and fast: debounce, abort, cache, keyboard and screen reader support. |
| [`60-minutes`](60-minutes) | Staff                   | The same code, plus what other teams need before they can reuse it.                               |
| [`production`](production) | Not an interview answer | The staff answer, plus what you add in the first week before real users see it.                   |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are the lines in `src/typeahead`, without tests, blank lines and
comments. The size is the component code without React, minified and compressed
with gzip. Each folder's README has the command that measures it. For the two
interview answers the lines are the files you write in the interview, so
without `index.ts` (4 and 6 lines). For `production` they are all nine files.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 64    | 307           | 1,819 bytes             | 630 bytes           |
| `60-minutes` | 98    | 393           | 2,229 bytes             | 640 bytes           |
| `production` | 163   | 585           | 3,194 bytes             | 650 bytes           |

The JavaScript size does not include the styles. Each folder's README says
which CSS rules the component needs and how they ship.

## What the extra 15 minutes buys

The 45-minute answer works well on one page, for one team. The 60-minute answer
is a component that a form library, a design system or a team in another
country can use without changing its code.

| Addition                                                                                           | Why it matters                                                                                                                                                          | Minutes |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Controlled value (`value`, `onValueChange`) and form props (`name`, `disabled`, `required`, `ref`) | A form library can own the text, reset it, validate it and focus the input. With `name`, a normal form submit sends the key of the picked item, not the text on screen. | 4       |
| `renderItem`                                                                                       | Each team draws its own row (two lines, an icon, bold text) without a fork of the component.                                                                            | 2       |
| `messages`                                                                                         | Every text the user reads or hears can be translated. No English is fixed in the component.                                                                             | 3       |
| Cache expiry (`cacheTtlMs`) and `maxQueryLength`                                                   | A page that stays open all day does not show old answers. A very long pasted text never reaches the server.                                                             | 3       |
| `className` and logical CSS properties                                                             | The parent can place and style the component. The layout mirrors itself in right-to-left languages.                                                                     | 3       |

Each addition is small on purpose. A staff answer is not more features. It is
the same feature with fewer reasons for another team to copy and change it.

## What the first week adds

The `production` folder is what a team builds after the interview, in about a
week. Do not try to write it in an interview. Know that it exists, and name
one or two of these when the interviewer asks, "What would you do next?"

| Addition                             | Why it matters                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Text cleaning (`normaliseQuery`)     | The same search always gives the same cache key and the same URL, so a CDN can answer it.                                   |
| `minChars` counts visible characters | One Hindi character or one emoji is one character, as the user sees it.                                                     |
| Request timeout (`timeoutMs`)        | A request that never answers becomes an error the user can retry.                                                           |
| Error reasons (`errorReason`)        | The user reads "You are offline." and the search runs again when the network is back. The request is always sent first.     |
| Rate limit (`RetryLaterError`)       | We wait as long as the server asks, and try once more. If it asks for more than 2 seconds, the user gets the error at once. |
| Shared cache (`cacheKey`)            | Two typeaheads on one page do not ask the server the same thing twice.                                                      |
| Events (`onEvent`)                   | The team can measure speed and failures. The typed text is never in an event.                                               |
| Honest timing (`durationMs`)         | The time runs from the last key press to the rows being painted, for cache hits too.                                        |
| No flash (`searchingDelayMs`)        | A fast answer never shows "Searching…".                                                                                     |
| Plural forms (`Intl.PluralRules`)    | The result count is worded by the plural rules of the language.                                                             |

The [production README](production/README.md) names the test that proves each one.

## Measure typing in a real browser

`scripts/measure-typing.mjs` types in the demo with a real Chromium and prints
how long the page took to answer the key presses: once on a normal CPU, once
on a CPU made 4 times slower, and once 6 times slower. It needs
[Playwright](https://playwright.dev) installed, with its Chromium browser.

In one terminal, build a folder and serve it:

```bash
cd 45-minutes && npm run build && npx vite preview
```

In a second terminal, in this folder:

```bash
node scripts/measure-typing.mjs
```

The script opens `http://localhost:4173`. If the preview prints another
address, pass it: `node scripts/measure-typing.mjs http://localhost:4174`.

It prints one line for each CPU speed. This is the 45-minute answer on our machine:

```text
cpu x1: 150 key presses over 5 runs; events >=16ms: 3; handler ms p50 0.6 p95 0.6 max 0.6; duration ms max 24
cpu x4: 150 key presses over 5 runs; events >=16ms: 6; handler ms p50 1.5 p95 2.5 max 2.5; duration ms max 24
cpu x6: 150 key presses over 5 runs; events >=16ms: 61; handler ms p50 0.7 p95 5.7 max 9.2; duration ms max 24
```

What the numbers mean:

- "handler ms" is the time our own code ran for one key press.
- "duration ms" is the time from the key press to the next paint, as the browser reports it, rounded to 8 ms.
- "events >=16ms" is how many key presses the browser reported at all.

What they do not mean:

- They are lab numbers from one desktop computer, with a fake server and a slowed CPU. They are not numbers from real users on real phones. For those, collect INP in the field.
- The Event Timing API only reports events that took 16 ms or longer. A faster key press is not in the list, so the p50 and p95 are of the slow events only, not of all 150 key presses.
- Your numbers will differ from ours, and from one run to the next.
