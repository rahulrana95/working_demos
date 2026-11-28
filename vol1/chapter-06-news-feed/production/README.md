# Chapter 6: News feed, the production version

An endless list of posts. The server ranks the feed and the client shows it.

**This is not an interview answer.** Nobody writes this in 45 or 60 minutes.
It is the staff answer from [`../60-minutes`](../60-minutes), plus what a team
adds in the first week before real users see it. The
[chapter README](../README.md) compares the three folders, and says which
feature lives in which folder.

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

## What moved here from the interview answers

The two interview answers have hard line limits. These parts of the design
did not fit, so they are built here and nowhere else.

| Feature                                          | Why                                                                                                                                                       | Test that proves it                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| a. Scroll restoration: `session`                 | The user opens a post and comes back. The feed shows the same post at the same place, with no request. It stores the first post on screen and its offset. | `scrolls back to the same post at the same place`, `shows the same posts again without a request`                   |
| b. Focus restoration                             | A keyboard user comes back to the post they were on, not to the top of the page.                                                                          | `gives the keyboard focus back to the post that had it`                                                             |
| c. "3 new posts" pill: `fetchNewer`, `pollMs`    | New posts wait behind a pill. They are never put on the page under the eyes of someone who is reading.                                                    | `offers new posts in a pill and does not put them on the page by itself`                                            |
| d. Like queue with an idempotency key per choice | Likes go out one at a time, in the order of the taps. The same choice is sent again with the same key, so the server never counts it twice.               | `sends one request at a time, in the order of the taps`, `sends two requests at most for ten fast taps on one post` |
| e. A message when a like fails                   | The button goes back, and the post says why.                                                                                                              | `goes back and tells the user when the server refuses the like`                                                     |
| f. `messages`                                    | Every text can be translated. Plural forms come from `Intl.PluralRules`.                                                                                  | `uses the translated messages, and keeps the English text for the others`                                           |
| g. `renderPost`, `postHref`, `className`         | Another team draws a post its own way, links to its own post page, and styles the root.                                                                   | `draws a custom post inside the article, which keeps its place and its name`                                        |
| h. First-load skeleton, avatar, date             | The page is not empty while the first page loads.                                                                                                         | `shows placeholders while the first page loads`                                                                     |
| i. Focus after the last page                     | The "Load more" button goes away. The focus moves to the closing message.                                                                                 | `moves the focus from the button to the closing message`                                                            |

## What the first week adds

