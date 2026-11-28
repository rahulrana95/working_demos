# Chapter 9: Chat, the 45-minute answer

Two people write to each other, and each sees the other's messages at once.

This is the senior answer. The staff answer, with 15 more minutes of work, is
in [`../60-minutes`](../60-minutes). What a team adds after the interview is in
[`../production`](../production). The [chapter README](../README.md) compares the three.

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

| File                          | In the interview? | Time       | Lines of code |
| ----------------------------- | ----------------- | ---------- | ------------- |
| `src/chat/types.ts`           | Yes               | 2 minutes  | 24            |
| `src/chat/messagesReducer.ts` | Yes               | 7 minutes  | 39            |
| `src/chat/useChat.ts`         | Yes               | 14 minutes | 100           |
| `src/chat/MessageList.tsx`    | Yes               | 11 minutes | 92            |
| `src/chat/Composer.tsx`       | Yes               | 4 minutes  | 41            |
| `src/chat/Chat.tsx`           | Yes               | 2 minutes  | 17            |
| `*.test.ts`, `*.test.tsx`     | No                |            |               |
| `src/App.tsx`, `src/api/`     | No                |            |               |
| `src/styles.css`              | No                |            |               |

Lines of code are counted without blank lines and comments: 313 in total.
The folder has 107 tests.

The component code is 2,118 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/chat/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 40 minutes of typing for someone who has practised it. The other
5 minutes go to walking the interviewer through one message: sent, answered,
and pushed back by the server, on screen once.

## What the caller passes in

The component has no server address in it. The page gives it three functions:

- `fetchMessages(conversationId, beforeCursor, signal)` loads one page of history.
- `sendMessage({ clientId, conversationId, text }, signal)` stores one message and resolves with the confirmed copy.
- `connect({ onFrame })` opens the live connection and returns `{ close }`.

The component cannot see an HTTP status code. It only sees whether a promise
resolves or rejects. So the contract is in `src/chat/types.ts`, in words:

- Both request functions reject on every failure, and when their signal is aborted, as `fetch` does. The time limit of a send relies on this.
- The server remembers the `clientId` of a message. The same `clientId` again gives the stored message back, and nothing new is stored.
- The server pushes every new message to everyone in the conversation, also to the sender, always with its `clientId`.
- After `close`, `connect` never calls `onFrame` again.

## How the styles ship

The component needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Chat" heading. The other rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the component without changing its rules.
- The list sets `overflow-anchor: none`. The component corrects the scroll position itself. With the scroll anchoring of the browser switched on, both would correct it, and the list would move twice.
- The bar above the list has a fixed height, so the list does not move when the text of the bar changes.
- The text box sets `font-size: max(16px, 1rem)`, because Safari on iPhone zooms the page when a focused text box has text smaller than 16px.
- Every button is at least 44px tall, so a finger can hit it.
- The text of a message keeps its line breaks (`white-space: pre-wrap`) and breaks a very long word (`overflow-wrap: anywhere`).

The measured JavaScript size does not include this CSS. The chat rules are
706 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Chat/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                               | What protects us                                                   | Test that proves it                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| The server pushes my own message back to me            | One entry for one `clientId`                                       | `shows my message once when the server also pushes it back, before or after the answer`       |
| The answer is lost, but the server did store it        | "Retry" sends the same `clientId`, and the pushed copy confirms it | `confirms a failed message when the server did store it and pushes its copy`                  |
| The user's clock is wrong                              | Confirmed messages are ordered by server time                      | `uses the server time of a confirmed message, also when our own clock is five minutes behind` |
| A message arrives late                                 | It goes to its server time, the others stay                        | `puts a late delivery at its server time, and does not reorder the others`                    |
| The history is thousands of messages                   | Pages: the newest first, an older one only when the user asks      | `loads the page before the oldest one with the cursor of the server`                          |
| The user scrolls up quickly                            | One page request at a time                                         | `ignores a second call for an older page while the first one loads`                           |
| An older page is added above the text the user reads   | The scroll position is corrected before the browser paints         | `keeps the visible rows in place when an older page is added on top`                          |
| A message arrives while the user reads older ones      | The list does not move, and "New messages" appears                 | `does not move and shows New messages when a message arrives while the user reads older ones` |
| The server never answers a send                        | A time limit of 10 seconds                                         | `cancels a send with no answer after 10 seconds and marks it as failed`                       |
| The user opens another conversation while requests run | Every request is cancelled, and a late answer is ignored           | `cancels the page request of the old conversation and ignores its late answer`                |
| 5,000 messages arrive in the wrong order               | One merge and one sort for a whole page                            | `keeps 5,000 messages in server order when they arrive in the wrong order`                    |

