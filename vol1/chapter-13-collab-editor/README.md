# Chapter 13: Collaborative document editor

Several people type in the same document at the same time, and everybody ends
with the same text.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                                 |
| -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | A sequence CRDT written by hand, with tests that try every order of delivery, bound to a textarea. Two editors, one page.  |
| [`60-minutes`](60-minutes) | Staff                   | The same CRDT with an index, plus the sync protocol: version vectors, acknowledgements, an outbox for offline, and undo.   |
| [`production`](production) | Not an interview answer | The staff answer, plus carets of other people, a second engine (OT), tombstone removal, snapshots, events and size limits. |

Start with `45-minutes`. Plain text only: rich text is discussed in the book
and not built here.

## The three folders in numbers

Lines of code are counted without tests, blank lines and comments. For the two
interview answers they are the files you write in the interview, so without
`index.ts` (6 and 10 lines). For `production` they are all files in
`src/collab` and `src/server` except the tests and the test helpers. The size
is `src/collab/index.ts` with everything it imports, without React, minified
and compressed with gzip. Each folder's README has the command that measures it.

| Folder       | Tests | Lines of code | Limit of the book | JavaScript (min + gzip) |
| ------------ | ----- | ------------- | ----------------- | ----------------------- |
| `45-minutes` | 70    | 225           | 320               | 1,402 bytes             |
| `60-minutes` | 123   | 426           | 430               | 2,549 bytes             |
| `production` | 258   | 1,305         | none              | 5,563 bytes             |

## Which feature lives in which folder

The book promises that the interview code can be typed in the stated time, so
the two limits are hard. The design for this chapter asked for more than fits
in 60 minutes. One feature moved down a level, and this table is the record.

| Feature                                                                 | 45-minutes | 60-minutes | production |
| ----------------------------------------------------------------------- | ---------- | ---------- | ---------- |
| Sequence CRDT: ids, insert after an id, tombstones, waiting operations  | Yes        | Yes        | Yes        |
| Tests of every delivery order, and seeded random runs                   | Yes        | Yes        | Yes        |
| Textarea binding: diff around the caret, caret kept as an id            | Yes        | Yes        | Yes        |
| Demo with two editors, a delay and an offline switch for each side      | Yes        | Yes        | Yes        |
| Index (find a character by id in O(1)), a run of characters in one edit | No         | Yes        | Yes        |
| Sync protocol: version vector, acknowledgements, no double apply        | No         | Yes        | Yes        |
| Offline outbox, and "send me what I miss" after a reconnect             | No         | Yes        | Yes        |
| Undo of your own edits only (Ctrl+Z)                                    | No         | Yes        | Yes        |
| Carets and selections of other people, with a name label (**moved**)    | No         | No         | Yes        |
| A second engine behind the same editor: operational transformation      | No         | No         | Yes        |
| Removal of old tombstones, with a rule that is safe                     | No         | No         | Yes        |
| Snapshots: save and load a document without its old operations          | No         | No         | Yes        |
| Events for monitoring, a size limit, a check for diverged texts         | No         | No         | Yes        |
| Input methods (Hindi, Japanese): remote changes wait for the character  | No         | No         | Yes        |
| One line for screen readers when other people change the text           | No         | No         | Yes        |

**Moved:** the design put "presence" (the carets of other people) in the
60-minute answer. With the sync protocol, the index, batching and undo, the
60-minute files were 515 lines, 85 over the limit. Presence is the part that
teaches least about convergence, so it moved to `production`. The 60-minute
answer still keeps its _own_ caret as ids, which is the idea presence is
built on.

## What the extra 15 minutes buys

The 45-minute answer proves the hard part: two people type at the same place
and end with the same text. But it runs in one page, it sends one operation
for each key press, and finding a character is a walk over the whole text.

| Addition                                             | Why it matters                                                                                             | Minutes |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| An index and a linked list                           | Applying an operation costs the same in a text of 100 and of 100,000 characters.                           | 4       |
| A run of characters in one edit, joined while typing | A typed word or a pasted page is one operation on the network, not one for each character.                 | 3       |
| `seq`, a version vector and acknowledgements         | After a reconnect, each side gets exactly what it missed. An operation that is sent twice is applied once. | 4       |
| An outbox                                            | Edits made in a train tunnel are kept, and sent when the line is back.                                     | 2       |
| Undo of your own edits                               | Ctrl+Z never takes back the work of another person.                                                        | 2       |

