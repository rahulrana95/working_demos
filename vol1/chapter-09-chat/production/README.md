# Chapter 9: Chat, the production version

Two people write to each other, and each sees the other's messages at once.

This folder is **not an interview answer**. It is the staff answer from
[`../60-minutes`](../60-minutes), plus what a team adds in the first weeks
before real users see it. Do not try to write it in an interview. Know that it
exists, and name one or two of its parts when the interviewer asks, "What
would you do next?" The [chapter README](../README.md) compares the three folders.

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

## What is in the folder

No file here is part of the interview. Every source file says so on its first line.

| File                               | What it holds                                                                        | Lines of code |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ------------- |
| `src/chat/types.ts`                | The message, the request functions, the frames, the events                           | 70            |
| `src/chat/messagesReducer.ts`      | The message list as a pure function, with receipts and a status that never goes back | 75            |
| `src/chat/socket.ts`               | One shared connection: backoff, jitter, heartbeat, long polling, many listeners      | 160           |
| `src/chat/useChat.ts`              | One conversation: history, outbox, catch-up, images, receipts, typing, events        | 341           |
| `src/chat/outboxStorage.ts`        | The outbox in `localStorage`, checked when it is read                                | 73            |
| `src/chat/sendLock.ts`             | One tab at a time sends a message (Web Locks)                                        | 11            |
| `src/chat/clientId.ts`             | The id of a new message, also on a page without `crypto.randomUUID`                  | 7             |
| `src/chat/linkify.ts`              | Finds web addresses in a text, and says which addresses are safe                     | 39            |
| `src/chat/windowing.ts`            | Which loaded messages are drawn, and the helpers for days and times                  | 20            |
| `src/chat/messages.ts`             | Every text, the plural forms, and the helper that fills a text                       | 45            |
| `src/chat/MessageList.tsx`         | The list: scroll position, window, a line for every day                              | 139           |
| `src/chat/MessageRow.tsx`          | One message: text with links, image, progress, "Retry", "Cancel"                     | 65            |
| `src/chat/Composer.tsx`            | The text box, the image field, the typing signal                                     | 62            |
| `src/chat/Chat.tsx`                | One open conversation                                                                | 28            |
| `src/chat/conversationsReducer.ts` | The conversation list as a pure function, normalised                                 | 55            |
| `src/chat/useConversations.ts`     | The conversation list: last message and unread count                                 | 93            |
| `src/chat/ConversationList.tsx`    | The conversation list on screen                                                      | 55            |
| `src/chat/attention.ts`            | The count in the title of the tab, and notifications                                 | 41            |
| `src/api/xhrUpload.ts`             | A real upload function with progress. The demo does not use it                       |               |
| `src/api/fakeServer.ts`            | The fake server of the demo                                                          |               |
| `*.test.ts`, `*.test.tsx`          | 381 tests                                                                            |               |

Lines of code are counted without blank lines and comments: 1,379 in the 18
files of `src/chat`. The 60-minute answer has 430.

The code of `src/chat` is 7,689 bytes when it is minified and compressed with
gzip, without React. Measure it again with:

