# Chapter 13: Collaborative editor, the 60-minute answer

Several people type in the same document at the same time, and everybody ends
with the same text.

This is the staff answer: the [45-minute answer](../45-minutes), plus what
makes it hold with a real server, a bad network and a long document. What a
team adds after the interview is in [`../production`](../production). The
[chapter README](../README.md) compares the three.

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
interview.

| File                          | In the interview? | Time       | Lines of code |
| ----------------------------- | ----------------- | ---------- | ------------- |
| `src/collab/types.ts`         | Yes               | 4 minutes  | 26            |
| `src/collab/rga.ts`           | Yes               | 20 minutes | 139           |
| `src/collab/textChange.ts`    | Yes               | 5 minutes  | 26            |
| `src/collab/session.ts`       | Yes               | 20 minutes | 169           |
| `src/collab/messages.ts`      | Yes               | 1 minute   | 6             |
| `src/collab/CollabEditor.tsx` | Yes               | 8 minutes  | 60            |
| `*.test.ts`, `*.test.tsx`     | No                |            |               |
| `src/collab/testHelpers.ts`   | No                |            |               |
| `src/collab/testNetwork.ts`   | No                |            |               |
| `src/App.tsx`, `src/server/`  | No                |            |               |
| `src/styles.css`              | No                |            |               |

Lines of code are counted without blank lines and comments: 426 in total, 201
more than the 45-minute answer (225). The limit of the book for this folder
is 430. The folder has 123 tests.

The code is 2,549 bytes when it is minified and compressed with gzip, without
React (45-minute answer: 1,402). Measure it again with:

```bash
npx esbuild src/collab/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## What is not here, and why

The design for this chapter also put **presence** in this folder: the carets
and selections of other people, with a name label. With it, these files were
515 lines, 85 over the limit. It moved to [`../production`](../production).
The session here still keeps its _own_ caret as two ids
(`setSelection`, `selection`), which is the idea presence is built on, and
the reason the caret does not jump when a remote edit arrives.

Everything else the design asked for is here: the sync protocol, offline,
the index, batching and undo.

## What changed from the 45-minute answer

| Change                                                    | Where                    | Why                                                                                               |
| --------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| A linked list and a `Map` from id to node                 | `rga.ts`                 | Finding a character and putting one in no longer walk the text.                                   |
| An insert holds a run of text, a delete a list of ids     | `types.ts`, `rga.ts`     | A paste is one edit. Each character still has its own id: `counter`, `counter + 1`, and so on.    |
| The text is kept between changes                          | `rga.ts`                 | React can read it on every draw without a walk.                                                   |
| `Op = Edit & { site, seq }`, and a version vector         | `types.ts`, `session.ts` | `seq` has no gaps, so a missing or repeated operation can be seen. A counter has gaps and cannot. |
| `hello` / `sync` / `ops` / `ack` messages                 | `types.ts`, `session.ts` | After a reconnect each side gets exactly what it missed.                                          |
| An outbox                                                 | `session.ts`             | An operation stays until the server acknowledges it. Offline edits are just a longer outbox.      |
| Edits wait 50 ms and are joined                           | `session.ts`             | A word typed quickly is one operation.                                                            |
| Undo                                                      | `session.ts`             | The inverse of your own change, as new operations. Changes of other people stay.                  |
| `messages`, `className`                                   | `CollabEditor.tsx`       | No English is fixed in the component, and the parent can style it.                                |
| The editor takes a `session`, not a `doc` and `transport` | `CollabEditor.tsx`       | All logic is in a class with no UI, tested without drawing anything.                              |

## The sync protocol

The client is `CollabSession`. The server only stores and relays: it never
looks inside an operation. The fake one is `src/server/fakeServer.ts`.

```text
client                                   server
  | -- hello { site, vector } ----------> |   "This is what I have from the others."
  | <- sync { ack, ops } ---------------- |   "I have yours up to `ack`. Here is what you miss."
  | -- ops [ outbox after `ack` ] ------> |   The client sends what the server does not have.
  | <- ack { seq } ---------------------- |
  |                                       |
  | -- ops [ new ] ---------------------> |   While the line is open.
  | <- ack { seq } ---------------------- |
  | <- ops [ from the others ] ---------- |
