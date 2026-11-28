# Chapter 12: Whiteboard, the 60-minute answer

People draw rectangles on a board, move them around, and can undo and redo.

This is the staff answer: the senior answer from [`../45-minutes`](../45-minutes),
plus what a staff candidate adds in 15 more minutes so that it holds for a
board of 10,000 shapes and can be translated. What a team adds after the
interview is in [`../production`](../production). The
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
interview. `index.html` and `vite.config.ts` say so too. The JSON files do not,
because JSON cannot hold a comment: none of them is part of the interview.

| File                                  | In the interview? | Time       | Lines of code |
| ------------------------------------- | ----------------- | ---------- | ------------- |
| `src/whiteboard/scene.ts`             | Yes               | 3 minutes  | 21            |
| `src/whiteboard/commands.ts`          | Yes               | 8 minutes  | 32            |
| `src/whiteboard/history.ts`           | Yes               | 6 minutes  | 37            |
| `src/whiteboard/view.ts`              | Yes               | 3 minutes  | 16            |
| `src/whiteboard/grid.ts`              | Yes               | 6 minutes  | 41            |
| `src/whiteboard/messages.ts`          | Yes               | 3 minutes  | 12            |
| `src/whiteboard/board.ts`             | Yes               | 14 minutes | 138           |
| `src/whiteboard/render.ts`            | Yes               | 6 minutes  | 38            |
| `src/whiteboard/Whiteboard.tsx`       | Yes               | 11 minutes | 91            |
| `*.test.ts`, `*.test.tsx`             | No                |            |               |
| `src/App.tsx`, `src/demoScene.ts`     | No                |            |               |
| `src/styles.css`, `src/setupTests.ts` | No                |            |               |

Lines of code are counted without blank lines and comments: 426 in total.
The folder has 167 tests.

The whiteboard code is 3,230 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/whiteboard/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

`commands.ts` and `history.ts` are the same as in the 45-minute answer.

## What was added to the 45-minute answer

| Addition                                          | Why it matters                                                                                                                                                    | Minutes |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| The view: `view.ts`, the `pan` and `zoom` actions | The board is larger than the canvas. The wheel or two fingers on a trackpad move the view. Ctrl and the wheel, or a pinch on a trackpad, zoom around the pointer. | 5       |
| Every pointer position goes through `toBoard`     | A click selects and a drag moves the right shape at every position and zoom level of the view.                                                                    | 1       |
| The grid: `grid.ts`, `visibleIds`                 | One frame draws only the shapes in the cells that the view touches. A click looks only at the shapes in the cells around the pointer.                             | 6       |
| `messages`                                        | Every text the user reads or hears can be translated. No English is fixed in the component.                                                                       | 3       |
| Arrow keys move the view when nothing is selected | A keyboard user needs a way to pan.                                                                                                                               |         |
| Logical CSS properties                            | The layout mirrors itself in right-to-left languages.                                                                                                             |         |

## What this answer still leaves out

The design brief lists more for a staff answer than 15 minutes can hold.
These parts are in the production folder, or are not built at all. The
[production README](../production/README.md) has the full list.

| Left out here                                                         | Where it is                                   |
| --------------------------------------------------------------------- | --------------------------------------------- |
| Freehand lines, colours, resize                                       | [`../production`](../production)              |
| The list of shapes for screen readers                                 | [`../production`](../production)              |
| Quick repeated key presses joined into one undo step                  | [`../production`](../production)              |
| A history limit by size as well as by count                           | [`../production`](../production)              |
| A pan tool for a pen or a finger, zoom with the keyboard              | [`../production`](../production)              |
| Autosave, export as a picture                                         | [`../production`](../production)              |
| A canvas that follows the size of its box                             | [`../production`](../production)              |
| Several users                                                         | [`../production`](../production)              |
| Pan with the space key held, pinch with two fingers on a touch screen | Not built                                     |
| A selection rectangle, moves of several shapes as one command         | Not built                                     |
| Resize handles, snapping to a grid                                    | Not built                                     |
| A cached layer in an offscreen canvas during a drag                   | Not built: the measurements do not ask for it |

## How the styles ship

The whiteboard needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Whiteboard" heading, and the `button` rules above
it. The other rules style the demo page.

