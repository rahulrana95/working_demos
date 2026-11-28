# Chapter 13: Collaborative editor, the production version

Several people type in the same document at the same time, and everybody ends
with the same text.

**This folder is not an interview answer.** It is the
[60-minute answer](../60-minutes) plus what a team builds in the first week:
the carets of other people, a second engine to compare with, removal of old
tombstones, snapshots, events for monitoring and limits. Do not try to write
it in an interview. Read it to know what "What would you do next?" can mean.
The [chapter README](../README.md) compares the three folders.

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

## What is in this folder

No file here is part of the interview. Every source file says so on its first lines.

| File                               | What it holds                                                                  | Lines of code |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------- |
| `src/collab/engine.ts`             | The interface both engines implement, the events, the options                  | 48            |
| `src/collab/CollabEditor.tsx`      | The textarea, the layer of other carets, input methods, the screen reader line | 120           |
| `src/collab/presence.ts`           | Cuts the text into the pieces of the caret layer                               | 18            |
| `src/collab/textChange.ts`         | From "new text" to "what changed" (as in the interview answers)                | 26            |
| `src/collab/hash.ts`               | A 32-bit hash of the text, to find diverged documents                          | 8             |
| `src/collab/messages.ts`           | Every text the editor shows or reads out                                       | 10            |
| `src/collab/index.ts`              | Shorter imports                                                                | 18            |
| `src/collab/crdt/types.ts`         | Edits, operations, messages, the saved document                                | 52            |
| `src/collab/crdt/rga.ts`           | The sequence CRDT, plus `collect`, `toRuns` and `load`                         | 208           |
| `src/collab/crdt/crdtEngine.ts`    | The CRDT engine: sync, outbox, undo, carets, events, saving                    | 340           |
| `src/collab/ot/types.ts`           | The messages of the OT engine                                                  | 13            |
| `src/collab/ot/transform.ts`       | The transform functions of OT                                                  | 73            |
| `src/collab/ot/otEngine.ts`        | The OT engine                                                                  | 183           |
| `src/server/crdtServer.ts`         | A fake server for the CRDT: relay, carets, which tombstones can go             | 132           |
| `src/server/otServer.ts`           | A fake server for OT: one order for all operations, and the transform          | 56            |
| `src/server/fakeChannel.ts`        | The demo's line to a server, with a delay and an off switch                    | not counted   |
| `src/App.tsx`, `src/styles.css`    | The demo page                                                                  | not counted   |
| `*.test.ts`, `*.test.tsx`          | 258 tests                                                                      | not counted   |
| `testHelpers.ts`, `testNetwork.ts` | Helpers for the tests                                                          | not counted   |

That is 1,305 lines in total, against 426 in the 60-minute answer and 225 in
the 45-minute answer.

The code is 5,563 bytes when it is minified and compressed with gzip, without
React, with both engines (45-minute answer: 1,402, 60-minute answer: 2,549).
Measure it again with:

