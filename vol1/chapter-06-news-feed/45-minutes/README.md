# Chapter 6: News feed, the 45-minute answer

An endless list of posts. The server ranks the feed and the client shows it.

This is the senior answer. The staff answer, with 15 more minutes of work, is
in [`../60-minutes`](../60-minutes). What a team adds after the interview is in
[`../production`](../production). The [chapter README](../README.md) compares
the three, and says which feature lives in which folder.

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

| File                      | In the interview? | Time       | Lines of code |
| ------------------------- | ----------------- | ---------- | ------------- |
| `src/feed/types.ts`       | Yes               | 3 minutes  | 18            |
| `src/feed/useFeed.ts`     | Yes               | 13 minutes | 95            |
| `src/feed/useLike.ts`     | Yes               | 8 minutes  | 66            |
| `src/feed/PostCard.tsx`   | Yes               | 6 minutes  | 46            |
| `src/feed/Feed.tsx`       | Yes               | 12 minutes | 93            |
| `*.test.ts`, `*.test.tsx` | No                |            |               |
| `src/App.tsx`, `src/api/` | No                |            |               |
| `src/styles.css`          | No                |            |               |

Lines of code are counted without blank lines and comments: 318 in total.
The limit for this folder is 320. The folder has 78 tests.

The feed code is 2,004 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/feed/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 42 minutes of typing for someone who has practised it. The other
3 minutes go to walking the interviewer through the double tap on the like button.

## What you say aloud and do not type

The limit of 320 lines leaves these out. Each is built in
[`../production`](../production).

- A skeleton while the first page loads. Here the button under the list says "Loading posts…".
- A message when a like could not be saved. Here the button goes back to its old state without a word.
- The avatar and the date of a post, and plural forms ("1 like"). Here a post shows "Likes: 1".
- Moving the keyboard focus when the "Load more" button goes away after the last page.

## How the styles ship

The feed needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Feed" heading. The other rules style the demo page.

- The box around an image is `.post__media`. The component sets its `aspect-ratio` from the width and height that the server sends. The image fills the box (`width: 100%`, `height: 100%`, `object-fit: cover`).
- The like button and the "Load more" button are at least 44px tall, so a finger can hit them.
- A pressed like button has another border colour and a tick before the word, so the state is not shown by colour alone.

The measured JavaScript size does not include this CSS. The feed rules are
669 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Feed/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## The contract of the two functions

The feed cannot see HTTP status codes. It only sees whether a promise resolves
or rejects.

- `fetchPage(cursor, signal)`: resolve with `{ posts, nextCursor }`. `nextCursor` is `null` after the last page. Reject with any error when the request failed. The cursor is `null` for the first page.
- `setLike(postId, liked, signal)`: resolve with `{ likeCount, likedByMe }` as the server now holds them. Reject with any error when the like was not saved.

Both get an `AbortSignal`. It is aborted when the feed is removed from the page.

## Why it holds at scale

| Pressure                                 | What protects us                                            | Test that proves it                                                                              |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| New posts arrive while the user scrolls  | Cursor pagination, and posts de-duplicated by id            | `does not show a post twice when two pages overlap`                                              |
| The user scrolls very fast               | One page request at a time                                  | `sends one request when the end of the list is reported many times`                              |
| One page does not fill the screen        | A new observer checks again after every page                | `checks again after every page, so a page that does not fill the screen is followed by the next` |
| The server is down                       | No request by itself after an error; the user must ask      | `does not load again by itself after an error, so a broken server is not asked in a loop`        |
| "Load more" fails after 500 posts        | The posts stay; the error is shown under them               | `keeps the posts and shows an error under them`                                                  |
| The user taps "like" twice, fast         | Only the answer to the last tap may change the screen       | `ignores an old response that arrives after a newer one`                                         |
| The second request of a double tap fails | We roll back to what the server holds                       | `rolls back to what the server holds, not to what it held before the first tap`                  |
| A feed of 1,000 posts gets one like      | Posts are stored by id, and `PostCard` is wrapped in `memo` | `draws only the liked post again, not the other posts`                                           |
| 1,000 posts with pictures                | `loading="lazy"`, and a box that keeps the shape            | `keeps the shape of the image before it loads, and loads it only near the screen`                |
| A post holds HTML or a script            | The text is rendered as text                                | `shows the text of a post as text, never as HTML`                                                |

What does not hold at scale in this folder: every loaded post stays in the
DOM. After 1,000 posts the page has about 8,000 DOM nodes. The 60-minute
answer fixes that.

## Edge cases covered

- The first page fails: an error and "Try again", and no posts.
- "Try again" asks for the same page again, with the same cursor.
- A second `loadMore` while a page is loading is ignored. So is `loadMore` after an error, and `retry` when nothing failed.
- A page holds a post that is already on screen: the post is not added twice, and our copy stays, because it may hold a like that is not saved yet.
- The last page arrives: the button goes away, a message says that there are no more posts, and nothing watches the end of the list any more.
- The feed has no posts: "No posts yet."
- The feed is removed while a page loads, or while a like is being saved: the request is aborted. A late answer or a late failure changes nothing.
- A browser without `IntersectionObserver`: the button still loads the next page.
- Two taps on the like button, and the two answers come back in the wrong order: the button ends in the state of the last tap.
- The answer to an older tap fails: nothing happens. The answer to the last tap fails: the button goes back.
- The parent passes a new `fetchPage` function on every render: no new request.

## Known limits of the like button

Two requests of a double tap are both in flight. The feed ignores the older
answer, but it cannot make the server handle them in order. If the network
swaps them, the server ends in the state of the first tap and the screen shows
the last one, until the next load. The production version sends likes one at a
time, each with an idempotency key.

## Accessibility

The list follows the WAI-ARIA feed pattern. The container has `role="feed"`
and a name, and `aria-busy` while a page loads. Each post is an `<article>`
that can take the focus, with `aria-posinset`, `aria-setsize` (`-1` while more
posts can be loaded, the real count after the last page) and `aria-labelledby`
that points at the name of the author. Page Down moves the focus to the next
post and Page Up to the post before, from anywhere inside a post. The like
button is a toggle button with `aria-pressed`. A hidden status line tells
screen reader users "10 more posts loaded" after the posts are on the page; it
is empty while a page loads, so the same count is read out again the next
time. An error is read out from its own alert. The "Load more" button is the
way to load a page without scrolling; it stays on the page while a page loads,
marked `aria-disabled`, so the keyboard focus is not lost.

Not built here: the pattern also suggests Control + End and Control + Home to
move the focus out of the feed.

## Try it in the demo

1. Scroll down. The panel at the bottom shows one request per page, and the number of DOM nodes grows with every page.
2. Press Tab until a post has the focus. Press Page Down three times, then Tab and Space: the like button is pressed at once, and the request follows.
3. Tick "Make the server fail" and scroll to the end. You get "Could not load more posts." and the posts stay. Untick it and press "Try again".
