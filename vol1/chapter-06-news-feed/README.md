# Chapter 6: News feed

An endless list of posts. The server ranks the feed and the client shows it,
mostly on low-cost phones.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                     |
| -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | A feed that loads page after page, never shows a post twice, and has a like button that survives a double tap. |
| [`60-minutes`](60-minutes) | Staff                   | The same code, plus a virtual list written by hand: the DOM stays small however many posts are loaded.         |
| [`production`](production) | Not an interview answer | The staff answer, plus what you add in the first week before real users see it.                                |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are the lines in `src/feed`, without tests, blank lines and
comments. The size is the feed code without React, minified and compressed
with gzip. Each folder's README has the command that measures it. For the two
interview answers the lines are the files you write in the interview, so
without `index.ts` (7 and 9 lines). For `production` they are all 18 files.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 78    | 318           | 2,004 bytes             | 669 bytes           |
| `60-minutes` | 111   | 429           | 2,730 bytes             | 710 bytes           |
| `production` | 332   | 1,689         | 8,362 bytes             | 1,000 bytes         |

The line budgets of the two interview answers are hard limits: 320 and 430.
The book promises that the code can be typed in the stated time.

## Which feature lives in which folder

The design of this chapter lists more than fits in 60 minutes. So each
feature lives in the first folder that has room for it. The hard centre of
the problem is in `45-minutes`.

| Feature                                                                          | 45  | 60  | production |
| -------------------------------------------------------------------------------- | --- | --- | ---------- |
| Cursor pagination, one request at a time, posts de-duplicated by id              | Yes | Yes | Yes        |
| Sentinel (`IntersectionObserver`) plus a "Load more" button                      | Yes | Yes | Yes        |
| Empty, error and end-of-feed states; a failed "load more" keeps the posts        | Yes | Yes | Yes        |
| Image in an `aspect-ratio` box, `loading="lazy"`, text rendered as text          | Yes | Yes | Yes        |
| Like: optimistic, rollback, the last tap wins                                    | Yes | Yes | Yes        |
| Feed pattern: `role="feed"`, `aria-posinset`, Page Down and Page Up, live region | Yes | Yes | Yes        |
| Virtual list written by hand, heights measured with `ResizeObserver`             |     | Yes | Yes        |
| Logical CSS properties (right-to-left layout)                                    |     | Yes | Yes        |
| First-load skeleton; avatar, date, plural forms in a post                        |     |     | Yes        |
| Scroll restoration and keyboard focus restoration (`session`)                    |     |     | Yes        |
| "3 new posts" pill, fed by a poll (`fetchNewer`, `pollMs`)                       |     |     | Yes        |
| Like queue with an idempotency key per choice; a message when a like fails       |     |     | Yes        |
| `messages`, `renderPost`, `postHref`, `className`                                |     |     | Yes        |
| Live connection with backoff and jitter (`subscribe`)                            |     |     | Yes        |
| Memory limit (`maxPosts`), first page saved (`cacheKey`), offline likes, timeout |     |     | Yes        |
| Error boundary per post, events (`onEvent`), video, `srcset` and `sizes`         |     |     | Yes        |

Five features of the design brief for the 60-minute answer are in `production`
and not in `60-minutes`: scroll and focus restoration, the "new posts" pill
with its poll, the like queue with idempotency keys and its failure message,
`messages`, and `renderPost`. Two parts of the brief for the 45-minute answer
are in `production` too: the first-load skeleton, and the message after a
failed like. In the interview you say them aloud.

## What the extra 15 minutes buys

The 45-minute answer keeps every post in the DOM. That is fine for 50 posts
and slow for 1,000. The 60-minute answer adds one thing, and it is the thing
an interviewer asks a staff candidate about: a virtual list.

| Addition                            | Why it matters                                                                              | Minutes |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ------- |
| `virtualRange.ts`                   | The arithmetic: which posts to draw for a scroll position, with posts of different heights. | 5       |
| `useVirtualRows.ts`                 | Measures every post, listens to scroll, and gives the feed the rows to draw.                | 9       |
| Two lines in `Feed.tsx`, `PostCard` | Draw only those rows, with empty space above and below. Let the list measure each post.     | 2       |

## What the first week adds

The `production` folder is what a team builds after the interview. Do not try
to write it in an interview. Know that it exists, and name one or two of these
when the interviewer asks, "What would you do next?" The
[production README](production/README.md) names the test that proves each one.

## Measure the feed in a real browser

`scripts/measure-feed.mjs` loads 1,000 posts by scrolling in a real Chromium
and prints the number of DOM nodes and the size of the JavaScript heap, for
the 45-minute and the 60-minute answer. It then measures the layout shift
while images load, with the `aspect-ratio` box and without it. It needs
[Playwright](https://playwright.dev) installed, with its Chromium browser.

In one terminal:

```bash
cd 45-minutes && npm run build && npx vite preview --port 4173
```

In a second terminal:

```bash
cd 60-minutes && npm run build && npx vite preview --port 4174
```

In a third terminal, in this folder:

```bash
node scripts/measure-feed.mjs
```

If a preview prints another address, pass both:
`node scripts/measure-feed.mjs http://localhost:4175 http://localhost:4176`.

This is the output on our machine:

```text
45-minutes: 1010 posts loaded; 1010 posts in the DOM; 8258 DOM nodes; JS heap 6.8 MB
60-minutes: 1020 posts loaded; 5 posts in the DOM; 76 DOM nodes; JS heap 4.1 MB
layout shift with the aspect-ratio box: 0 shifts moved a post, score 0.000; score of all shifts 0.081
layout shift without the aspect-ratio box: 1 shifts moved a post, score 0.808; score of all shifts 0.851
```

What the numbers mean:

- "DOM nodes" is every element of the page, with the demo panel.
- "JS heap" is `performance.memory.usedJSHeapSize` after a garbage collection.
- "shifts moved a post" counts the layout shifts in which a post changed its place.
- "score of all shifts" also holds the "Load more" button. It moves down when a page arrives while it is on screen. The `aspect-ratio` box does not change that.

What they do not mean:

- `performance.memory` exists only in Chromium. Firefox and Safari do not have it.
- The heap of both answers holds the data of all 1,000 posts. Only the DOM differs. The memory of the DOM itself (layout, styles, decoded images) is not in the JS heap, so the real difference is larger than these two numbers show.
- They are lab numbers from one desktop computer, with a fake server and tiny pictures. They are not numbers from real users on real phones. For those, collect CLS and memory data in the field.
- Your numbers will differ from ours, and from one run to the next.
