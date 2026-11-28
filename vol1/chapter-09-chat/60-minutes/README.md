# Chapter 9: Chat, the 60-minute answer

Two people write to each other, and each sees the other's messages at once.

This is the staff answer. It is the senior answer from
[`../45-minutes`](../45-minutes), plus 15 minutes of additions: the chat keeps
working when the connection drops, and another team can translate it. The
[chapter README](../README.md) lists what each addition buys. What a team adds
after the interview is in [`../production`](../production).

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

Every source file says on its first lines whether you would write it in the
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                          | In the interview?                   | Time       | Lines of code                |
| ----------------------------- | ----------------------------------- | ---------- | ---------------------------- |
| `src/chat/types.ts`           | Yes                                 | 3 minutes  | 31                           |
| `src/chat/messagesReducer.ts` | Yes                                 | 7 minutes  | 39                           |
| `src/chat/connection.ts`      | Yes                                 | 6 minutes  | 52                           |
| `src/chat/messages.ts`        | Yes                                 | 2 minutes  | 17                           |
| `src/chat/useChat.ts`         | Yes                                 | 19 minutes | 129                          |
| `src/chat/MessageList.tsx`    | Yes                                 | 12 minutes | 98                           |
| `src/chat/Composer.tsx`       | Yes                                 | 4 minutes  | 42                           |
| `src/chat/Chat.tsx`           | Yes                                 | 2 minutes  | 22                           |
| `src/styles.css`              | Only the idea of logical properties |            | 223, most of it demo styling |
| `*.test.ts`, `*.test.tsx`     | No                                  |            |                              |
| `src/App.tsx`, `src/api/`     | No                                  |            |                              |

Lines of code are counted without blank lines and comments: 430 in the eight
TypeScript files, which is 117 more than the 45-minute answer. The folder has
157 tests.

The component code is 2,659 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/chat/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 55 minutes of typing for someone who has practised it. The other
5 minutes go to walking the interviewer through one dropped connection: what
waits, what is asked for again, and why nothing is shown twice.

## What was added to the 45-minute answer

| Addition                                                   | Where                               | Minutes |
| ---------------------------------------------------------- | ----------------------------------- | ------- |
| Reconnect with backoff and jitter, and a heartbeat         | `connection.ts`, `types.ts`         | 6       |
| Outbox: one send at a time, in order, waiting when offline | `useChat.ts`                        | 3       |
| Catch-up after a reconnect (`{ after }`, `newerCursor`)    | `useChat.ts`, `types.ts`            | 2       |
| The line "Connecting…" (`isOpen`)                          | `useChat.ts`, `MessageList.tsx`     | 1       |
| `messages` and `locale`                                    | `messages.ts`, the three components | 3       |
| Logical CSS properties (they are in the 45-minute CSS too) | `styles.css`                        |         |

### What the design brief asks for and this folder does not have

The 60-minute answer has a hard limit of 430 lines, because the book promises
that it can be typed in the time. These parts did not fit. They are built and
tested in [`../production`](../production):

- Delivery and read receipts ("delivered", "read").
- The typing line.
- A window of rows for a long history. This answer draws every loaded message, as the 45-minute answer does.
- The conversation list with unread counts.
- A line for every new day.

## What the caller passes in

- `fetchMessages(conversationId, cursor, signal)`. The cursor is `{ before: null }` for the newest page, `{ before: olderCursor }` for an older page, or `{ after: newerCursor }` for everything the server stored after an earlier answer. Every answer has `newerCursor`.
- `sendMessage({ clientId, conversationId, text }, signal)`, as in the 45-minute answer.
- `connect({ onOpen, onFrame, onClose })`, which returns `{ send, close }`. The component sends only `{ type: "ping" }` on it, and the server answers `{ type: "pong" }`.

The contract is in `src/chat/types.ts`. Three rules are new:

- `connect` never calls a handler before it has returned.
- After `close`, and after it called `onClose`, it never calls a handler again.
- `send` never throws. It drops the frame when the connection is not open.

## How the styles ship

The component needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Chat" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the component without changing its rules.
- The rules use logical properties only (`margin-inline`, `inset-inline`, `border-block-end`), so the layout mirrors itself in a language that is written from right to left. Choose "العربية" in the demo to see it.
- The list sets `overflow-anchor: none`. The component corrects the scroll position itself. With the scroll anchoring of the browser switched on, both would correct it, and the list would move twice.
- The bar above the list has a fixed height, so the list does not move when the text of the bar changes.
- The text box sets `font-size: max(16px, 1rem)`, because Safari on iPhone zooms the page when a focused text box has text smaller than 16px.
- Every button is at least 44px tall, so a finger can hit it.