```

The contract for the code that owns the line (a WebSocket in a real app, see
Chapter 9; `fakeChannel.ts` here):

1. When the line opens, call `session.connect({ send })`. The session sends `hello` by itself.
2. Call `session.receive(message)` for every message, in the order the server sent them.
3. When the line closes, for any reason, call `session.disconnect()`. Do not try to deliver what was on its way: the next `hello` gets it again.
4. The session never opens a line by itself and has no timer for the network. Reconnecting, with a wait that grows, is the job of the owner of the line. The one thing the session does by itself is to say `hello` again on an open line when it sees a gap.

Three rules make "no double apply" true, and each has a test:

- The **server** stores an operation only when its `seq` is the next number for its site.
- The **client** applies a remote operation only when its `seq` is the next number for that site in its vector. A lower number is a repeat and is dropped. A higher number means something is missing: the client says `hello` again.
- The **CRDT** below both ignores an id it already has. So even a bug in the two rules above cannot put a character in twice.

## Why it holds at scale

| Pressure                                       | What protects us                                       | Test that proves it                                                                    |
| ---------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| A document of 100,000 characters               | The index: applying an edit does not walk the text     | `applies an edit in a text of 200,000 characters without walking over the text`        |
| The user types fast                            | Edits are joined: one operation for a word             | `sends a word that is typed quickly as one operation`                                  |
| The user pastes a page                         | One insert with a run of text                          | `sends a pasted text as one operation`                                                 |
| A long time offline, on both sides             | The outbox, then the CRDT merge                        | `merges a long offline session on both sides`                                          |
| A reconnect after a long time                  | The version vector: only what is missing is sent       | `receives exactly the operations it missed, not the whole log`                         |
| The line drops with an operation on its way    | The outbox keeps it until the server acknowledges it   | `sends again, after a reconnect, an operation that was lost on the way`                |
| The line drops with only the answer on its way | `sync` says what the server has: nothing is sent twice | `does not send again an operation that arrived when only its acknowledgement was lost` |
| An operation arrives twice                     | `seq` must be the next number                          | `applies an operation once when it arrives twice`                                      |
| An operation is missing                        | A gap in `seq` makes the client ask again              | `asks the server again when a number is missing, and applies nothing out of order`     |
| Any mix of the above                           | All of it together                                     | `400 steps: the three people end with the same text (40 seeds)`                        |
| The user edits all day                         | Undo remembers the last 100 changes                    | `remembers the last 100 changes, not more`                                             |

The convergence tests of the 45-minute answer are all here too, now also with
runs of characters and range deletes
(`every order of four runs and two range deletes gives the same text`).

What does **not** hold at scale, measured in the
[chapter README](../README.md#measured-numbers): one local key press still
costs time that grows with the text, about 6 milliseconds of our code in
100,000 characters. A textarea hands over its whole text on every key press,
and we walk the list to turn an index into an id.

## Undo

Ctrl+Z (Cmd+Z on a Mac) takes back the last change _of this user_:

- An insert is taken back by deleting those characters, by id. If another person typed in the middle of them, that text stays.
- A delete is taken back by inserting the same text again, as new characters, after the nearest character on the left of the old place that is still shown.
- The undo of the browser is switched off, because it knows nothing about remote edits and would put back a text that never existed.

Limits: there is no redo (Ctrl+Shift+Z and the browser's redo do nothing).
One key press is one step, so a word takes as many steps as it has letters. A
character that comes back is a new character with a new id, so a caret of
another person that sat on the old one does not move with it.

## Edge cases covered, on top of the 45-minute answer

- An emoji in a run has two ids, one for each UTF-16 half, as in the textarea.
- A run arrives a second time, or a part of it is already there: only the missing characters are added.
- A range delete arrives before a part of its characters: that part waits.
- Typing at two places, or going back to the start, is not joined into one run.
- A message that arrives after the line was closed is ignored.
- The answer to `hello` arrives twice: nothing is applied twice.
- An edit is made before the server answered `hello`: it is kept and sent after.
- A deleted text is put back by undo after another person typed in front of it, and after everything on its left was deleted.
- `dispose` stops the timer: nothing is sent after it.
- The `session` prop changes: the editor follows the new session and stops listening to the old one.

## Accessibility

The editor is still a plain `<textarea>` with a visible `<label>`. A status
line (`role="status"`) under it says "You are offline. Your changes are kept,
and sent when you are back." It is a settled state, not a progress message,
so a screen reader reads it once. The text comes from `messages`, so it can
be translated. Ctrl+Z works from the keyboard and has no button. Remote
changes are not announced in this folder; the production folder adds one
short line for that.

## How the styles ship

The editor needs no CSS to work. The rules under the "Collaborative editor"
heading in `src/styles.css` set the font, the focus outline and the height of
the status line, with logical properties so they mirror in right-to-left
languages. They are 316 bytes, minified and compressed with gzip. Measure
them again with:

```bash
awk '/^\/\* -+ /{on = /Collaborative editor/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Try it in the demo

1. Type a word quickly on the left. "Operations sent" grows by one, not by one for each letter.
2. Set both delays to 3000 ms, type a word at the start of each side, and wait. Both sides show the two words in the same order.
3. Tick "Go offline" on the right, type on both sides, and untick it. The right side sends what it wrote and receives only what it missed.
4. Type on the left, then on the right, then press Ctrl+Z on the left. Only the text of the left side goes away.
5. Press "Add 100,000 characters" and type at the start of the text.
