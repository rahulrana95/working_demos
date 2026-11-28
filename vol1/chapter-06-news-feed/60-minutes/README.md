# Chapter 6: News feed, the 60-minute answer

An endless list of posts. The server ranks the feed and the client shows it.

This is the staff answer. It is the senior answer from
[`../45-minutes`](../45-minutes), plus 15 minutes for one addition: a virtual
list written by hand, with no library. What a team adds after the interview is
in [`../production`](../production). The [chapter README](../README.md)
compares the three, and says which feature lives in which folder.

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

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                         | In the interview?                   | Time       | Lines of code                |
| ---------------------------- | ----------------------------------- | ---------- | ---------------------------- |
| `src/feed/types.ts`          | Yes                                 | 3 minutes  | 18                           |
| `src/feed/useFeed.ts`        | Yes                                 | 13 minutes | 95                           |
| `src/feed/useLike.ts`        | Yes                                 | 8 minutes  | 66                           |
| `src/feed/virtualRange.ts`   | Yes                                 | 5 minutes  | 33                           |
| `src/feed/useVirtualRows.ts` | Yes                                 | 9 minutes  | 68                           |
| `src/feed/PostCard.tsx`      | Yes                                 | 7 minutes  | 51                           |
| `src/feed/Feed.tsx`          | Yes                                 | 13 minutes | 98                           |
| `src/styles.css`             | Only the idea of logical properties | 1 minute   | 205, most of it demo styling |
| `*.test.ts`, `*.test.tsx`    | No                                  |            |                              |
| `src/App.tsx`, `src/api/`    | No                                  |            |                              |

Lines of code are counted without blank lines and comments: 429 in the seven
TypeScript files, which is 111 more than the 45-minute answer. The limit for
this folder is 430. The folder has 111 tests.

The feed code is 2,730 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/feed/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 58 minutes of typing for someone who has practised it.

## What was added to the 45-minute answer

| Addition                                             | Where                      | Minutes |
| ---------------------------------------------------- | -------------------------- | ------- |
| Which posts to draw for a scroll position            | `virtualRange.ts`          | 5       |
| Measure the posts, listen to scroll, give the rows   | `useVirtualRows.ts`        | 9       |
| Draw only those rows; let the list measure each post | `Feed.tsx`, `PostCard.tsx` | 2       |
| Logical CSS properties                               | `styles.css`               | 1       |

Nothing else was added. The design of this chapter lists more for the staff
answer: scroll and focus restoration, a "new posts" pill, a like queue with
idempotency keys, `messages` and `renderPost`. They do not fit in 15 minutes
next to the virtual list, so they are in [`../production`](../production).
In the interview you say them aloud.

## How the virtual list works

- `getVirtualRange` walks over the heights of all posts once. It returns the first and the last post to draw, and the height of the posts before and after them.
- The feed draws only those posts. The height of the others becomes padding above and below the list, so the scrollbar keeps its size and place.
- A post that was never drawn counts as 300px (`ESTIMATED_HEIGHT`). When a post is drawn, a `ResizeObserver` measures it, and the real height replaces the estimate.
- Three more posts are drawn above and below the screen (`OVERSCAN`), so a scroll shows ready posts, and Page Down always has a next post to move to.
- When a post that is wholly above the screen turns out taller or shorter than planned, everything below it would move. The feed scrolls by the difference, so the post the user reads stays where it is. The CSS switches off the browser's own scroll anchoring for the list (`overflow-anchor: none`), so the correction is not made twice.
- The window scrolls, not a box inside the page. That is what a phone browser needs to hide its address bar.

### The cost

- The browser's "find in page" only finds text in the posts that are in the DOM.
- A screen reader's browse mode only sees those posts too. Page Down and Page Up still reach every post, and `aria-posinset` tells the real place of each one.
- A post that holds the keyboard focus is removed when the user scrolls it far away with the mouse. The focus then goes back to the page.
- The estimate makes the scrollbar jump a little while posts are measured for the first time.

## How the styles ship

The feed needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Feed" heading. The other rules style the demo page.