### What it costs to draw every message

This answer draws every loaded message. We loaded 5,000 messages in one page,
in both screens of the demo, with [`../scripts/measure-history.mjs`](../scripts/measure-history.mjs).
One list then had 5,000 rows and 15,000 elements. The whole page had 30,063
elements and a JavaScript heap of 10.2 MB. One new message took 38 ms from the
key press to the paint. These are lab numbers from one desktop computer. The
`production` folder draws a window of 100 rows: 321 elements in one list, and
8 ms for one new message.

## Edge cases covered

- An empty text, or only spaces and new lines: nothing is sent, and the text stays in the box.
- The text is trimmed. A text over 2,000 characters is not sent, and the text box does not take more.
- Enter sends. Shift+Enter makes a new line.
- Enter while typing in a Hindi, Japanese or Chinese keyboard does not send. This also holds in Safari, which sends that Enter in a different way.
- The pushed copy of my message arrives before the answer to my send, or after it: one message on screen.
- The server pushes a message twice: one message on screen.
- The send fails after the pushed copy has confirmed the message: the message stays "sent".
- A second click on "Retry" while the first is on its way: nothing is sent.
- "Retry" and "New messages" are removed when they are pressed: focus moves to the list, and is not lost.
- A live message arrives before the first page of history: it is kept.
- A frame of another conversation, or of a kind the component does not know: ignored.
- The first page fails: an error with the button to load again. An older page fails: the messages stay, and the same page can be asked for again.
- The user scrolls while an older page loads: the rows still keep their place when it arrives.
- Only a status changes while the user reads older messages: no "New messages".
- My own new message while I read older ones: the list goes to the bottom.
- The component is removed, or the conversation changes, while requests run: they are cancelled, the connection is closed, and no timer is left.
- A text with HTML in it is drawn as text.
- High-contrast mode (forced colours): my own messages have a thicker border, and a failed message has a broken border.

## Accessibility

The list is a `role="log"` with `aria-live="polite"`, so a screen reader reads a
new message when the user is idle. It has a name, and it can take the focus,
so a keyboard user can scroll it. `aria-relevant="additions"` means that a new
row is read out, and a status that changes from "sending" to "sent" is not
read out again. Each message is plain text: who, when and the status, for
example "You, 10:42, sent". The status is a word, never only a colour.

While an older page loads, the log is marked `aria-busy`. A log is meant to
grow at its end. Older messages are added at its start, and a screen reader
could read them as new without that mark.

The text box has a visible label. Every button is a real button, at least 44px
tall, and can be reached and pressed with the keyboard: "Load older messages",
"Retry", "New messages" and "Send". The loading error is an alert.

We tested this with the keyboard and with automated tests. We did not test it
with a screen reader.

## Known limits of this answer

These are the first things the 60-minute answer and the `production` folder add.

- The connection is assumed to stay open. When it drops, messages sent meanwhile are missing until the page is loaded again. The demo shows it: tick "Drop the connection".
- Messages are sent in parallel. Two quick messages can reach the server in the wrong order.
- A message that is still sending when the user opens another conversation is cancelled and gone.
- Every loaded message is drawn. See the numbers above.
- The texts are English and fixed in the components.
- The statuses "delivered" and "read" are in the type, but nothing sets them.
- A message from the server with a time that is not a number breaks the list.

## Try it in the demo

1. Type in Asha's screen and press Enter. The message is "sending", then "sent", and it appears in Ravi's screen. The panel shows that the server pushed it to both.
2. Tick "Fail the next send" for Asha and send a message. It is "failed", with "Retry". Press "Retry". Ravi gets one copy.
3. Tick "Lose the answer to the next send" and send a message. The server stores it, and Asha gets no answer. The copy that the server pushes confirms the message anyway.
4. Scroll up in Ravi's screen and send from Asha's. Ravi's list does not move, and "New messages" appears.
5. Press "Load older messages" in the middle of reading. The message you were reading stays where it was.
6. Tick "Drop the connection" for Ravi, send from Asha's screen, and untick it. Ravi never gets that message. The 60-minute answer fixes this.