## What the first week adds

The `production` folder is what a team builds after the interview. Do not try
to write it in an interview. Know that it exists, and name one or two of
these when the interviewer asks, "What would you do next?"

| Addition                  | Why it matters                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Carets of other people    | You see where the others are, and their carets stay on the same characters when the text moves.            |
| A second engine: OT       | The same editor runs on operational transformation, so the two approaches can be compared in running code. |
| Tombstone removal         | A document that is edited for a year does not keep every deleted character for ever.                       |
| Snapshots                 | Opening a document does not replay every key press since it was made.                                      |
| Events (`onEvent`)        | The team can see sync times, operation counts and diverged texts. No event holds text from the document.   |
| A hash check              | Two sites with the same operations must have the same text. If a bug breaks that, an event says so.        |
| A size limit              | A paste of 5 MB is refused before it becomes an operation.                                                 |
| Input methods             | A remote change does not break a Hindi or Japanese character that is being built.                          |
| A line for screen readers | "Another person changed the text." At most once in ten seconds, not once for each key press.               |

The [production README](production/README.md) names the test that proves each one.

## Measured numbers

`scripts/measure.mjs` measures the three folders in Node.js, without a
browser. Run `npm install` in `45-minutes` first, because the script borrows
its `esbuild`. Then, in this folder:

```bash
node --expose-gc scripts/measure.mjs
```

It takes about 90 seconds, most of it in the 45-minute answer with 100,000
characters. This is the output on our machine (times in microseconds: 1,000 us
is 1 ms):

```text
1. Apply one remote insert at a random place
  45-minutes     1000 characters: mean 9.8 us, p50 9.4 us, p95 13.0 us
  45-minutes    10000 characters: mean 20.7 us, p50 20.1 us, p95 26.5 us
  45-minutes   100000 characters: mean 578.0 us, p50 576.8 us, p95 695.3 us
  60-minutes     1000 characters: mean 2.9 us, p50 2.3 us, p95 3.4 us
  60-minutes    10000 characters: mean 3.4 us, p50 2.8 us, p95 4.1 us
  60-minutes   100000 characters: mean 4.4 us, p50 3.7 us, p95 6.2 us
  production     1000 characters: mean 3.8 us, p50 2.8 us, p95 4.6 us
  production    10000 characters: mean 4.3 us, p50 3.4 us, p95 4.8 us
  production   100000 characters: mean 2.2 us, p50 1.9 us, p95 3.0 us

2. One key press in the middle of the text (our code only, no React, no browser)
  45-minutes     1000 characters: mean 82.3 us, p50 72.4 us, p95 104.7 us
  45-minutes    10000 characters: mean 744.6 us, p50 680.4 us, p95 1149.9 us
  45-minutes   100000 characters: mean 10184.5 us, p50 10052.8 us, p95 12031.3 us
  60-minutes     1000 characters: mean 52.5 us, p50 40.2 us, p95 99.3 us
  60-minutes    10000 characters: mean 624.1 us, p50 603.2 us, p95 1132.6 us
  60-minutes   100000 characters: mean 6337.9 us, p50 6187.3 us, p95 8485.4 us
  production     1000 characters: mean 49.1 us, p50 34.6 us, p95 96.9 us
  production    10000 characters: mean 422.7 us, p50 392.3 us, p95 773.9 us
  production   100000 characters: mean 5950.9 us, p50 5469.9 us, p95 8644.6 us

3. Memory (a document of 20,000 characters)
  45-minutes  97 bytes for each character; with every second character deleted: 97 bytes for each character ever typed, which is 194 for each one still shown
  60-minutes  173 bytes for each character; with every second character deleted: 174 bytes for each character ever typed, which is 348 for each one still shown
  production  173 bytes for each character; with every second character deleted: 174 bytes for each character ever typed, which is 347 for each one still shown
  production  after the tombstones are removed: 219 bytes for each character still shown
  production  snapshot as JSON: 20012 bytes for 20000 characters typed in one run; 288895 bytes when every second character is a tombstone; 154446 bytes for the 10000 characters left when those tombstones are removed
```