| Feature                                                | Why                                                                                                                                                                     | Test that proves it                                                                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| j. Live connection: `subscribe`                        | New posts arrive in real time. It replaces the poll.                                                                                                                    | `offers a post from the stream in the pill, and does not put it on the page`                                                                    |
| k. Reconnect with backoff and jitter                   | After a drop the feed waits 1, 2, 4, 8 … seconds, 30 at most, minus a random part. A server that comes back is not hit by every feed at once.                           | `doubles the wait with every try that fails: 1, 2, 4 and 8 seconds`, `never waits longer than 30 seconds`                                       |
| l. No connection in a hidden tab                       | A background tab costs the server nothing. When the tab is shown, the feed connects again.                                                                              | `closes the connection when the tab is hidden`                                                                                                  |
| m. Catch-up                                            | After every connect the feed asks `fetchNewer` once for the posts it missed.                                                                                            | `subscribes again and catches up when the tab is shown again`                                                                                   |
| n. Memory limit: `maxPosts` (default 500)              | The data of far pages is dropped. The ids and the measured heights stay, so nothing moves. A dropped page is fetched again by its cursor when the reader scrolls back.  | `never holds more than the limit, however many pages are loaded`, `shows a placeholder with the height of the post, and fetches its page again` |
| o. Saved first page: `cacheKey`                        | A reload, or a visit with no network, shows posts at once from `sessionStorage`. The real first page then updates them in place; posts that are new go behind the pill. | `shows the saved first page at once, marked as busy, while the real one loads`                                                                  |
| p. Offline likes                                       | A like made with no network stays on screen and in the queue. It is sent when any request succeeds again. `navigator.onLine` only picks the wording.                    | `keeps a like made with no network on screen, says that it waits, and sends it later`                                                           |
| q. Timeout: `timeoutMs` (default 10,000)               | A page request that never answers becomes an error the user can retry.                                                                                                  | `fails with the reason “timeout” and aborts the request after ten seconds`                                                                      |
| r. Error reasons: `"failed"`, `"timeout"`, `"offline"` | "You are offline." helps more than "Could not load the posts." The request is always sent first.                                                                        | `sends the request when the browser says it is offline, because that is only a hint`                                                            |
| s. Error boundary per post                             | One post with bad data shows "This post cannot be shown." The feed stays.                                                                                               | `shows a message in place of the broken post and still draws the others`                                                                        |
| t. Impressions                                         | A post counts as seen when half of it was on screen for one second. Ids are sent in batches, each post once.                                                            | `counts a post that was half on screen for one second`, `sends the ids in one batch after five seconds, not one event per post`                 |
| u. Events: `onEvent`                                   | The team can measure speed and failures. An event holds ids, counts and times only.                                                                                     | `never puts the text of a post or the name of an author in an event`                                                                            |
| v. Video posts                                         | Muted, plays only while at least half of it is on screen and the tab is shown, never by itself with `prefers-reduced-motion`, and always with a button.                 | `plays when at least half of it is on screen`, `never plays by itself when the user asked for reduced motion`                                   |
| w. Responsive images: `srcset`, `sizes` (`imageSizes`) | A phone downloads the small file.                                                                                                                                       | `offers the browser the other widths, with the width of the picture on screen`                                                                  |

The demo page shows them: a fake live connection that you can drop, a server
that you can break, one post that the server sends with no author, one video,
`maxPosts` set to 100, and the last events.

## Lines of code

Counted without blank lines and comments, in `src/feed`:

| File                    | What it holds                                                   | Lines of code |
| ----------------------- | --------------------------------------------------------------- | ------------- |
| `types.ts`              | The contract, the stream, error reasons and events              | 53            |
| `messages.ts`           | Every text the user reads or hears                              | 52            |
| `feedState.ts`          | The state of the feed and every change to it, as pure functions | 152           |
| `useFeed.ts`            | Loads pages: lock, timeout, cache, memory limit, events         | 243           |
| `pageCache.ts`          | The first page in `sessionStorage`                              | 38            |
| `feedSession.ts`        | What the feed remembers while it is not on the page             | 10            |
| `virtualRange.ts`       | The arithmetic of the virtual list, plus the anchor             | 52            |
| `useVirtualRows.ts`     | The virtual list, plus scroll restoration                       | 111           |
| `likeQueue.ts`          | Likes one at a time, kept while the network is down             | 73            |
| `useLike.ts`            | Optimistic like, rollback, events                               | 81            |
| `backoff.ts`            | How long to wait before the next reconnect                      | 6             |
| `useLivePosts.ts`       | The live connection, the catch-up and the poll                  | 96            |
| `impressions.ts`        | Which posts were seen                                           | 107           |
| `PostErrorBoundary.tsx` | The error boundary around the inside of a post                  | 20            |
| `PostMedia.tsx`         | Responsive image, video                                         | 104           |
| `PostCard.tsx`          | One post, and the placeholder of a dropped post                 | 161           |
| `Feed.tsx`              | The component                                                   | 305           |
| `index.ts`              | Shorter imports                                                 | 25            |

That is 1,689 lines in total: 1,260 more than the 60-minute answer (429). The
tests grow from 111 to 332.

The feed code is 8,362 bytes when it is minified and compressed with gzip,
without React (45-minute answer: 2,004, 60-minute answer: 2,730). Measure it again with:

