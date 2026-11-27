# Chapter 4: Typeahead, the 60-minute answer

The user types in a box, and we show matching suggestions from a server.

This is the staff answer. It is the senior answer from
[`../45-minutes`](../45-minutes), plus 15 minutes of additions that let other
teams reuse the component. The [chapter README](../README.md) lists what each addition buys.
What a team adds after the interview is in [`../production`](../production).

**Live demo:** see the link in the repository description.

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

## What is part of the interview

Every file says on its first lines whether you would write it in the interview.

| File                            | In the interview?                   | Time       | Lines of code                |
| ------------------------------- | ----------------------------------- | ---------- | ---------------------------- |
| `src/typeahead/types.ts`        | Yes                                 | 1 minute   | 6                            |
| `src/typeahead/messages.ts`     | Yes                                 | 2 minutes  | 14                           |
| `src/typeahead/useTypeahead.ts` | Yes                                 | 16 minutes | 79                           |
| `src/typeahead/lruCache.ts`     | Yes                                 | 6 minutes  | 35                           |
| `src/typeahead/Typeahead.tsx`   | Yes                                 | 28 minutes | 244                          |
| `src/styles.css`                | Only the idea of logical properties | 2 minutes  | 172, most of it demo styling |
| `*.test.ts`, `*.test.tsx`       | No                                  |            |                              |
| `src/App.tsx`, `src/api/`       | No                                  |            |                              |

Lines of code are counted without blank lines and comments: 378 in the five
TypeScript files, which is 78 more than the 45-minute answer.

That is about 55 minutes of typing for someone who has practised it. The other
5 minutes go to walking the interviewer through one race condition.

## What was added to the 45-minute answer

| Addition                                                        | Where                            | Minutes |
| --------------------------------------------------------------- | -------------------------------- | ------- |
| `value`, `onValueChange`, `name`, `disabled`, `required`, `ref` | `Typeahead.tsx`                  | 4       |
| `renderItem`                                                    | `Typeahead.tsx`                  | 2       |
| `messages`                                                      | `messages.ts`, `Typeahead.tsx`   | 3       |
| `cacheTtlMs`, `maxQueryLength`                                  | `lruCache.ts`, `useTypeahead.ts` | 3       |
| `className`, logical CSS properties                             | `Typeahead.tsx`, `styles.css`    | 3       |

## Why it holds at scale

| Pressure                         | What protects us                                      | Test that proves it                                                       |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| The user types very fast         | Debounce: one request after the user pauses           | `sends one request when the user types 200 characters`                    |
| An old response arrives late     | The old request is aborted and its answer is ignored  | `ignores an old response that arrives after a newer one`                  |
| The same text is typed again     | LRU cache: no network call                            | `answers a repeated query from the cache without a new request`           |
| The server sends 5,000 items     | We keep and draw only 10                              | `draws only 10 rows when the server sends 5,000 items`                    |
| A new search is still loading    | The old rows are dimmed and cannot be picked          | `Enter does not pick a stale row`                                         |
| The user searches all day        | The cache holds at most 50 queries of 10 items each   | `never holds more than its limit, even after 10,000 different keys`       |
| The page stays open all day      | A cached answer expires after 5 minutes               | `asks the server again when the cached answer is older than five minutes` |
| The user pastes a very long text | The query is cut to 100 characters                    | `cuts the query to 100 characters before searching`                       |
| Many teams use the component     | Text, rows, form props and class name come from props | `keeps the English text for every message that is not translated`         |

## Edge cases covered

- Fewer than two characters, or only spaces: no request.
- Upper case and lower case are the same query.
- A failed request shows an error with "Try again", and is not cached.
- No results shows a clear message.
- Enter while typing in a Hindi, Japanese or Chinese keyboard does not select.
- Enter with no active row does not select, so a form around the input can submit.
- The list becomes shorter while a row is active: the active row is dropped.
- ArrowDown and ArrowUp do nothing when the list is empty or shows an error.
- Clicking a row works even though the click takes focus away from the input.
- The component is removed while a request is in flight: the request is aborted.
- A new search is loading: the old rows stay on screen, dimmed, and cannot be picked with Enter or a click.
- The parent controls the text and ignores a change: the text does not change.
- The parent clears the text from outside: the list closes.
- Reading a cached answer does not make it live longer.
- Only some messages are translated: the others stay in English.
- A custom row is drawn, but the input still gets the plain label after a selection.
- Right-to-left page: the popup and the bar of the active row are mirrored.

## Accessibility

The input follows the WAI-ARIA combobox pattern: `role="combobox"`,
`aria-expanded`, `aria-controls` and `aria-activedescendant` on the input,
`role="listbox"` and `role="option"` on the list. Focus stays in the input the
whole time. A hidden status line tells screen reader users how many results
are available.

## Try it in the demo

1. Type `mum` quickly. The panel shows one request, not three.
2. Delete the last `m`, then type it again. No new request, because of the cache.
3. Tick "Make the server fail" and type `pun`. You get an error. Untick it and press "Try again".
4. Use ArrowDown, ArrowUp, Enter and Escape without touching the mouse.
5. Tick "Right to left". The page is mirrored, and the bar of the active row moves to the right side.
6. Tick "Messages in Hindi", then type `zzz`. The "no results" message is in Hindi.