```bash
npx esbuild src/chat/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What was added to the 60-minute answer

The first five rows are in the design of the 60-minute answer. They did not
fit in its 430 lines, so they are here.

| Addition                           | Why it matters                                                                                | Test that proves it                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Receipts                           | The sender reads "Delivered" and "Read". A status never goes back.                            | `keeps read when a copy of the message that says sent arrives later`                                |
| Typing line                        | "Ravi is typing…", sent at most once in three seconds, gone after six.                        | `shows that the other person types, and stops six seconds after the last frame`                     |
| A window of rows                   | 5,000 loaded messages are 100 rows on the page.                                               | `draws 100 rows of 5,000 loaded messages, the newest ones`                                          |
| Conversation list                  | Last message and unread count, in a normalised store.                                         | `counts a message in a conversation that is not open, and moves it to the top`                      |
| A line for every day               | The date is written once, in the way of the language.                                         | `writes the date once above the first message of each day`                                          |
| Stored outbox                      | A message written before a reload, or in a conversation the user left, is still sent.         | `shows the messages that waited before a reload, and sends them with their old clientId`            |
| Two tabs                           | Two tabs do not send the same waiting message at the same time.                               | `sends nothing for a message that another tab got confirmed while this tab waited for the lock`     |
| Images                             | Shown at once from the local file, uploaded with progress, with "Cancel" and "Retry".         | `shows the image at once from the local file, uploads it, and then sends the address of the server` |
| Links                              | A web address is a real link. Nothing else in a message is trusted.                           | `makes a web address a link that opens a new tab and tells the other site nothing`                  |
| Long polling                       | The chat works where a WebSocket cannot open.                                                 | `starts to poll after three failed tries, and is open after the first answer`                       |
| Title badge and notifications      | The user learns about a message in a tab they are not looking at.                             | `shows a notification with the conversation as tag when the page is hidden and the user allowed it` |
| Events (`onEvent`)                 | The team can measure the time to the answer, failures and reconnects. No text is in an event. | `never puts the text of a message, a file name or the id of a person in an event`                   |
| One connection for the app         | The list and the open conversation share it. It is not closed when the conversation changes.  | `empties the list, keeps the connection and loads the new conversation`                             |
| Catch-up after the first page      | A message stored between the first answer and the opening of the connection is not missed.    | `catches up after the first page when the connection opened while that page was on its way`         |
| A send that fails while offline    | It is not marked "Not sent". It waits and goes out again after the reconnect.                 | `keeps the message sending, and sends it again with the same clientId after the reconnect`          |
| A new try when the network is back | The browser says "online": we try at once and do not wait for the timer.                      | `tries at once when the browser says the network is back, and drops the timer of the wait`          |
| Plural forms (`Intl.PluralRules`)  | "1 unread message", "2 unread messages", and the six forms of Arabic.                         | ``takes every text from `text`, with all the plural forms of Arabic``                               |
| A broken time from the server      | The message is drawn without a time. The list does not crash.                                 | `draws a message with a broken time without a time, and does not crash`                             |

## What the caller passes in

The app makes one connection and gives it to both hooks:

```ts
const socket = createChatSocket({ connect, poll, onEvent });
const list = useConversations(openConversationId, { currentUserId, fetchConversations, socket });
<Chat conversationId={openConversationId} peerName="Ravi" socket={socket} {...otherProps} />;
```

- `fetchMessages` and `sendMessage`, as in the 60-minute answer. `sendMessage` also gets `attachment` for a message with an image.
- `connect({ onOpen, onFrame, onClose })`, which returns `{ send, close }`. The frames are in `src/chat/types.ts`: "message", "receipt", "typing" and "pong" from the server, "ping", "typing" and "read" from us.
- `poll(cursor, signal)`, optional: one long-polling request. Leave it out, and the chat never falls back.
- `uploadFile(file, { signal, onProgress })`, optional. Leave it out, and the image field is not shown. `fetch` cannot report the progress of an upload, so a real function uses `XMLHttpRequest`. `src/api/xhrUpload.ts` is one, with tests.
- `fetchConversations(signal)` for the conversation list.
- `onEvent(event)`, optional, for monitoring.
- `store`, optional: where the outbox is kept. The default is `localStorage`. Pass `null` to keep nothing.

## How the styles ship

The component needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Chat" and "Conversation list" headings. The other
rules style the demo page.

- In a real package these rules ship as one CSS file next to the JavaScript, and the host app imports both.
- The colours (`--color-…`) are CSS variables, so a host app can theme the component without changing its rules.
- The rules use logical properties only, so the layout mirrors itself from right to left.
- The list sets `overflow-anchor: none`, because the component corrects the scroll position itself.
- An image has a fixed box (200 by 150 pixels, `object-fit: cover`), so an image that loads late does not move the list.
- The typing line keeps its height when it is empty, so the text box does not move.
- The file field is hidden for the eye only (`.visually-hidden`). It is still a real field for the keyboard and for screen readers, and its label shows the focus.
- A link is underlined, and the open conversation has a thick border, so neither is marked by colour alone.

The measured JavaScript size does not include this CSS. These rules are
1,152 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Chat|Conversation list/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

Everything in the [60-minute table](../60-minutes/README.md#why-it-holds-at-scale) still
holds, and its tests are in this folder under the same names. One has a new
name, because the list now asks for the page itself:
`keeps the visible rows in place when the older page it asked for arrives`.
These rows are new.

| Pressure                                                  | What protects us                                                                  | Test that proves it                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 5,000 messages are loaded                                 | The page holds a window of 100 rows                                               | `draws 100 rows of 5,000 loaded messages, the newest ones`                                      |
| New messages arrive all day                               | The window slides, so the page stays at 100 rows                                  | `still draws 100 rows after 50 new messages arrive at the bottom`                               |
| The user reads older messages and new ones arrive         | The window is pinned, so no row is removed above the text                         | `removes no row on top while the user reads older messages and new ones arrive`                 |
| The user scrolls back through memory                      | 50 rows are added from memory, with no request                                    | `adds 50 older rows from memory near the top, asks the server for nothing, and keeps the place` |
| The user is back at the newest messages                   | The window shrinks to 100 rows again                                              | `shrinks back to 100 rows when the user is at the bottom again`                                 |
| The server is in trouble and the user scrolls             | After a failed load only the button asks again                                    | `does not load on scroll while the last request failed`                                         |
| A WebSocket cannot open                                   | Long polling after three failed tries, and a new try of the WebSocket each minute | `tries the WebSocket again once a minute, and stops polling when it opens`                      |
| The switch from polling to the WebSocket loses a frame    | Listeners are told "open" again, and catch up                                     | `tries the WebSocket again once a minute, and stops polling when it opens`                      |
| The same message is pushed twice to the conversation list | A message that is not newer than the last one is not counted                      | `counts and announces a message once when the server pushes it twice`                           |
| Storage is full, switched off, or changed by hand         | Every call may fail, and what is read is checked                                  | `drops stored entries that are not a waiting message of this person and conversation`           |
| A send function never answers and holds the lock          | The time limit ends the task, so the lock is free for the other tab               | `lets go of the lock after the time limit, also when the send function never answers`           |
| Many images are sent                                      | Every local preview is released                                                   | `releases the local preview when the server's copy has replaced it`                             |
| The user types fast                                       | "typing" is sent at most once in three seconds                                    | `tells the server that I type at most once in three seconds`                                    |
| A receipt covers many messages                            | One frame says "up to this time", not one frame for each message                  | `marks my messages up to the time of the receipt as delivered, and no later one`                |

