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

## What the extra 15 minutes buys

The 45-minute answer works well on one page, for one team. The 60-minute answer
is a component that a form library, a design system or a team in another
country can use without changing its code.

| Addition                                                                                           | Why it matters                                                                                                           | Minutes |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| Controlled value (`value`, `onValueChange`) and form props (`name`, `disabled`, `required`, `ref`) | A form library can own the text, reset it, validate it and focus the input. The value is sent with a normal form submit. | 4       |
| `renderItem`                                                                                       | Each team draws its own row (two lines, an icon, bold text) without a fork of the component.                             | 2       |
| `messages`                                                                                         | Every text the user reads or hears can be translated. No English is fixed in the component.                              | 3       |
| Cache expiry (`cacheTtlMs`) and `maxQueryLength`                                                   | A page that stays open all day does not show old answers. A very long pasted text never reaches the server.              | 3       |
| `className` and logical CSS properties                                                             | The parent can place and style the component. The layout mirrors itself in right-to-left languages.                      | 3       |

Each addition is small on purpose. A staff answer is not more features. It is
the same feature with fewer reasons for another team to copy and change it.

## What the first week adds

The `production` folder is what a team builds after the interview, in about a
week. Do not try to write it in an interview. Know that it exists, and name
one or two of these when the interviewer asks, "What would you do next?"

| Addition                             | Why it matters                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Text cleaning (`normaliseQuery`)     | The same search always gives the same cache key and the same URL, so a CDN can answer it. |
| `minChars` counts visible characters | One Hindi character or one emoji is one character, as the user sees it.                   |
| Request timeout (`timeoutMs`)        | A request that never answers becomes an error the user can retry.                         |
| Error reasons (`errorReason`)        | The user reads "You are offline." and the search runs again when the network is back.     |
| Rate limit (`RetryLaterError`)       | We wait as long as the server asks, and try once more.                                    |
| Shared cache (`cacheKey`)            | Two typeaheads on one page do not ask the server the same thing twice.                    |
| Events (`onEvent`)                   | The team can measure speed and failures. The typed text is never in an event.             |

The [production README](production/README.md) names the test that proves each one.
