# Chapter 12: Whiteboard, the 45-minute answer

People draw rectangles on a board, move them around, and can undo and redo.

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

| File                                  | In the interview? | Time       | Lines of code |
| ------------------------------------- | ----------------- | ---------- | ------------- |
| `src/whiteboard/scene.ts`             | Yes               | 4 minutes  | 27            |
| `src/whiteboard/commands.ts`          | Yes               | 8 minutes  | 32            |
| `src/whiteboard/history.ts`           | Yes               | 6 minutes  | 37            |
| `src/whiteboard/board.ts`             | Yes               | 12 minutes | 111           |
| `src/whiteboard/render.ts`            | Yes               | 5 minutes  | 34            |
| `src/whiteboard/Whiteboard.tsx`       | Yes               | 9 minutes  | 76            |
| `*.test.ts`, `*.test.tsx`             | No                |            |               |
| `src/App.tsx`, `src/demoScene.ts`     | No                |            |               |
| `src/styles.css`, `src/setupTests.ts` | No                |            |               |

Lines of code are counted without blank lines and comments: 317 in total.
The folder has 118 tests.

The whiteboard code is 2,478 bytes when it is minified and compressed with gzip,
without React. Measure it again with:

```bash
npx esbuild src/whiteboard/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

That is about 44 minutes of typing for someone who has practised it. Write the
files in the order of the table: the commands and the two stacks first, the
component last.

## What this answer leaves out

The question asks for more than fits in 45 minutes. This answer keeps the hard
centre: undo and redo with commands, one command per drag, drawing on a
canvas, selection and move. These parts are in another folder:

| Left out here                                            | Where it is                      |
| -------------------------------------------------------- | -------------------------------- |
| Pan and zoom                                             | [`../60-minutes`](../60-minutes) |
| Drawing only the shapes in view, with a grid as an index | [`../60-minutes`](../60-minutes) |
| Texts that can be translated                             | [`../60-minutes`](../60-minutes) |
| Freehand lines                                           | [`../production`](../production) |
| Resize and restyle commands, colours                     | [`../production`](../production) |
| The list of shapes for screen readers                    | [`../production`](../production) |
| A canvas that follows the size of its box                | [`../production`](../production) |

So a screen reader user of this answer can use the toolbar, add a rectangle
with the keyboard, move it, remove it, undo and redo, and hears each change.
They cannot find out what is on the board, and cannot select an older shape.
That needs the list, which is in the production folder.

## How the styles ship

The whiteboard needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Whiteboard" heading, and the `button` rules above
it. The other rules style the demo page.

- `touch-action: none` on the canvas is not decoration. Without it, a finger that drags on the canvas scrolls the page, and the browser cancels the drag.
- The canvas has a fixed size, 718 by 418 CSS pixels inside its border. This answer does not redraw when the window changes size, so the size must not depend on the window. A narrow screen scrolls the board sideways.
- The chosen tool has a thicker border and bold text. A button that cannot be used has a dashed border. Neither is shown by colour alone, and both have a rule for high-contrast mode (`forced-colors`).
- Every button is at least 44 pixels in both directions, so a finger can hit it.

The measured JavaScript size does not include this CSS. The whiteboard rules are
431 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Whiteboard/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## Why it holds at scale

| Pressure                                       | What protects us                                                         | Test that proves it                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A drag is hundreds of pointer moves            | The drag keeps one pending command. The history gets it once, on release | `adds one undo entry for a drag of 500 pointer moves`                     |
| Many pointer moves arrive in one frame         | Each change cancels the waiting frame and asks for a new one             | `redraws once for many pointer moves in one frame`                        |
| The board has 10,000 shapes                    | A history step is a command of a few numbers, not a copy of the board    | `a command is plain data: it survives a trip through JSON`                |
| The user works all day                         | The undo stack holds at most 100 entries and drops the oldest            | `never holds more than the limit, even after 10,000 commands`             |
| One shape of many changes                      | `apply` copies the map of shapes, not the shapes: the others are shared  | `keeps the same object for every shape it did not change`                 |
| The screen has two device pixels per CSS pixel | The canvas gets twice the pixels and one scale                           | `gives the canvas two pixels for each CSS pixel on a screen with ratio 2` |
| A key is pressed in the middle of a drag       | Only the drag itself may change the board until it ends                  | `Ctrl+Z in the middle of a drag does nothing`                             |

The chapter README has the measured numbers: the memory of 100 history steps
kept as commands and as copies, and the frame rate with 1,000, 10,000 and
100,000 shapes.

What does not hold at scale here, and is said aloud in the interview: every
redraw draws every shape, also those outside the canvas, and a click looks at
every shape. The 60-minute answer fixes both.

## Edge cases covered

- A click without a move adds no undo step. A drag that ends where it began adds none either.
- The rectangle is the same whichever corner the drag starts from.
- Escape cancels a drag. Releasing the button afterwards adds nothing.
- The browser cancels the pointer (`pointercancel`): the drag is dropped.
- A second finger or the right mouse button does not start or disturb a drag.
- Ctrl+Z, Delete, an arrow key or a tool button in the middle of a drag: ignored.
- A new command after an undo empties the redo stack.
- Undo and redo with empty stacks do nothing.
- Undo of a remove puts the shape back at its old place in the drawing order.
- Undo removes the selected shape: Delete and the arrow keys then do nothing, and a redo brings the shape back selected.
- A command whose shape does not exist changes nothing and costs no undo step.
- A new shape never gets the id of a shape in a loaded scene, and an id is not used again after its shape was removed.
- Enter on a toolbar button presses the button. It does not add a rectangle.
- Keys typed in a text field inside the board belong to the field.
- Two equal undos in a row give two different status messages, so a screen reader reads both.
- The device pixel ratio is not a whole number, or changes while the page is open (the user zooms the page).
- The board is removed while a frame is waiting: the frame is cancelled.

## Accessibility

A canvas is one picture. A screen reader finds nothing in it, so the design
must add what the picture cannot say.

- The tools are buttons in a named group. The chosen tool has `aria-pressed="true"`. They are plain buttons, each reached with Tab: the arrow keys belong to the board, so this is not the toolbar pattern with arrow keys.
- Undo and Redo have `aria-disabled` when their stack is empty. They are not `disabled`: a disabled button would lose the keyboard focus the moment the last step is undone.
- The canvas can take the focus, has a name, and has `role="application"`, so a screen reader passes the arrow keys to the page.
- Everything can be done with the keyboard: choose the Rectangle tool, press Enter on the board to add a rectangle, move it with the arrow keys, remove it with Delete, undo and redo.
- A status line (`role="status"`) says each settled change: "Undid: move rectangle. Steps to undo: 2." It says nothing during a drag.
- The selected shape has a second box around it, not only another colour.

What is missing is listed under "What this answer leaves out".

## Try it in the demo

1. Choose Rectangle and drag on the board twice. Choose Select and drag one rectangle across the board. "Pointer moves during drags" goes up by a hundred or more. The undo stack gets one entry.
2. Press Ctrl+Z three times and Ctrl+Shift+Z twice, and watch the two stacks.
3. Without the mouse: Tab to Rectangle and press Enter, Tab to the board and press Enter, press an arrow key, press Ctrl+Z.
4. Start to drag a rectangle and press Escape before you let go.
5. Press "Load 10,000 shapes" and drag the first rectangle.