### Measured with 5,000 messages

[`../scripts/measure-history.mjs`](../scripts/measure-history.mjs) opens the
demo with 5,000 old messages, loaded in one page in both screens, and measures
with a real Chromium. The median of 5 runs on our machine:

| Folder       | Rows in one list | Elements in one list | Elements on the page | JavaScript heap | One new message, key press to paint |
| ------------ | ---------------- | -------------------- | -------------------- | --------------- | ----------------------------------- |
| `45-minutes` | 5,000            | 15,000               | 30,063               | 10.2 MB         | 38 ms                               |
| `60-minutes` | 5,000            | 15,000               | 30,074               | 13.0 MB         | 42 ms                               |
| `production` | 100              | 321                  | 770                  | 5.1 MB          | 8 ms                                |

The 5,000 message objects are in memory in all three folders. The rows on the
page make the difference. These are lab numbers from one desktop computer,
with a fake server in the page. They are not numbers from real users on real
phones, and your numbers will differ.

**The trade-off of the window.** The page is small while the user is at the
newest messages. A user who scrolls back through everything still gets a long
page, 50 rows at a time. A full virtual list would also remove the rows below
the screen. It must then know the height of rows it does not draw, and chat
rows have no fixed height.

## Message text is not trusted

A message is written by another person. So:

- The text is drawn as text. There is no `dangerouslySetInnerHTML` in this folder.
- A web address becomes a link only when it parses, when it is `http` or `https`, and when it holds no user name. `https://bank.example@evil.example` stays text: it shows a name the user trusts and opens another site.
- The link text is the address as it was written. A link never says one thing and opens another.
- Every link has `rel="noopener noreferrer"` and opens a new tab. The new page gets no handle on the chat, and the other site is not told where the user came from.
- The address of an image is checked too: `http`, `https` and `blob` only. The image box has a fixed size.
- The preview in the conversation list, and the title of a notification, are text. A notification holds the name of the sender and never the text of the message, because it is also shown on a locked screen.
- What is read from `localStorage` is checked field by field, and only known fields are taken.

