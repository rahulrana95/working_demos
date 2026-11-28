# Chapter 12: Whiteboard with undo and redo

People draw shapes on a board, move them around, and can undo and redo.

This chapter has three folders. Two are interview answers to the same
question. The third is not an interview answer: it shows what a team adds
after the interview. Each folder is a separate project, so you can run them
side by side and compare the code.

| Folder                     | Level                   | What it is                                                                                                     |
| -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior                  | Undo and redo with commands, one command per drag, rectangles on a canvas, selection and move, keyboard.       |
| [`60-minutes`](60-minutes) | Staff                   | The same code, plus pan and zoom, a grid so that 10,000 shapes stay fast, and texts that can be translated.    |
| [`production`](production) | Not an interview answer | The staff answer, plus several users, freehand lines, the list for screen readers, and what a first week adds. |

Start with `45-minutes`. Then compare two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

```bash
git diff --no-index 60-minutes/src production/src
```

## The three folders in numbers

Lines of code are the lines in `src/whiteboard`, without tests, blank lines and
comments. The size is the whiteboard code without React, minified and compressed
with gzip. Each folder's README has the command that measures it. For the two
interview answers the lines are the files you write in the interview, so
without `index.ts` (12 and 25 lines). For `production` they are all eighteen files.

| Folder       | Tests | Lines of code | JavaScript (min + gzip) | Styles (min + gzip) |
| ------------ | ----- | ------------- | ----------------------- | ------------------- |
| `45-minutes` | 118   | 317           | 2,478 bytes             | 431 bytes           |
| `60-minutes` | 167   | 426           | 3,230 bytes             | 436 bytes           |
| `production` | 263   | 1,388         | 8,301 bytes             | 508 bytes           |

## Which feature lives in which folder

The question is larger than 45 minutes, and the list for a staff answer is
larger than 15 more. So each answer keeps what matters most at its level, and
the rest moves down.

| Feature                                                                 | 45  | 60  | production |
| ----------------------------------------------------------------------- | --- | --- | ---------- |
| Commands with inverses: add, remove, move                               | Yes | Yes | Yes        |
| Undo stack and redo stack, limit of 100                                 | Yes | Yes | Yes        |
| One command per drag                                                    | Yes | Yes | Yes        |
| Canvas, device pixel ratio, one redraw per frame                        | Yes | Yes | Yes        |
| Pointer events with capture: mouse, touch and pen in one code path      | Yes | Yes | Yes        |
| Select and Rectangle tools, hit test, move by dragging                  | Yes | Yes | Yes        |
| Keys: undo, redo, Delete, arrows, Escape, Enter to add                  | Yes | Yes | Yes        |
| Toolbar with `aria-pressed` and `aria-disabled`, status line            | Yes | Yes | Yes        |
| Pan (wheel, trackpad, arrows) and zoom around the pointer               |     | Yes | Yes        |
| Grid as a spatial index: draw only what is in view, faster hit test     |     | Yes | Yes        |
| `messages`, logical CSS properties                                      |     | Yes | Yes        |
| Freehand lines, with fewer points                                       |     |     | Yes        |
| Resize and restyle commands, colours                                    |     |     | Yes        |
| The list of shapes for screen readers                                   |     |     | Yes        |
| Quick key presses joined into one undo step                             |     |     | Yes        |
| History limit by size                                                   |     |     | Yes        |
| Pan tool, zoom keys, a canvas that follows its box                      |     |     | Yes        |
| Autosave, save as a picture                                             |     |     | Yes        |
| Several users: own undo, server order, presence, reconnect              |     |     | Yes        |
| Events, error boundary, limit on the number of shapes                   |     |     | Yes        |
| Ellipse, line and text shapes                                           |     |     |            |
| Selection of several shapes, grouped commands, resize handles, snapping |     |     |            |
| Pan with the space key, pinch with two fingers on a touch screen        |     |     |            |
| Cached layer in an offscreen canvas during a drag                       |     |     |            |

The [production README](production/README.md) has the complete list of what is
not built.

## What the extra 15 minutes buys

The 45-minute answer is correct for a board that fits on the screen. The
60-minute answer holds when the board is much larger than the screen.

| Addition                             | Why it matters                                                                                              | Minutes |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------- |
| The view (`view.ts`, `pan`, `zoom`)  | The board is larger than the canvas. Zoom keeps the position under the pointer where it is.                 | 5       |
| `toBoard` for every pointer position | Clicks and drags land on the right shape at every position and zoom level.                                  | 1       |
| The grid (`grid.ts`, `visibleIds`)   | A frame draws about a hundred shapes of 10,000. A click looks at the shapes around the pointer, not at all. | 6       |
| `messages`                           | Every text the user reads or hears can be translated.                                                       | 3       |

## What the first week adds

The `production` folder is what a team builds after the interview, in about a
week. Do not try to write it in an interview. Know that it exists, and name
one or two of these when the interviewer asks, "What would you do next?"