```bash
npx esbuild src/collab/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

An app ships one engine, not two. Alone, the CRDT engine with its CRDT is
3,368 bytes and the OT engine with its transform is 1,626 bytes (the same
command with `src/collab/crdt/crdtEngine.ts` or `src/collab/ot/otEngine.ts`,
and without the two `--external` flags).

## Two engines behind one editor

`CollabEditor` takes an `engine`. It does not know which one it has. Switch
between them in the demo.

|                                            | CRDT (`CrdtEngine`)                                                           | Operational transformation (`OtEngine`)                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| What an operation says                     | "After the character with this id"                                            | "At index 5"                                                                  |
| How two edits at the same time are settled | Ids sort them, the same way at every site                                     | `transform` shifts the index of the later one                                 |
| Needs a central server                     | No. This server only stores and relays. Two sites could also talk directly.   | Yes. The server gives every operation its place in one order, and transforms. |
| Order of delivery                          | Any order, twice, late: the result is the same                                | Entries must arrive in the order of the server, each once                     |
| Extra data for each character              | An id, two links and a `Map` entry: 173 bytes against 2 for the letter itself | None. The document is a string.                                               |
| Deleted text                               | Stays as tombstones until every site is known to have seen the delete         | Is gone at once                                                               |
| Offline for a long time                    | Edits are kept as they are and merge on arrival                               | Edits are kept, and every one is transformed against all that was missed      |
| Where the hard part is                     | In the data structure: `integrate` (20 lines), and tombstone removal          | In `transform` (four cases, one of them splits an operation) and the protocol |
| What must be proven                        | Any order of delivery gives the same list                                     | Both orders of two operations give the same text, for every pair              |
| Lines here (engine, core, server)          | 340 + 208 + 132                                                               | 183 + 73 + 56                                                                 |
| In this folder it also has                 | Carets of other people, undo, snapshots, the hash check                       | None of these                                                                 |

The OT engine is the smallest one that is correct for plain text with one
server: one submit on its way at a time, a buffer behind it, and a server
that transforms a submit against the entries its site had not seen. Two
inserts at the same place are settled by the site name, so two words typed at
the same time do not mix.

When each one wins. With a server you already trust and need anyway, and a
document that must stay small, OT is less data and less code. When people
work offline for long, when there may be no server between them, or when the
same data must merge on a phone and in a browser, a CRDT is the simpler
promise: any order, any delay, the same result.

## How to use the new parts

### The engine interface

```ts
const engine = new CrdtEngine({ site: crypto.randomUUID(), name: "Asha", onEvent });
// When the WebSocket opens:
engine.connect({ send: (message) => socket.send(JSON.stringify(message)) });
// For every message, in order:
engine.receive(JSON.parse(event.data));
// When it closes, for any reason:
engine.disconnect();
// When the editor is closed:
engine.dispose();
```

The contract for the owner of the line is the one of the 60-minute answer:
messages in order while the line is open, `disconnect` when it closes, and
never deliver a message of a closed line. The engine never opens a line and
never retries. `site` must be different in every tab: two tabs with the same
site would give two characters the same id.

### Carets of other people

The engine sends its caret as two ids, at most once in `presenceMs` (100 ms).
`engine.peers()` gives the carets of the others as places in the local text.
The editor draws them in a layer behind the textarea that holds the same text
in the same font: a line for a caret, a name label, and a mark for a
selection. The layer is `aria-hidden`; the same names are in a list under the
editor that everybody can read.

### Removing tombstones

A CRDT keeps every deleted character. In a document that is edited for a
year, most of the list is tombstones. The server (`collectIfSafe` in
`crdtServer.ts`) tells the sites which ones can go, and the rule is stricter
than it first seems.

"Every site has seen the delete" is **not** enough. A site that had not seen
the delete yet may have typed right after the doomed character. Where a later
insert lands depends on the tombstone and on what hangs under it. Remove the
tombstone too early at one site, and that site sorts differently from the
others. The test
`stays right when a site typed after the doomed character before it saw the delete`
builds this case, and with the simple rule it fails with two different texts.

The rule here has two steps:

1. Every known site has said that it has seen the delete. The server notes the top of its log at this moment. A site sends its own waiting edits before it says what it has seen, so everything that was typed next to the doomed character is in the log by now.
2. Every known site has said that it has seen everything up to that noted top. Now no site can make an edit that needs the tombstone.

Three more things keep it safe:

- An engine never makes an edit that comes after a tombstone. Typing always names a shown character, and undo puts text back after the nearest shown character (`never makes an edit that comes after a tombstone`).
- What a site says in `hello` does not count, because it may still hold edits it has not sent.
- A site that is away holds everything up. That is on purpose.

This rule is argued in the comments and tested with 3,000 random orders of
the dangerous case and with random sessions that are compared with a reader
that never removes anything. It is not proven formally.

### Snapshots

`engine.save()` returns a `SavedDocument`: the list as runs
(`["asha", 1, "hello"]` is five characters; `["asha", 6, 3]` is three
tombstones, without their letters), the version vector, the clock and the
outbox. `new CrdtEngine(options, saved)` opens it. On `connect` the engine
asks only for the operations after the snapshot. The measured sizes are in
the [chapter README](../README.md#measured-numbers).

The clock is saved on purpose. If the newest character was deleted and its
tombstone removed, the highest counter left in the list is lower than a
counter that was used before, and a new character would get an old id.

### Events

`onEvent` gets counts and times, never text, names or ids:

| Event                  | Fields                           | When                                                      |
| ---------------------- | -------------------------------- | --------------------------------------------------------- |
| `op_sent`              | `ops`, `characters`              | Operations went on the line                               |
| `op_received`          | `ops`, `characters`              | Remote operations were applied                            |
| `sync_started`         |                                  | `hello` was sent                                          |
| `sync_finished`        | `durationMs`, `sent`, `received` | The answer to `hello` was applied                         |
| `divergence_detected`  |                                  | Another site has the same operations and another text     |
| `edit_rejected`        | `reason` (`"too_long"`)          | A local edit would pass `maxLength`                       |
| `tombstones_collected` | `count`                          | The server released tombstones and they were removed here |

`divergence_detected` should never fire. If it does, there is a bug in the
CRDT or in the server, and the document of that site must be loaded again.
This folder only reports it.

## Why it holds at scale

| Pressure                                         | What protects us                                           | Test that proves it                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A year of deletes                                | Tombstones are removed when it is safe                     | `removes a tombstone when every site has seen the delete and all that was typed before`             |
| A site typed next to a deleted character         | The two-step rule                                          | `stays right in the dangerous case for 3,000 random orders of the edits, messages and timers`       |
| A site is away for a week                        | Nothing is removed until it has caught up                  | `keeps every tombstone while one site is away`                                                      |
| Opening an old document                          | A snapshot, then only the operations after it              | `asks only for the operations after the snapshot when it connects`                                  |
| A snapshot after tombstones were removed         | The clock is saved, so no id is used twice                 | `never uses an id twice after loading, also when the newest character was deleted and removed`      |
| Carets that move all the time                    | One caret message in 100 ms                                | `sends one caret message for many fast moves, with the last place`                                  |
| A paste of 5 MB                                  | `maxLength` (200,000) refuses it                           | `refuses a local edit that makes the text longer than the limit, and says so`                       |
| A bug that makes two texts differ                | A hash is compared when two sites have the same operations | `reports a divergence when a bug made one text different`                                           |
| Many people type while a screen reader is on     | One line, at most once in ten seconds                      | `says once that another person changed the text, not once for each change`                          |
| A bad network, with everything above switched on | All of it together                                         | `400 steps: the three people end with the same text, with tombstones removed on the way (40 seeds)` |
| OT: any two operations at the same time          | `transform`, checked for every pair                        | `both orders give the same text, for all 27 x 27 pairs on 'abcde'`                                  |
| OT: a bad network                                | One submit on its way, the server orders the rest          | `300 steps: three sites end with the text of the server history (60 seeds)`                         |

## Safety

- **Text is untrusted and is only ever text.** The document and the names of people go to React as strings, into a textarea value and text nodes. Nothing is set as HTML (`shows text that looks like HTML as text`, `shows a name that looks like HTML as text`).
- **Events hold no text.** `never puts text of the document, a name or a site in an event` types a secret, pastes it, deletes it, undoes it and goes offline with it, then checks that every value in every event is a number or one of a few fixed words.
- **A size limit.** A local edit that would make the text longer than `maxLength` is refused and the textarea goes back to the old text.
- **The server does not believe a site about who it is.** An operation or a caret that names another site is dropped or renamed (`does not let a site send a caret in the name of another site`).
- The hash is FNV-1a, 32 bits. It finds bugs. It does not stop an attacker.

## Edge cases covered, on top of the 60-minute answer

- A caret or an undo step points at a tombstone that is removed: it moves to the nearest shown character on its left, so the caret stays in place and the undo still works.
- A person leaves: their caret goes. We go offline: all carets go.
- A person arrives later: they get the carets that are there.
- Two selections of other people overlap.
- A remote change arrives while the user builds a character with an input method: it waits, and is applied when the character is done. If the line closes meanwhile, what waited is dropped and comes again from the server.
- The editor is removed in the middle of a character: remote changes are let in again.
- A saved document holds edits that still wait for a character, and operations the server has not acknowledged: both survive.
- A saved document of another site is refused.
- Two people together pass the size limit: allowed. Deleting in a text that is over the limit: allowed.
- Two sites have different operations: their hashes are not compared.
- OT: an insert in the middle of a range that another person deletes is kept, and the delete splits in two.
- OT: a submit is lost with the line, or only its answer is lost: it ends in the history once.

## Accessibility

The editor is a plain `<textarea>` with a visible `<label>`, so the keyboard,
screen readers and input methods work as in any form.

- The layer with the other carets is `aria-hidden`. The same information is in a list ("Also here: Ravi") that screen readers can reach.
- Remote changes would flood a screen reader if each one was announced. A hidden status line says "Another person changed the text." at most once in `announceMs` (ten seconds), and is emptied after two seconds so the same sentence can be said again later. It does not say what changed: the user reads the text for that.
- "You are offline. Your changes are kept, and sent when you are back." is a second status line, read once.
- A caret of another person is a real border with a name in text, and a selection has a line under it, so neither depends on colour. In high-contrast mode (forced colours) they use the system colours.
- All texts come from `messages` and can be translated. The styles use logical properties, so they mirror in right-to-left languages.
- Text in the editor is 16px or more.

## How the styles ship

Unlike the interview answers, this editor needs its CSS: the layer of the
other carets only lines up when the layer and the textarea have the same box,
font and line breaks. The rules are the part of `src/styles.css` under the
"Collaborative editor" heading, plus `.visually-hidden`. In a real package
they ship as one CSS file next to the JavaScript. They are 737 bytes,
minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Collaborative editor/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

The colours (`--color-…`) are CSS variables, so a host app can theme the
editor without changing its rules.

## What a real product adds, and why most teams adopt a library

This folder is plain text for a handful of people. A product needs more, and
each item below is weeks of work with its own ways to lose a user's text:

- **Rich text.** Bold, headings and links are ranges over characters that move, split and merge while other people edit. A format that two people change at once needs its own rule.
- **Comments** that stay on their text when the text moves or is deleted.
- **Permissions**: who may read, who may write, and a server that checks every operation, not a client that promises.
- **History**: versions with names, who wrote what, and going back to an older version without losing what came after.
- **A server that persists**: operations in a database, snapshots made by the server, old operations removed.
- **A real editor surface.** A textarea hands over its whole text on every key press. Products use an editor that reports changes as changes.

So most teams do not write the merge code themselves. They adopt a library
that has been tested by many users for years, such as Yjs or Automerge for
CRDTs, and spend their time on the product around it. Writing the small
version in this chapter is still worth it: you cannot choose a library, or
find out why two users see different text, without knowing what an id, a
tombstone and a version vector are for.

## Known limits, described in the book but not built here

- Rich text, comments, permissions and history: see the section above.
- There is no WebSocket and no reconnect with a growing wait. The owner of the line does that (Chapter 9).
- The server keeps the whole log in memory and never makes a snapshot. A site that arrives later replays every operation, and keeps tombstones that were released before it came.
- A site that never comes back stops all tombstone removal. A real system forgets a site after some weeks and makes it load a new snapshot when it returns.
- A site that goes back to an **older** saved copy is not safe after tombstones were removed: it may type after a character the others have already removed. A real system only says "I have seen this" for what is saved for good, or gives a restored copy a new start from the server.
- A site that was offline when tombstones were released keeps those tombstones. That is safe, and it costs memory.
- When a divergence is found, an event is sent and nothing else. The document is not loaded again.
- The size limit is checked for local edits only. The server does not check it, so two people can pass it together, and a changed client can ignore it.
- The server does not check that an operation is well formed, for example that a new character has a higher counter than the character it comes after.
- A key press costs time that grows with the text (about 6 ms of our code in 100,000 characters), because of the textarea. There is no index by position.
- The elements are UTF-16 units, as in a textarea. Two people who edit inside the same emoji or the same combined Hindi character at the same time can leave a broken character.
- While a character is being built with an input method, the others see its half-built forms, because every input event is sent.
- Undo has no redo, and one key press is one step.
- Known to RGA: when two people type back to front at the same place at the same time, their texts can mix. There is a test that shows it.
- The name label of a caret covers part of the line above it. A caret whose character has not arrived yet is drawn at the start of the text until it arrives.
- The line for screen readers does not say who changed the text or where. Changes in the ten seconds after an announcement are not announced later.
- Every site sends what it has seen to the server, which passes it to all others. With many sites that is a lot of small messages.
- The OT engine has no carets of other people, no undo, no snapshots and no hash check. Its buffer of offline edits is never joined into fewer operations, and the history of the server is never trimmed.
- Events count characters, not bytes on the wire.
- Nothing is encrypted, and there is no login.

## Try it in the demo

1. Type on the left. On the right, the name "Asha" follows the caret of the left side.
2. Select a word on one side. The other side shows it marked.
3. Type a word and delete it. The "tombstones" number goes up, and after about a second down to 0: both sides have told the server that they have seen everything.
4. Tick "Go offline" on the right and delete a word on the left. The tombstones stay until the right side is back.
5. Press "Measure a snapshot". Read the "Last events" list: numbers only.
6. Switch the engine to "Operational transformation" and repeat step 2 of the 60-minute demo: set both delays to 3000 ms and type a word at the start of each side.