## Events for monitoring

`onEvent` gets these. The exact types are `ChatEvent` in `src/chat/types.ts`.

| Event            | Fields                                                  | What a team watches                                  |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| `message_sent`   | `ackMs`, `hasAttachment`                                | The time from the send to the answer of the server   |
| `message_failed` | `reason` (timeout, error, upload), `hasAttachment`      | The failure rate, and why                            |
| `reconnect`      | `attempt`, `transport` (socket, polling)                | How often connections drop, and how many use polling |
| `history_loaded` | `kind` (newest, older, catch_up), `count`, `durationMs` | How slow history is, and how much a catch-up brings  |

An event holds numbers and fixed words. It never holds the text of a message,
a file name, an address or the id of a person. A test sends a secret text and
a secret file name through every path and searches all events for them.

## Edge cases covered

Everything in the [60-minute list](../60-minutes/README.md#edge-cases-covered), and:

- A message waits in storage and the newest page already holds it: one message on screen, and the stored copy is removed.
- A failed message is still failed after a reload. It is not sent again by itself.
- The user leaves a conversation with a waiting message: it is still stored, and it is sent when they come back.
- A message is written in the same draw as a change of conversation: it is stored under its own conversation.
- Storage throws on every call: the message is still sent.
- Another tab confirms a message while this tab waits for the lock: this tab sends nothing, and goes on with the next message.
- A file that is not an image, or an image over 5 MB: refused before any byte is sent, with an alert.
- "Cancel" during an upload: the upload stops, the message is removed, the preview is released, and no failure is reported.
- The upload worked and only the send failed: "Retry" does not upload again.
- An image and texts around it: they are sent in the order the user made them.
- A step of an upload while the user reads older messages: the list does not jump to the bottom.
- A receipt of another conversation, my own typing from another tab, typing in another conversation: ignored.
- The page is hidden: no "read" is sent. When the user comes back, it is.
- My own message from another tab is never counted as unread.
- The server still counts messages of the conversation that is open: no count is shown on it.
- An old answer of the conversation list arrives after a newer one: ignored.
- A notification throws, as it does in nearly every mobile browser: nothing breaks.
- The user said "Block" to notifications before: the browser is not asked again.
- A text like `javascript:alert(1)`, `data:…`, `www.example.com` or `//example.com`: no link.
- "See https://example.com/page." The full stop is not part of the link.
- A time from the server that `Date` cannot hold: the message has no time, and no line for the day.
- A page without `crypto.randomUUID` (plain http): the id of a message is made from random bytes.

## Accessibility

As in the [60-minute answer](../60-minutes/README.md#accessibility), and:

- The conversation list is a `nav` with a name. Each conversation is a button. The open one has `aria-current`, and a thick border that high-contrast mode keeps.
- The unread count is a whole phrase, "3 unread messages", in the plural form of the language. It is not only a number in a coloured circle.
- An image has its file name as text alternative. An upload has a `progress` element with a name, "Uploading, 40%".
- The image field is a real file field inside its label. It works with the keyboard like any other field.
- "Retry" and "Cancel" are removed when they are pressed. Focus then moves to the list. A click on a link leaves the focus on the link.
- A refused file is said in an alert that is always on the page.
- The typing line is not a live region. It changes too often to be read out.
- The date above the first message of a day is a plain paragraph, so a screen reader reads it.

We tested this with the keyboard and with automated tests. We did not test it
with a screen reader.

## What we checked against the browser documentation

We read the MDN page of every browser feature this folder relies on. What we found:

- **WebSocket.** A page cannot send or see the ping frames of the protocol, and there is no event for a connection that died silently. So the heartbeat is our own frame. The API also has no way to slow down a server that sends too fast.
- **`overflow-anchor`.** Scroll anchoring is on by default where the browser has it. MDN lists the property as available in all current browsers only since September 2026. So the component switches it off and corrects the scroll position itself: the result is then the same in an older Safari.
- **`role="log"`.** It already means `aria-live="polite"`. MDN also says that new content of a log belongs at its end. We add older messages at its start, so we mark the log `aria-busy` while a page loads.
- **`new Notification()`.** It throws in nearly every mobile browser, which wants a service worker for it. We catch that. The question for permission should come from a click, and it works only on https.
- **Upload progress.** `fetch` cannot report it. `XMLHttpRequest.upload` can, and its listener must be set before `send`.
- **`URL.createObjectURL`.** The address keeps its file until `URL.revokeObjectURL` is called. We call it for every preview.
- **Web Locks.** A lock belongs to an origin and is shared by its tabs and workers. It needs https or localhost. Where it is missing, the send runs without it.
- **`crypto.randomUUID`.** It needs https or localhost.

## Known limits, described in the book but not built here

- No full virtual list. A user who scrolls back through all the history gets a row for every message.
- No end-to-end encryption. The server reads every message. With it, the server could not make previews or search.
- No groups. Every conversation has two people.
- No search in messages.
- Messages cannot be edited or deleted, and there are no reactions and no replies to one message.
- The server must return everything after the cursor in one answer. There is no second page of a catch-up, so after a very long time offline the answer can be large.
- While the chat uses long polling, "typing" and "read" frames are not sent: they go on the WebSocket only.
- A message counts as read when its conversation is open in a tab the user can see. We do not check that the message was scrolled into view.
- "Delivered" comes from the server, when it has pushed the message. The client does not confirm it.
- A message with an image is not stored in the outbox. A reload during an upload loses it. A file cannot be kept in `localStorage`. IndexedDB could keep it.
- An image has no text next to it, and only images can be attached. There is no resize before the upload.
- An upload has one time limit of two minutes. It does not look at how fast the bytes move.
- The outbox in `localStorage` is plain text, readable by any script of the page. The app must clear it on logout: the keys start with `chat-outbox:`.
- A second tab shows the waiting messages of the first tab only after a reload. It does not listen to the `storage` event.
- The lock stops two tabs from sending at the same moment. It does not stop a second send after the first one failed without an answer: the server's `clientId` check does that.
- A notification is shown only while the page is open in some tab. With the page closed there is none: that needs a service worker and push messages. The same service worker is what a notification on a phone needs.
- The title badge is "(3)" in front of the title. The Badging API, for the icon of an installed app, is not used.
- The component does not stick to the bottom when the list itself changes size, for example when a phone opens its keyboard.
- A screen reader may still read older messages when a page is added, in spite of `aria-busy`. A separate hidden live region for new messages only is the stronger design.
- Link text is shown as written. An address with letters from another alphabet that look like Latin letters is not marked.
- The time of a message is the time zone of the browser. A change of day at midnight does not draw the lines again until the next draw.
- There is no retry of a failed catch-up before the next reconnect.
- No build step fails when the size budget is crossed. The size is measured by hand, with the command above.

## Try it in the demo

1. Send a message from Asha to Ravi. It goes from "Sending…" to "Sent", "Delivered" and "Read".
2. Type in Asha's screen and watch Ravi's: "Asha is typing…".
3. Press "Meera writes to Asha". Asha's list shows "1 unread message", and the title of the tab starts with "(1)". Open the conversation: both are gone.
4. Tick "Drop the connection" for Asha, send a message, and reload the page. The message is still there, and it is sent.
5. Tick "Block the WebSocket" for Ravi and send from Asha. After three failed tries Ravi's screen polls, and the message arrives. The events show a reconnect with `"transport":"polling"`.
6. Choose "Send an image". The image is there at once, with a progress bar and "Cancel".
7. Send `https://example.com/a?b=1.` and `javascript:alert(1)`. The first is a link without its full stop. The second is text.
8. Open the page with `?seed=5000&page=5000`. Both screens load 5,000 messages and draw 100 rows each. Scroll up: 50 more rows each time.
9. Read the "Events for monitoring" list. It holds counts and times, never the text you typed.
10. Press "Notifications for Asha: turn on", allow them, switch to another tab, and let Meera write. This step needs a browser window that you can see: a notification is a window of the system.
