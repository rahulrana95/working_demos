# Chapter 9: Chat

Two people write to each other, and each sees the other's messages at once.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                 |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | A chat that never shows a message twice and never moves the text you read: ids, order, pages, scroll.      |
| [`60-minutes`](60-minutes) | Staff                   | The same code, plus a connection that comes back, an outbox, a catch-up, and texts that can be translated. |
| [`production`](production) | Not an interview answer | The staff answer, plus what you add in the first weeks before real users see it.                           |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are the lines in `src/chat`, without tests, blank lines and
comments, and without `index.ts`. The size is the code of `src/chat` without
React, minified and compressed with gzip. Each folder's README has the command
that measures it. For the two interview answers the lines are the files you
write in the interview. For `production` they are all 18 files.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 107   | 313           | 2,118 bytes             | 706 bytes           |
| `60-minutes` | 157   | 430           | 2,659 bytes             | 715 bytes           |
| `production` | 381   | 1,379         | 7,689 bytes             | 1,152 bytes         |

The book promises that an interview answer can be typed in its time. So the
two interview folders have hard limits: 320 lines for 45 minutes and 430 lines
for 60 minutes.

## What the extra 15 minutes buys

The 45-minute answer is correct while the connection stays open. The
60-minute answer is correct when it does not.

| Addition                                            | Why it matters                                                                                                                        | Minutes |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Reconnect with backoff and jitter (`connection.ts`) | A dropped connection comes back by itself. A server that is down is not hit harder, and clients do not all return in the same second. | 4       |
| Heartbeat                                           | A connection that died without a "close" event is found, in 15 to 30 seconds.                                                         | 2       |
| Outbox                                              | Messages go out one at a time, in the order the user wrote them. Without a connection they wait.                                      | 3       |
| Catch-up (`{ after }`, `newerCursor`)               | After a reconnect we ask for what the server stored while we were away. Nothing is missed and nothing is shown twice.                 | 2       |
| "Connecting…" line                                  | The user knows why a message still says "Sending…".                                                                                   | 1       |
| `messages` and `locale`                             | Every text can be translated, and the time is written for the language. No English is fixed in the components.                        | 3       |

## Where each part of the design lives

The design for this chapter gives the 60-minute answer more than fits in 430
lines. The parts that did not fit are built in `production`. Nothing was
dropped.

| Part of the design                                            | `45-minutes` | `60-minutes` | `production` |
| ------------------------------------------------------------- | ------------ | ------------ | ------------ |
| One entry for one `clientId`, optimistic send, "Retry"        | Yes          | Yes          | Yes          |
| Server order, with waiting messages at the bottom             | Yes          | Yes          | Yes          |
| History in pages, older pages on scroll                       | Yes          | Yes          | Yes          |
| Stay at the bottom, "New messages", no jump for an older page | Yes          | Yes          | Yes          |
| Enter, Shift+Enter, IME, trim, length limit                   | Yes          | Yes          | Yes          |
| A time limit for a send                                       | Yes          | Yes          | Yes          |
| Reconnect with backoff and jitter, heartbeat                  |              | Yes          | Yes          |
| Outbox in order, waiting while offline                        |              | Yes          | Yes          |
| Catch-up after a reconnect                                    |              | Yes          | Yes          |
| `messages`, `Intl.DateTimeFormat`, right-to-left layout       |              | Yes          | Yes          |
| Receipts ("delivered", "read")                                |              |              | Yes          |
| Typing line                                                   |              |              | Yes          |
| A window of rows for a long history                           |              |              | Yes          |
| Conversation list with unread counts, normalised store        |              |              | Yes          |
| A line for every day                                          |              |              | Yes          |
| Outbox in `localStorage`, two tabs (Web Locks)                |              |              | Yes          |
| Images with progress, cancel and retry                        |              |              | Yes          |
| Links from message text, and nothing else trusted             |              |              | Yes          |
| Long polling when a WebSocket cannot open                     |              |              | Yes          |
| Title badge and notifications                                 |              |              | Yes          |
| Events for monitoring (`onEvent`)                             |              |              | Yes          |

The [production README](production/README.md) names the test that proves each one.

## Measure a long history in a real browser

`scripts/measure-history.mjs` opens the demo with 5,000 old messages, loaded
in one page in both screens, with a real Chromium. It prints how many rows and
elements the page holds, the JavaScript heap, and the time one new message
takes from the key press to the paint. It needs
[Playwright](https://playwright.dev) installed, with its Chromium browser.

In one terminal, build a folder and serve it:

```bash
cd 45-minutes && npm run build && npx vite preview
```

In a second terminal, in this folder:

```bash
node scripts/measure-history.mjs
```

The script opens `http://localhost:4173`. If the preview prints another
address, pass it: `node scripts/measure-history.mjs http://localhost:4174`. A
second argument changes the number of messages.

It prints one line. These are the three folders on our machine. We put the
name of the folder in front of each line:

```text
45-minutes: 5000 messages, 2 screens, median of 5 runs: rows drawn in one list 5000; elements in one list 15000; elements on the page 30063; DOM nodes (with text nodes) 50119; JS heap 10.2 MB; load to first row 782 ms; one new message, key press to paint 38 ms
60-minutes: 5000 messages, 2 screens, median of 5 runs: rows drawn in one list 5000; elements in one list 15000; elements on the page 30074; DOM nodes (with text nodes) 50157; JS heap 13.0 MB; load to first row 849 ms; one new message, key press to paint 42 ms
production: 5000 messages, 2 screens, median of 5 runs: rows drawn in one list 100; elements in one list 321; elements on the page 770; DOM nodes (with text nodes) 1375; JS heap 5.1 MB; load to first row 400 ms; one new message, key press to paint 8 ms
```

What the numbers mean:

- "rows drawn in one list" is the number of messages on the page in the screen of one person. The demo has two screens, so the page holds twice as many.
- "DOM nodes" is what the browser itself counts for the whole page, with text nodes.
- "JS heap" is the JavaScript memory in use after a garbage collection. It holds the 5,000 messages of both screens in all three folders.
- "one new message" is the time from the Enter key to the second frame after the new row is on the page.

What they do not mean:

- They are lab numbers from one desktop computer, with a fake server in the page. They are not numbers from real users on real phones.
- The 45-minute and the 60-minute answer draw the same rows. The difference between their two lines is the noise of the measurement and a little more code, not a design choice.
- The heap is one sample. It moves by a megabyte or more from one run to the next.
- Your numbers will differ from ours.