- The box around an image is `.post__media`. The component sets its `aspect-ratio` from the width and height that the server sends.
- The space between two posts is a border of the post (`border-block-end`), not a margin. The measured height of a post holds a border, and it would not hold a margin.
- `.feed__list` has `overflow-anchor: none`, because the feed corrects the scroll position itself.
- The rules use logical properties (`inline-start`, `block-end`) and never left or right, so the layout mirrors itself in right-to-left languages.
- The buttons are at least 44px tall. A pressed like button has another border colour and a tick, and keeps a mark in high-contrast mode.

The measured JavaScript size does not include this CSS. The feed rules are
710 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Feed/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## The contract of the two functions

It is the same as in the 45-minute answer: `fetchPage(cursor, signal)`
resolves with `{ posts, nextCursor }`, `setLike(postId, liked, signal)`
resolves with `{ likeCount, likedByMe }`, and both reject with any error when
the request failed.

## Why it holds at scale

| Pressure                                 | What protects us                                       | Test that proves it                                                                       |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1,000 posts are loaded                   | Only the posts near the screen are in the DOM          | `keeps a bounded number of posts in the DOM after loading 1,000`                          |
| The user is in the middle or at the end  | The same, wherever the screen is                       | `still holds a bounded number of posts after scrolling to the middle and to the end`      |
| 100,000 posts                            | One pass of additions gives a bounded range            | `draws a bounded number of rows however long the list is`                                 |
| Posts have different heights             | Each post is measured, and its real height is used     | `uses the measured height of a post, not the estimate`                                    |
| The scrollbar must stay honest           | Empty space stands in for the posts that are not drawn | `keeps the total height the same wherever the screen is`                                  |
| A post above the screen changes its size | The feed scrolls by the difference                     | `scrolls by the difference when a post above the screen is not as tall as planned`        |
| Scroll events fire on every frame        | A scroll that shows the same posts draws nothing again | `draws nothing again for a scroll that shows the same posts`                              |
| Posts leave the DOM all the time         | A post that left is not measured any more              | `measures only the posts that are in the DOM`                                             |
| New posts arrive while the user scrolls  | Cursor pagination, and posts de-duplicated by id       | `does not show a post twice when two pages overlap`                                       |
| The user scrolls very fast               | One page request at a time                             | `sends one request when the end of the list is reported many times`                       |
| The server is down                       | No request by itself after an error                    | `does not load again by itself after an error, so a broken server is not asked in a loop` |
| The user taps "like" twice, fast         | Only the answer to the last tap may change the screen  | `ignores an old response that arrives after a newer one`                                  |

## Edge cases covered, on top of the 45-minute answer

- An empty list draws nothing and takes no space.
- The screen is above the list (a page header) or below it: the nearest posts are drawn.
- A post ends exactly at the top of the screen: it is not counted as on screen.
- A post on the screen, or partly above it, changes its height: the feed does not scroll.
- A browser without `ResizeObserver`: every post counts as the estimate, and the list still works.
- The feed is removed: the scroll and resize listeners are removed, and nothing is measured any more.
- Page Down on the last post on screen moves the focus to a post that the overscan keeps ready.
- Right-to-left page: the layout is mirrored. Tick "Right to left" in the demo.

## Accessibility

It is the same as in the 45-minute answer: the WAI-ARIA feed pattern, Page
Down and Page Up, `aria-pressed` on the like button, and a status line for
"10 more posts loaded". With the virtual list, `aria-posinset` matters more:
the third post in the DOM may be post 503 of the feed, and it says so.

## Try it in the demo

1. Scroll down for a while. The panel shows "Posts in memory" growing with every page, while "Posts in the DOM" stays under ten and "DOM nodes" stays about the same.
2. Scroll back up. The posts are where they were.
3. Press Tab until a post has the focus, then Page Down several times. The focus moves from post to post, also to posts that were not in the DOM a moment ago.
4. Tick "Right to left". The page is mirrored.
5. Tick "Make the server fail" and scroll to the end. Untick it and press "Try again".