- `touch-action: none` on the canvas is not decoration. Without it, a finger that drags on the canvas scrolls the page, and the browser cancels the drag.
- The canvas is 720 by 420 CSS pixels. The component sets that size itself (`CANVAS_SIZE`), because the part of the board that is in view is worked out from it. This answer does not follow a canvas that changes size.
- The chosen tool has a thicker border and bold text. A button that cannot be used has a dashed border. Neither is shown by colour alone, and both have a rule for high-contrast mode (`forced-colors`).
- Every button is at least 44 pixels in both directions, so a finger can hit it.
- Margins and paddings use logical properties (`margin-block-end`, `padding-inline-start`).

The measured JavaScript size does not include this CSS. The whiteboard rules are
436 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Whiteboard/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                               | What protects us                                                         | Test that proves it                                                             |
| -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| The board has 10,000 shapes            | A frame draws only the shapes in the grid cells that the view touches    | `draws only the shapes near the view, not all 10,000`                           |
| A click on a board of 10,000 shapes    | The hit test reads only the cells around the pointer                     | `gives the same shape as a look at every shape: 3,000 random points`            |
| The grid must never hide a shape       | A shape is in every cell its box touches                                 | `never misses a shape that touches the box: 500 random boxes over 2,000 shapes` |
| The scene changes with every command   | A scene is never changed in place, so its grid is built once and kept    | `gives the same answer when asked twice, and a fresh one for a new scene`       |
| A drag is hundreds of pointer moves    | The drag keeps one pending command. The history gets it once, on release | `adds one undo entry for a drag of 500 pointer moves`                           |
| Many pointer moves arrive in one frame | Each change cancels the waiting frame and asks for a new one             | `redraws once for many pointer moves in one frame`                              |
| The user zooms far in or out           | The scale stays between 10 and 800 percent, and lines keep their width   | `does not zoom in further than 800 percent or out further than 10 percent`      |
| The user works all day                 | The undo stack holds at most 100 entries and drops the oldest            | `never holds more than the limit, even after 10,000 commands`                   |

The chapter README has the measured numbers. With 10,000 shapes and the view
at 100 percent, one frame draws 117 of them.

What still does not hold, and is said aloud in the interview: the grid is
built again after every command, which reads every shape once. A shape that
is very large lies in very many cells. And when the user zooms out until every
shape is in view, every shape is drawn.

## Edge cases covered, on top of the 45-minute answer

- A drag at 200 percent moves the shape half as far on the board as the pointer moved on the canvas.
- Zoom keeps the board position under the pointer where it is, at every factor.
- Zoom at the limit does not move the view.
- The wheel in the middle of a drag does nothing.
- Pan and zoom add no undo step.
- A shape that lies in several cells is drawn once.
- A large shape is found from a cell that only its middle touches.
- Positions left of and above the start of the board, which are negative, work.
- A click within 4 pixels of a shape in the next cell still hits it.
- The shape of a drag that is not finished is drawn, though it is not in the saved scene yet.
- A shape that is dragged stays in the list of shapes to draw during the drag.
- Enter adds the rectangle near the corner of the view, wherever the view is.
- The page does not scroll or zoom when the wheel is used over the canvas.
- The board is removed: it stops listening to the wheel.

## Accessibility

The same as the 45-minute answer, with these changes:

- Every text comes from `messages`: the name of the board, the name of the toolbar, the names of the tools, Undo, Redo and the status line. The last change is kept as data (`lastChange`), and `messages.status` turns it into a sentence. No text counts things, so no plural forms are needed.
- With nothing selected, the arrow keys move the view. Zoom has no key in this answer.
- The list of shapes for screen readers is still missing here. It is in the production folder.

## Browser notes

- React attaches its `onWheel` listener as a passive listener, and a passive listener may not cancel the event. So the component adds its own `wheel` listener with `{ passive: false }` and calls `preventDefault()`, or the page would scroll and zoom under the board.
- A pinch on a trackpad arrives as a `wheel` event with `ctrlKey` set to true. Two fingers on a touch screen do not: they are two pointers, and this answer ignores the second one.
- The wheel handler reads `deltaX` and `deltaY` as pixels. The production version also handles a browser that reports lines.

## Try it in the demo

1. Press "Load 10,000 shapes". The panel shows how many shapes the last frame drew: about a hundred.
2. Scroll with the wheel or with two fingers. Hold Ctrl and scroll, or pinch on a trackpad, to zoom. The frame rate in the panel stays the same.
3. Zoom in, choose Rectangle and draw. Zoom out again: the rectangle is where you drew it.
4. Click on empty board, so that nothing is selected, and press the arrow keys: the view moves.