```bash
npx esbuild src/feed/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## How the styles ship

The feed needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Feed" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables. So are the place and the layer of the pill and of the notice for waiting likes (`--feed-sticky-top`, default 8px, and `--feed-z-index`, default 5), so a host app can put them under its own header.
- `.feed__list` has `overflow-anchor: none`, because the feed corrects the scroll position itself.
- The space between two posts is a border of the post, so the measured height of a post holds it.
- Every button and the date link are at least 44px tall. The rules use logical properties only.

The measured JavaScript size does not include this CSS. The feed rules are
1,000 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Feed/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## How to use the new parts

### The contract of the functions

The feed cannot see HTTP status codes. It only sees whether a promise resolves
or rejects. So the functions that the page passes must keep these rules.

`fetchPage(cursor, signal)`:

1. Resolve with `{ posts, nextCursor }`. `nextCursor` is `null` after the last page.
2. Reject with any error when the request failed.
3. The same cursor must give the same posts again later. The feed drops far pages from memory and asks for them again by their cursor.

`setLike(postId, liked, signal, idempotencyKey)`:

1. Resolve with `{ likeCount, likedByMe }` as the server now holds them.
2. When the server refuses the like for good (HTTP 4xx: the post was deleted, the user is blocked), reject with `new LikeRejectedError()`. The feed rolls back and tells the user.
3. For every other failure (no network, HTTP 5xx), reject with any other error. The feed keeps the like on screen and sends it again later, with the same key.
4. Send `idempotencyKey` to the server, for example in an `Idempotency-Key` header. A server that has seen the key answers again and saves nothing twice.

`fetchNewer(sinceId, signal)`: resolve with the posts newer than `sinceId`,
newest first, or with an empty array.

`subscribe(onEvent)`: open the connection and return the function that closes
it. Send `{ type: "open" }` when it is up, `{ type: "post", post }` for a new
post, and `{ type: "closed" }` when it dropped. Do not reconnect by yourself:
the feed calls `subscribe` again after it has waited.

```ts
const subscribe: SubscribeFn = (onEvent) => {
  const source = new EventSource("/api/feed/stream");
  source.onopen = () => onEvent({ type: "open" });
  source.onmessage = (message) => onEvent({ type: "post", post: JSON.parse(message.data) });
  source.onerror = () => {
    // EventSource would reconnect by itself, with no backoff. The feed does it.
    source.close();
    onEvent({ type: "closed" });
  };
  return () => source.close();
};
```

### The session and the saved first page

Create one session for the feed and keep it where the page keeps its state,
for example next to the router: `const session = createFeedSession()`. Pass it
to every `<Feed>` that shows the same feed. It lives in memory only. The feed
reads `session` and `cacheKey` once, when it appears.

The page must also set `history.scrollRestoration = "manual"`. Without it the
browser tries to restore the scroll position itself, before the posts are on
the page.

`cacheKey` is a `sessionStorage` key. Put the id of the user in it, for
example `feed:user-42`, and call `clearCachedPage(cacheKey)` on logout, so the
next user of the tab never sees these posts.

## Edge cases covered, on top of the 60-minute answer

- The feed comes back while a page was loading: it does not come back as "loading". It comes back with its error, if it had one.
- The saved post of the session is not in the feed any more: the feed does not scroll.
- The post that had the focus is not near the saved place: the feed does not take the focus later, when the user scrolls to it.
- The pill is pressed far down the feed: the feed scrolls to its top, and the focus goes to the first new post.
- A new post that is already in the feed, or that waits already, is skipped.
- Ten fast taps on one like button send two requests at most.
- A like fails, and the user has chosen again since: the old choice is dropped, not sent again.
- A like is tried five times at most. Then it is rolled back with a message.
- A page that is fetched again no longer holds one of its posts: that post leaves the feed, so no empty place stays for ever.
- A dropped page cannot be fetched again: its placeholders show "Try again", and nothing is asked by itself.
- The first page and the posts from the pill are never dropped, because no cursor gives them back. Nor is the page the reader is on.
- A fetch function that ignores the abort signal and never answers: the timeout still ends the request.
- An answer that arrives after the timeout is ignored.
- `sessionStorage` is full, switched off, or holds data that is not a page: the feed works without it.
- The session wins over the saved first page when both exist.
- The tab is hidden: no reconnect, no poll, no impression time, and a video pauses.
- The user pauses a video: it does not start again by itself. The user plays it: it does.
- The browser refuses to play a video: nothing breaks, and the button is still there.
- An error in the page's own `renderPost` is caught by the boundary of that post.
- A post is reported as seen once, however often the user scrolls past it. Ids that wait are sent when the tab is hidden and when the feed is removed.

## Accessibility

On top of the feed pattern of the interview answers: the placeholder of a post
that is being fetched again is an `<article>` with its real `aria-posinset`,
the name "Loading this post…" and `aria-busy`. The pill is a button before the
list. When it is pressed, it goes away and the focus moves to the first new
post. The notice for likes that are not saved yet is a status region and
stays on screen while the user scrolls. A video has its description as
`aria-label` and a button that is always there. A broken post keeps its place
in the feed, and its message is its name.

## Known limits, described in the book but not built here

- Likes that wait for the network are kept in memory only. A reload or a closed tab loses them. The notice tells the user so.
- The saved first page is in `sessionStorage`, so it is per tab and gone when the tab closes. There is no service worker and no IndexedDB, so the app itself does not start offline.
- The memory limit drops whole pages. The first page, the posts from the pill and the page the reader is on are never dropped, so the feed can hold a few posts more than `maxPosts` when those alone are more than the limit.
- The ids and the measured heights of all posts stay in memory (a few bytes per post), and so do the ids of the posts that were reported as seen. Only the data of the posts is bounded.
- While a dropped page is fetched again, "load more" waits, and a "load more" that was asked for in that time is not started again by itself: the user scrolls or presses the button.
- A page that is fetched again must hold the same posts. If the server has ranked again, posts that it no longer sends for that cursor leave the feed, and posts that are new for that cursor are ignored.
- The first page that arrives after the saved one never removes a saved post. A post that was deleted on the server stays on screen until the next load.
- A post that holds the keyboard focus is removed from the DOM when the user scrolls it far away with the mouse.
- The browser's "find in page" and a screen reader's browse mode only see the posts in the DOM.
- A post taller than two screens can never be half on screen, so it is never reported as seen.
- Control + End and Control + Home, which the feed pattern suggests for leaving the feed, are not built.
- The live connection carries new posts only. Like counts and comment counts of the posts on screen are not updated live, and a post that was deleted does not go away.
- There are no comments, no share, no composer for a new post, and no page of one post in the component. The demo has a small page of its own.
- A video has no captions track, no sound button and no progress bar. It loops.
- The image of a post has no blurred placeholder and no `fetchpriority` for the first image. The demo serves one file for every width.
- Events are handed to `onEvent`. The feed does not send them: batching to a server, `sendBeacon` on page hide and sampling are the caller's job. `post_render_failed` is sent again when a broken post comes back into the DOM.
- The time in `feed_loaded` runs from the moment the feed appeared to the moment React put the posts in the DOM, not to the paint.
- Server rendering is not handled: the first page is always fetched in the browser.
- The like request has no timeout of its own, and a rate limit of the server (`Retry-After`) is not read.
- No build step fails when the size budget is crossed. The size is measured by hand, with the command above.

## Try it in the demo

1. Scroll down for a while. "Post ids" grows, and "Posts in memory" stops at about 100. Scroll back to the top fast: you see empty placeholders for a moment, and then the posts again.
2. Click the date of a post, then go back. The same post is at the same place.
3. Press "Publish a new post" twice. A pill says "2 new posts". Nothing moves until you press it.
4. Tick "Drop the live connection". "Live connections" goes to 0, and the "Last request" line shows the tries to reconnect, each after a longer wait. Untick it and the connection comes back.
5. Tick "Make the server fail" and like a post. The like stays, and a notice says that it is not saved yet. Untick the box and scroll: the next page arrives, and the like is sent.
6. Scroll to the eighth post. The server sent it with no author. It says "This post cannot be shown." and the feed goes on.
7. Scroll to a video. It plays while it is on screen and stops when it leaves.
8. Reload the page. The first posts are there at once, from the saved page.