| Addition                              | Why it matters                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Undo of your own work only            | With several users, your undo must not take back my work.                                             |
| One order from the server (`sync.ts`) | Every board applies the same operations in the same order, so every board ends the same.              |
| Your own change at once               | The user does not wait for the server.                                                                |
| Reconnect with operation ids          | What was drawn offline is sent later, and nothing is drawn twice.                                     |
| Presence, throttled                   | Each user sees where the others are.                                                                  |
| Freehand lines with fewer points      | A long line holds tens of points, not thousands.                                                      |
| The shape list inside the canvas      | A screen reader user can find, select, move and remove shapes.                                        |
| Quick key presses as one undo step    | Ten presses of an arrow key are one undo.                                                             |
| History limit by size                 | One large line does not use the memory of a thousand moves without a limit.                           |
| Autosave that never throws            | A closed tab does not lose the drawing, and a full storage does not break the board.                  |
| Events (`onEvent`)                    | The team can measure use, failures and drawing time. No event holds what the user drew.               |
| Error boundary and a limit on shapes  | A failure stays inside the whiteboard, and a scene that is too large is refused with a clear message. |

## Measure the frame rate in a real browser

`scripts/measure-frames.mjs` drags one shape in the demo with a real Chromium,
and pans where the demo can pan, on boards of 1,000 and 10,000 shapes, on a
normal CPU and on a CPU made 6 times slower. It needs
[Playwright](https://playwright.dev) installed, with its Chromium browser.

In one terminal, build a folder and serve it:

```bash
cd 45-minutes && npm run build && npx vite preview
```

In a second terminal, in this folder:

```bash
node scripts/measure-frames.mjs
```

The script opens `http://localhost:4173`. If the preview prints another
address, pass it: `node scripts/measure-frames.mjs http://localhost:4174`. A
third argument gives other board sizes: `node scripts/measure-frames.mjs http://localhost:4173 100000`.

These are the numbers on our machine, in headless Chromium, which draws 60
frames a second at most. "Work" is the time the main thread of the page was
busy for one frame: events, React and the drawing calls.

| Board and action                                   | 45-minutes                | 60-minutes                | production                |
| -------------------------------------------------- | ------------------------- | ------------------------- | ------------------------- |
| 1,000 shapes, drag one shape                       | 60.0 frames, 3.2 ms work  | 60.0 frames, 2.0 ms work  | 60.0 frames, 1.3 ms work  |
| 1,000 shapes, pan                                  | cannot pan                | 60.0 frames, 1.0 ms work  | 60.0 frames, 1.4 ms work  |
| 10,000 shapes, drag one shape                      | 60.0 frames, 3.4 ms work  | 60.0 frames, 3.1 ms work  | 60.0 frames, 5.2 ms work  |
| 10,000 shapes, pan                                 | cannot pan                | 60.0 frames, 1.5 ms work  | 60.0 frames, 1.5 ms work  |
| 10,000 shapes, pan at 10 percent zoom              | cannot pan                | 58.7 frames, 3.1 ms work  | 60.0 frames, 2.4 ms work  |
| 10,000 shapes, drag one shape, CPU 6 times slower  | 60.0 frames, 12.2 ms work | 60.0 frames, 10.9 ms work | 54.7 frames, 15.8 ms work |
| 10,000 shapes, pan, CPU 6 times slower             | cannot pan                | 59.0 frames, 8.8 ms work  | 56.0 frames, 10.4 ms work |
| 100,000 shapes, drag one shape                     | 60.0 frames, 7.8 ms work  | 60.0 frames, 4.9 ms work  | over its limit of 20,000  |
| 100,000 shapes, drag one shape, CPU 6 times slower | 34.0 frames, 25.5 ms work | 55.4 frames, 14.0 ms work | over its limit of 20,000  |
| 100,000 shapes, pan, CPU 6 times slower            | cannot pan                | 60.0 frames, 6.6 ms work  | over its limit of 20,000  |

What the numbers say:

- With 10,000 rectangles, all three folders draw 60 frames a second on this machine. Canvas 2D is fast: the 45-minute answer draws all 10,000 shapes in every frame and still has time left. So measure before you add an index.
- The grid shows its worth later: with 100,000 shapes on the slowed CPU, the 45-minute answer falls to 34 frames a second, and the 60-minute answer stays at 55.
- Panning is cheaper than dragging. A pan changes only the view. A drag makes a new scene for every pointer move, which copies the map of shapes.
- The production page has more to do in a frame than the 60-minute page: it holds two boards, each board draws the pointer of the other user, and each renders its list for screen readers again.

What they do not say:

- They are lab numbers from one desktop computer. They are not numbers from real users on real tablets.
- "Work" does not hold the time the browser needs, on other threads, to put the pixels on the screen.
- Your numbers will differ from ours, and from one run to the next.

## Measure the memory of the history

`scripts/measure-history.mjs` builds a board of 10,000 shapes, runs 100 moves,
and measures how much memory the history of those 100 steps holds when it is
kept in three ways. It uses the real `apply` and `invert` of the 45-minute
answer. Run `npm install` in `45-minutes` first.

```bash
node --expose-gc scripts/measure-history.mjs
```

This is the output on our machine (Node.js 22):

```text
board: 10000 shapes, 1801 KB of heap, 803 KB as JSON
history of 100 steps
  as commands with inverses:            29 KB
  as scenes that share unchanged shapes: 8030 KB
  as full copies of the scene:          179938 KB
  full copies are 6122 times the commands, shared scenes 273 times
```

- **Commands** are what the code keeps: about 300 bytes for one step.
- **Full copies** are the first idea of many candidates: about 1.8 MB for one step, 180 MB for 100.
- **Shared scenes** keep the scene that `apply` returned for each step. Only the map of shapes is new in each one, and the shapes that did not change are the same objects. That is about 80 KB for one step with this flat map. A tree-shaped map would share more.

The first number changes a little from run to run, between 29 and 34 KB.