The measured JavaScript size does not include this CSS. The chat rules are
715 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Chat/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                             | What protects us                                                        | Test that proves it                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The server pushes my own message back to me          | One entry for one `clientId`                                            | `shows my message once when the server also pushes it back, before or after the answer`        |
| The answer is lost, but the server did store it      | "Retry" sends the same `clientId`, and the pushed copy confirms it      | `confirms a failed message when the server did store it and pushes its copy`                   |
| The user's clock is wrong                            | Confirmed messages are ordered by server time                           | `uses the server time of a confirmed message, also when our own clock is five minutes behind`  |
| The history is thousands of messages                 | Pages: the newest first, an older one only when the user asks           | `loads the page before the oldest one with the cursor of the server`                           |
| An older page is added above the text the user reads | The scroll position is corrected before the browser paints              | `keeps the visible rows in place when an older page is added on top`                           |
| The server is down                                   | Backoff: every failed try doubles the wait, up to 30 seconds            | `waits longer after every failed try: 1, 2, 4, 8, 16, 30 and 30 seconds`                       |
| A million clients reconnect after a restart          | Jitter: half of every wait is random                                    | `spreads the clients: a different random number gives a different wait`                        |
| The server opens a connection and closes it at once  | Only a frame from the server makes the next wait short again            | `does not shorten the wait for a server that opens the connection and closes it at once`       |
| The connection dies without a "close" event          | Heartbeat: a "ping" every 15 seconds, and any frame counts as an answer | `gives up a connection that says nothing between two heartbeats, and opens a new one`          |
| The user writes while there is no connection         | Outbox: the messages wait, and go out in order                          | `holds messages written after the connection dropped, and sends each once after the reconnect` |
| Two quick messages race each other to the server     | Outbox: one send at a time                                              | `sends one message at a time, in the order the user wrote them`                                |
| A send never ends and blocks the messages behind it  | The time limit ends the wait itself                                     | `sends the next message after a time-out, also when the send function never answers`           |
| Messages were pushed while we were not connected     | Catch-up: ask for everything after the last cursor of the server        | `loads the messages it missed, shows a pushed one once, and keeps the load status`             |
| A catch-up fails, and newer messages arrive after it | The cursor moves only after an answer of the server                     | `asks from the same cursor again when a catch-up failed, so no message is skipped`             |
| Many teams, many languages                           | Every text comes from `messages`                                        | ``takes every text from `text`: no English is fixed in the list``                              |

### What it costs to draw every message

This answer draws every loaded message. We loaded 5,000 messages in one page,
in both screens of the demo, with [`../scripts/measure-history.mjs`](../scripts/measure-history.mjs).
One list then had 5,000 rows and 15,000 elements. The whole page had 30,074
elements and a JavaScript heap of 13.0 MB. One new message took 42 ms from the
key press to the paint. These are lab numbers from one desktop computer. The
`production` folder draws a window of 100 rows: 321 elements in one list, and
8 ms for one new message.

## Edge cases covered

Everything in the [45-minute list](../45-minutes/README.md#edge-cases-covered), and:

- A message written while there is no connection: it is on screen as "Sending…", a status line says "Connecting…", and nothing is sent.
- The 10 second limit of a message starts when it is really sent, not while it waits.
- One message of the outbox fails: it is marked, and the next one goes out.
- A second "Retry" on the same message: one send.
- The connection opens before the first page has arrived: no extra request.
- The connection opens after the first page: one catch-up, from the cursor of that page.
- A message is in the catch-up and is also pushed on the new connection: one message on screen.
- An older page loads: the catch-up cursor does not move.
- A catch-up runs while an older page is loading: both work, and the status of the page is not touched.
- The parent passes a new `connect` function: the next reconnect uses it.
- The connection opens in the same draw as a change of conversation: nothing of the old conversation is sent into the new one.
- The connection never opens: it is given up after two heartbeats, and the next try follows.
- The component is removed while it waits for the next try: no timer is left, and no reconnect follows.
- A text that is left out of `messages` stays in English.

## Accessibility

As in the [45-minute answer](../45-minutes/README.md#accessibility): the list
is a `role="log"` with a name, each message is plain text ("You · 10:42 ·
Sent"), and every control works with the keyboard.

New here: "Connecting…" is in a `role="status"` element that is always on the
page, so a screen reader reads the text when it appears. The name of the list
is the name of the other person. The time is written by
`Intl.DateTimeFormat` for the `locale` prop.

We tested this with the keyboard and with automated tests. We did not test it
with a screen reader.

## Known limits of this answer

- A send that fails while the connection is open is marked "Not sent", also when the connection dropped a moment later and was the real cause. The user presses "Retry". The `production` folder keeps such a message in the outbox.
- A message stored on the server in the short time between the answer with the first page and the opening of the connection is missed until the next reconnect. The `production` folder catches up after the first page.
- The outbox is in memory. A reload, or a change of conversation, loses the messages that wait.
- A dead connection is found after 15 to 30 seconds, not at once.
- The server must return everything after the cursor in one answer. There is no second page of a catch-up.
- The plural forms of a language are not needed yet: no text has a count.
- Every loaded message is drawn. See the numbers above.

## Try it in the demo

1. Tick "Drop the connection" for Asha. The line "Connecting…" appears. Send two messages. They stay "Sending…", and Ravi gets nothing.
2. Untick it. After a short and partly random wait the connection is back. The panel shows one catch-up request, and then the two sends, one after the other. Ravi gets both once, in order.
3. Tick "Drop the connection" for Asha, send a message from Ravi's screen, and untick it. Asha gets the message from the catch-up.
4. Choose "हिन्दी" or "العربية" in the language box. Every text changes, the time is written for that language, and in Arabic the layout is mirrored.
5. Do the steps of the [45-minute demo](../45-minutes/README.md#try-it-in-the-demo). They all still work.
