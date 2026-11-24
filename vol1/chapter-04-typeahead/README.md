# Chapter 4: Typeahead

The user types in a box, and we show matching suggestions from a server.

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

| File                            | In the interview? | Time       |
| ------------------------------- | ----------------- | ---------- |
| `src/typeahead/types.ts`        | Yes               | 1 minute   |
| `src/typeahead/useTypeahead.ts` | Yes               | 15 minutes |
| `src/typeahead/lruCache.ts`     | Yes               | 4 minutes  |
| `src/typeahead/Typeahead.tsx`   | Yes               | 20 minutes |
| `*.test.ts`, `*.test.tsx`       | No                |            |
| `src/App.tsx`, `src/api/`       | No                |            |
| `src/styles.css`                | No                |            |

That is about 40 minutes of typing for someone who has practised it. The other
5 minutes go to walking the interviewer through one race condition.

## Why it holds at scale

| Pressure                     | What protects us                                     | Test that proves it                                                 |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| The user types very fast     | Debounce: one request after the user pauses          | `sends one request when the user types 200 characters`              |
| An old response arrives late | The old request is aborted and its answer is ignored | `ignores an old response that arrives after a newer one`            |
| The same text is typed again | LRU cache: no network call                           | `answers a repeated query from the cache without a new request`     |
| The server sends 5,000 items | We keep and draw only 10                             | `draws only 10 rows when the server sends 5,000 items`              |
| The user searches all day    | The cache holds at most 50 queries of 10 items each  | `never holds more than its limit, even after 10,000 different keys` |

## Edge cases covered

- Fewer than two characters, or only spaces: no request.
- Upper case and lower case are the same query.
- A failed request shows an error with "Try again", and is not cached.
- No results shows a clear message.
- Enter while typing in a Hindi, Japanese or Chinese keyboard does not select.
- Enter with no active row does not select, so a form around the input can submit.
- The list becomes shorter while a row is active: the active row is dropped.
- Clicking a row works even though the click takes focus away from the input.
- The component is removed while a request is in flight: the request is aborted.

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
