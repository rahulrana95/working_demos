# Chapter 13: Collaborative editor, the 45-minute answer

Several people type in the same document at the same time, and everybody ends
with the same text.

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
| `src/collab/types.ts`         | Yes               | 2 minutes  | 19            |
| `src/collab/rga.ts`           | Yes               | 20 minutes | 86            |
| `src/collab/textChange.ts`    | Yes               | 8 minutes  | 42            |
| `src/collab/CollabEditor.tsx` | Yes               | 12 minutes | 78            |
| `*.test.ts`, `*.test.tsx`     | No                |            |               |
| `src/collab/testHelpers.ts`   | No                |            |               |
| `src/App.tsx`, `src/network/` | No                |            |               |
| `src/styles.css`              | No                |            |               |

Lines of code are counted without blank lines and comments: 225 in total. The
limit of the book for this folder is 320. The folder has 70 tests.

The code is 1,402 bytes when it is minified and compressed with gzip, without
React. Measure it again with:

```bash
npx esbuild src/collab/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 42 minutes of typing for someone who has practised it. The other
3 minutes go to walking the interviewer through `integrate` with two people
who type at the same place.

## The algorithm, and where it comes from

`rga.ts` is a sequence CRDT in the style of RGA (Replicated Growable Array):

- Every character has an id `{ site, counter }` that is never used twice.
- An insert names the character on its left (`after`), not an index.
- A delete only sets a flag. The character stays in the list as a tombstone, so an insert that names it still finds its place.
- Two characters typed after the same character are sorted by id: the higher counter goes first, and for equal counters the higher site name.
- The counter is a Lamport clock: a new character gets one more than the highest counter this site has seen in any id. So a new character always has a higher id than the character it comes after. The walk in `integrate` relies on that.

We followed the description of RGA as a tree in Kleppmann, Gomes, Mulligan and
Beresford, "Interleaving anomalies in collaborative text editors" (PaPoC
2019), section 3: an insert is anchored to the character on its left, the
characters anchored to the same character are sorted in descending timestamp
order, and the document is that tree read depth first. That paper credits Roh and others
(2011) for RGA and Attiya and others (2016) for the tree form. The tests hold
a second, slow implementation of exactly that tree (`expectedText` in
`testHelpers.ts`) and compare the real list with it.

Where this code differs from that description:

1. **No causal delivery is needed.** The papers assume that an operation arrives after the operations it depends on. Here an operation that arrives too early waits in a map until the character it names arrives. The fake network can deliver in any order.
2. **Duplicates are allowed.** An insert whose id is already in the list is ignored. The papers assume each operation is delivered once.
3. **The timestamp is `(counter, site)`**, a Lamport timestamp, as in later presentations of RGA. The original paper uses a larger structure (an "S4Vector").
4. **A flat array, not a tree.** The list is kept in document order, and an insert walks right from its left neighbour over every higher id. This gives the same order as the tree. The proof is short and it is the comment in `integrate`; the test is the comparison with `expectedText`.

What RGA promises, and what it does not. Two words typed forwards at the same
place at the same time do not mix letter by letter
(`do not mix two words letter by letter`). Which word comes first is decided
by the ids, not by any wish of the users. And there is a known limit, which
the paper above calls the lesser interleaving anomaly: when a person types
back to front, or goes back to the same place and types again, the text of
another person can land in between
(`can mix two texts that were both typed back to front (a known limit of RGA)`).
Both editors still end with the same text.

## Why every editor ends with the same text

| Pressure                                    | What protects us                                          | Test that proves it                                                                                      |
| ------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Two people type at the same place           | Inserts are placed by ids, sorted the same way everywhere | `end with the same text, whichever operation arrives first`                                              |
| Operations arrive in any order              | Position depends only on ids, never on arrival            | `three sites type at the start at the same time: every order gives the same text` (and three more cases) |
| The network sends an operation twice        | An id that is already there is ignored                    | `the same holds when every operation is delivered twice, in every order of 3 + 3`                        |
| A delete arrives before its insert          | The delete waits for the character                        | `holds a delete that arrives before its insert, and applies it when the insert arrives`                  |
| An insert arrives before its left neighbour | The insert waits for the character                        | `holds an insert that arrives before the character on its left`                                          |
| Someone deletes the character I type after  | The tombstone stays in the list                           | `keeps a character typed after a character that another site deleted at the same time`                   |
| Long random sessions                        | All of the above together                                 | `200 operations: the three sites end with the same text (50 seeds)`                                      |
| A remote edit lands before my caret         | The caret is an id, not a number                          | `keeps the caret after the same character when another site types before it`                             |

The four "every order" tests each build six or seven operations at three
sites and replay all 720 or 5,040 orders into a new document. Every order must
give the text that the slow tree gives. The random tests use a generator with
a seed, so a failing run can be repeated with the same seed.

## Why it holds at scale

It does not, and the file says so. Finding a character by its id is a walk
over the array, so applying one operation takes time that grows with the
text. The [chapter README](../README.md#measured-numbers) has the numbers:
about 10 microseconds in 1,000 characters, about 0.6 milliseconds in 100,000.
One key press costs about 10 milliseconds of our code in 100,000 characters.
Up to about 10,000 characters you will not notice. The 60-minute answer adds
the index.

## Edge cases covered

- The same letter many times ("aaa"): the caret tells us which one was typed or deleted.
- A selection replaced by typing: deletes for the old characters, then inserts.
- A paste: one operation for each character, each after the one before it.
- An event that changed nothing: no operation is sent.
- An emoji is two characters next to each other (its two UTF-16 halves), as in the textarea.
- A character is deleted by two people at once: it is deleted once.
- 5,000 operations arrive in reverse order: no stack overflow.
- The caret sits after a character that another person deletes: it stays at that place.
- Two remote changes arrive before React draws: the caret is still right.
- A remote operation that changes no text (a duplicate) does not bring back an old caret.
- The component is removed: it stops listening. React strict mode: it listens once.
- The `doc` or the `transport` prop changes: the editor follows the new one.

## What it does not do

These are in the 60-minute answer or the production folder, not here:

- It sends one operation for each character. A paste of a page is thousands of operations.
- There is no server and no reconnect logic. The fake network holds messages for a side that is offline. A real network loses them.
- There is no undo of your own edits. Ctrl+Z is the undo of the browser, which is wrong after a remote change.
- Tombstones are kept for ever.
- You cannot see the caret of the other person.
- A remote change that arrives while you build a character with an input method (Hindi, Japanese, Chinese) can break that character.
- Two sites must not use the same site name. Nothing checks it.

## Accessibility

The editor is a plain `<textarea>` with a visible `<label>`, so it works with
the keyboard, with a screen reader and with every input method the browser
has. Its text is 16px or more, so Safari on iPhone does not zoom. Every
control of the demo page can be reached and used with the keyboard: Tab moves
between the editors, the sliders and the tick boxes; the arrow keys move a
slider; Space ticks a box. Remote changes are not announced to screen
readers in this folder; the production folder adds one short line for that.

## How the styles ship

The editor needs no CSS to work. The two rules under the "Collaborative
editor" heading in `src/styles.css` set the font and the focus outline. They
are 287 bytes, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Collaborative editor/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Try it in the demo

1. Type `hello` on the left. It appears on the right.
2. Set both delays to 3000 ms. Click at the start of each editor, then type a word on each side. For three seconds the texts differ. Then both show the two words in the same order.
3. Tick "Go offline" on the right. Type on both sides. Untick it: both sides show the same text.
4. Put the caret in the middle of a word on the right. Type at the start on the left. The caret on the right stays in the same word.