What the numbers say:

- **Applying an operation.** In the 45-minute answer the time grows with the text: about 0.6 ms in 100,000 characters, because it walks the array to find an id. With the index of the 60-minute answer it stays at a few microseconds.
- **A key press is not O(1) in any folder.** A textarea gives us its whole text on every key press. We compare it with the old text, walk the list to turn an index into an id, and build the new text. That is about 6 ms of our own code in 100,000 characters in the 60-minute answer, and about 10 ms in the 45-minute answer. The index makes remote operations cheap, not local key presses. A real editor does not use a textarea for this reason.
- **Memory.** A deleted character costs as much as one that is shown, so a text where half was deleted costs twice as much for each character you can see. The index costs memory too: 173 bytes for each character against 97.
- **Removing tombstones** brings 347 bytes for each shown character down to 219. It does not reach 173, because a JavaScript `Map` does not give back all its room when entries are deleted.
- **A snapshot** of text typed in one run is almost only the text: 20,012 bytes for 20,000 characters. Every second character deleted is the worst case, because every run is one character long.

What they do not say: these are lab numbers from one desktop computer and one
version of Node.js. Your numbers will differ, and from one run to the next
they move by 20 to 30 percent.

## Measure typing in a real browser

`scripts/measure-typing.mjs` types in the demo with a real Chromium, in an
empty document and in one of 100,000 characters, on a normal CPU and on one
made 4 times slower. It needs [Playwright](https://playwright.dev) installed,
with its Chromium browser, and the demo of `60-minutes` or `production`.

In one terminal, build a folder and serve it:

```bash
cd 60-minutes && npm run build && npx vite preview
```

In a second terminal, in this folder:

```bash
node scripts/measure-typing.mjs
```

The script opens `http://localhost:4173`. If the preview prints another
address, pass it: `node scripts/measure-typing.mjs http://localhost:4174`.

This is the 60-minute answer on our machine:

```text
     26 characters, cpu x1: 26 key presses; events >=16ms: 28; handler ms p50 0.6 p95 1.9 max 2.6; duration ms max 24
     26 characters, cpu x4: 26 key presses; events >=16ms: 54; handler ms p50 2.3 p95 10.9 max 17.2; duration ms max 24
 100026 characters, cpu x1: 26 key presses; events >=16ms: 74; handler ms p50 5.4 p95 9.7 max 13.7; duration ms max 24
 100026 characters, cpu x4: 26 key presses; events >=16ms: 80; handler ms p50 22.2 p95 43.3 max 51.5; duration ms max 104
```

And the production folder, which also draws the layer of the other carets:

```text
     26 characters, cpu x1: 26 key presses; events >=16ms: 17; handler ms p50 0.6 p95 2.2 max 2.2; duration ms max 16
     26 characters, cpu x4: 26 key presses; events >=16ms: 45; handler ms p50 2.9 p95 9.1 max 12.6; duration ms max 24
 100026 characters, cpu x1: 26 key presses; events >=16ms: 80; handler ms p50 5.7 p95 20.0 max 20.9; duration ms max 48
 100026 characters, cpu x4: 26 key presses; events >=16ms: 79; handler ms p50 25.7 p95 87.1 max 99.7; duration ms max 168
```

What the numbers mean:

- "handler ms" is the time our own code and React ran for one event.
- "duration ms" is the time from the key press to the next paint, as the browser reports it, rounded to 8 ms.
- "events >=16ms" is how many key and input events the browser reported at all. One key press gives up to three events.

What they do not mean:

- They are lab numbers from one desktop computer, with a fake server in the same page. They are not numbers from real users on real phones. For those, collect INP in the field.
- The Event Timing API only reports events that took 16 ms or longer. A faster event is not in the list, so the p50 and p95 are of the slow events only.
- In 100,000 characters on a slow CPU, a key press takes 100 ms or more to paint. That is over the 100 ms most teams aim for. A textarea is the wrong tool for a document of that size.
