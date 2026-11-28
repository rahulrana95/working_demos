# Chapter 12: Whiteboard, the production version

People draw shapes and freehand lines on a board, move them around, and can
undo and redo. Several people draw on the same board at the same time.

**This is not an interview answer.** Nobody writes this in 45 or 60 minutes.
It is the staff answer from [`../60-minutes`](../60-minutes), plus what a team
adds in the first week before real users see it. The
[chapter README](../README.md) compares the three folders.

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

The demo shows two whiteboards, for two users, joined by a fake server that
lives in the page (`src/api/fakeServer.ts`). Every message takes a random time
between 50 and 300 milliseconds.

## What was added to the 60-minute answer

| Feature                                                           | Why                                                                                                                                                                                                                                   | Test that proves it                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a. Undo of your own work only: `history.ts`, `stepOnCurrentScene` | Each user has their own two stacks, with their own commands. An undo is a new operation that takes back only what is still that user's: a shape that someone else removed, or a value that someone else changed since, is left alone. | `A draws, B draws, A undoes: only A's shape goes, on both boards`, `A colours a shape red, B colours it blue, A undoes: it stays blue`                                 |
| b. One order for everyone: `sync.ts`                              | The server numbers the operations. Every board applies them in that order, so every board ends the same. The later number wins for one value of one shape. Changes to different values of one shape both stay.                        | `three users, 300 random operations, random delays: all three scenes are equal`, `two values of one shape changed by two users at the same time: both changes stay`    |
| c. Your own change at once: `unconfirmed`                         | The user does not wait for the server. Their operations show at once, and are applied again on top when an operation of someone else arrives first.                                                                                   | `goes under our waiting operations, which are applied again on top`                                                                                                    |
| d. Reconnect: `isOnline`, operation ids                           | What is drawn offline waits, and is sent with the same ids when the connection is back. An operation that already reached the server is not drawn twice.                                                                              | `an operation that reached the server just before the connection dropped is not drawn twice after the resend`                                                          |
| e. Presence: `presence.ts`                                        | Each user sees the pointer, the name and the selection of the others. At most one message in 50 milliseconds is sent, and the last position is never lost.                                                                            | `sends at most 21 messages for 1,000 pointer moves in one second`                                                                                                      |
| f. Freehand lines: `PathShape`, the Freehand tool                 | The second kind of shape. A click on its box but away from the line does not select it.                                                                                                                                               | `hits a freehand line on the line, and not in the empty part of its box`                                                                                               |
| g. Fewer points: `isFarEnough`, `simplifyPath`                    | A pen reports hundreds of positions a second. A point nearer than 2 pixels to the last one is not kept, and the finished line drops every point that a straight piece can stand in for.                                               | `never drops a point that is further from the result than the tolerance`, `stores far fewer points than the pointer reported for a long, smooth line`                  |
| h. Resize and restyle commands, colours                           | A command that names only the values it changes. Shift and an arrow key resize a rectangle. A colour button colours the selected shape.                                                                                               | `a resize or a restyle changes only the values it names`                                                                                                               |
| i. Quick key presses are one undo step: `MERGE_WINDOW_MS` (600)   | Ten presses of an arrow key are one thing to the user. The others still get every step.                                                                                                                                               | `ten quick arrow presses are one undo step, and one undo takes all ten back`                                                                                           |
| j. History limit by size: `maxSize` (1,000,000 characters)        | One freehand line can be larger than a thousand moves. The stack is limited by the size of its entries as JSON as well as by their count.                                                                                             | `one large freehand line pushes many small moves out of a small budget`                                                                                                |
| k. The shape list: buttons inside the `<canvas>`                  | A screen reader finds the shapes in view. Focus on a button selects its shape, and the keys of the board work on it. At most 50 buttons, however many shapes.                                                                         | `selects a shape when its button gets the focus, and marks it as pressed`, `holds at most 50 buttons for a board of 10,000 shapes, and says how many more are in view` |
| l. Pan tool, zoom keys, a canvas that follows its box             | A pen or a finger has no wheel. A keyboard has no pinch. The canvas is as wide as its box, and a `ResizeObserver` reports its size.                                                                                                   | `the pan tool moves the view with the pointer and adds no undo step`, `follows the canvas when its size changes`                                                       |
| m. Autosave: `storageKey`, `saveScene`, `loadScene`               | The scene is saved in the browser half a second after the last change, and at once when the page is hidden. A full or switched-off storage never throws.                                                                              | `does not throw when the storage is full, reports the failure, and tries again after the next change`                                                                  |
| n. Save as a picture: `exportPng`                                 | The view as a PNG file, on a white page.                                                                                                                                                                                              | `puts a white page under the drawing, because the canvas is see-through`                                                                                               |
| o. Events: `onEvent`                                              | The team can measure what is used, how often an undo found nothing to do, save failures, conflicts and drawing time. An event never holds what the user drew.                                                                         | `never puts positions, sizes, points, colours or ids in an event`, `never puts a position, a colour, an id or a name in an event, with everything switched on`         |
| p. Error boundary: `WhiteboardErrorBoundary`                      | If the whiteboard throws, the rest of the page keeps working, and the user can start the whiteboard again.                                                                                                                            | `shows a message in place of a child that throws, and reports the error`                                                                                               |
| q. Too large: `maxShapes` (20,000), `SceneTooLargeError`          | A scene over the limit is not opened. A user cannot add a shape to a full board, and is told so.                                                                                                                                      | `throws SceneTooLargeError for a scene over the limit, and takes one at the limit`, `refuses a new shape when the board is full, and says so`                          |

## Lines of code

Counted without blank lines and comments, in `src/whiteboard`:

| File                | What it holds                                                       | Lines of code |
| ------------------- | ------------------------------------------------------------------- | ------------- |
| `scene.ts`          | The shapes, `makeRect`, `makePath`, `isShapeHit`                    | 83            |
| `commands.ts`       | The five commands, `apply`, `invert`, `stepOnCurrentScene`          | 73            |
| `history.ts`        | One user's two stacks, the two limits, joining of quick key presses | 67            |
| `sync.ts`           | Confirmed and unconfirmed operations, `receive`                     | 43            |
| `simplify.ts`       | `isFarEnough`, `simplifyPath`                                       | 31            |
| `grid.ts`           | The grid, `shapesNear`, `hitTest`                                   | 39            |
| `view.ts`           | `toBoard`, `zoomAt`                                                 | 16            |
| `board.ts`          | The reducer: every rule of the board                                | 309           |
| `events.ts`         | `BoardEvent`, `eventsFor`                                           | 35            |
| `presence.ts`       | `Presence`, `createThrottle`                                        | 45            |
| `storage.ts`        | `saveScene`, `loadScene`                                            | 45            |
| `messages.ts`       | Every text the user reads or hears                                  | 58            |
| `render.ts`         | `drawScene`, `paint`                                                | 97            |
| `exportPng.ts`      | `exportPng`                                                         | 30            |
| `useWhiteboard.ts`  | The hook: server, presence, autosave, events                        | 163           |
| `Whiteboard.tsx`    | The component                                                       | 173           |
| `ErrorBoundary.tsx` | `WhiteboardErrorBoundary`                                           | 41            |
| `index.ts`          | Shorter imports                                                     | 40            |

That is 1,388 lines in total: about three times the 60-minute answer (426) and
more than four times the 45-minute answer (317). The tests grow from 167 to 263.

The whiteboard code is 8,301 bytes when it is minified and compressed with gzip,
without React (45-minute answer: 2,478, 60-minute answer: 3,230). Measure it again with:

```bash
npx esbuild src/whiteboard/index.ts --bundle --minify --format=esm --external:react --external:react/jsx-runtime | gzip -9 -c | wc -c
```

## How the styles ship

The whiteboard needs CSS to work as described. It needs the rules in
`src/styles.css` under the "Whiteboard" heading, and the `button` rules above
it. The other rules style the demo page.

- `touch-action: none` on the canvas is not decoration. Without it, a finger that drags on the canvas scrolls the page, and the browser cancels the drag.
- The canvas is as wide as its box (`inline-size: 100%`) and 420 pixels high. The component watches its size.
- The chosen tool and the chosen colour have a thicker border and bold text. A button that cannot be used has a dashed border. Neither is shown by colour alone, and both have a rule for high-contrast mode (`forced-colors`).
- A colour button shows the colour and its name. In high-contrast mode the swatch keeps its colour (`forced-color-adjust: none`), because the user chose that colour.
- Every button is at least 44 pixels in both directions, so a finger can hit it.

The measured JavaScript size does not include this CSS. The whiteboard rules are
508 bytes more, minified and compressed with gzip. Measure them again with:

```bash
awk '/^\/\* -+ /{on = /Whiteboard/} on' src/styles.css | npx esbuild --loader=css --minify | gzip -9 -c | wc -c
```

## How to use the new parts

### The contract of the transport

The whiteboard cannot see the network. It gets two functions to send with, and
the caller passes it what arrives. So the caller must keep these rules:

1. `transport.send` and `transport.sendPresence` never throw. When a message cannot be sent, drop it and set `isOnline` to false.
2. `transport.send` may get the same operation again after a reconnect. The server must ignore an id it has already taken.
3. Pass every operation the server confirms, also this user's own, to `receiveOperation(seq, operation)`, in the order of the sequence numbers.
4. After a reconnect, start again after the last number the board has (`state.sync.lastSeq`).

If the transport breaks rule 3 or 4, the scene is still safe: an operation
with a number the board already has is ignored, and so is one that skips a
number. But the board does not ask for the missing operation. It waits until
the transport delivers it.

```tsx
function Board({ socket }: { socket: BoardSocket }) {
  const [isOnline, setIsOnline] = useState(socket.isOpen);
  const transport = useMemo<Transport>(
    () => ({
      send: (operation) => socket.trySend({ type: "operation", operation }),
      sendPresence: (presence) => socket.trySend({ type: "presence", presence }),
    }),
    [socket],
  );
  const board = useWhiteboard({
    userId: "asha",
    userName: "Asha",
    userColour: "#b45309",
    transport,
    isOnline,
    storageKey: "board-42",
    onEvent: (event) => analytics.track(event.type, event),
  });
  const { state, receiveOperation, receivePresence, removePeer } = board;
  const lastSeq = state.sync.lastSeq;

  useEffect(() => {
    socket.onOpen(() => {
      socket.trySend({ type: "hello", after: lastSeq });
      setIsOnline(true);
    });
    socket.onClose(() => setIsOnline(false));
    socket.onMessage((message) => {
      if (message.type === "operation") receiveOperation(message.seq, message.operation);
      if (message.type === "presence") receivePresence(message.presence);
      if (message.type === "left") removePeer(message.userId);
    });
  }, [socket, lastSeq, receiveOperation, receivePresence, removePeer]);

  return (
    <WhiteboardErrorBoundary onError={(error) => monitoring.report(error)}>
      <Whiteboard board={board} />
    </WhiteboardErrorBoundary>
  );
}
```

`BoardSocket`, `analytics` and `monitoring` stand for your own code. The demo
does the same with the fake server, in `src/App.tsx`.

### Undo with several users

An undo takes back the user's own last command. It is sent as a new operation,
so the others see it like any other change. Three rules keep it from touching
the work of someone else (`stepOnCurrentScene` in `commands.ts`):

1. The shape is gone, because someone else removed it: nothing is done. The user is told, "Nothing to do for move rectangle: someone else changed or removed it."
2. A value was changed by someone else after the user changed it: that value stays as the other user left it. Values that are still as the user left them are undone.
3. A move is a distance, not a position. So the undo of a move moves the shape that distance back, and a move that someone else made in the meantime stays.

One case is not protected: the undo of "add" removes the shape, also when
someone else has moved or coloured it since.

## Edge cases covered, on top of the 60-minute answer

- A user who has done nothing has nothing to undo, whatever the others did.
- A new command of another user does not empty this user's redo stack.
- B removes A's shape and undoes that: the shape is back as B found it.
- An operation arrives twice: it is applied once. One that skips a number waits.
- An operation of someone else arrives in the middle of a drag: it is applied, and the drag goes on.
- Someone removes the shape that is being dragged: the release sends nothing.
- A shape from another user is still taken when the board is full, so all boards stay the same.
- The colour a shape already has, or a resize to the size it already has, costs no undo step and sends nothing.
- A key press after a pause starts a new undo step. A key press never joins a drag.
- A click with the Freehand tool, without a move, draws nothing.
- A freehand line of one point, from a saved scene, can be picked.
- A freehand line of 200,000 points does not overflow a function call. A zigzag of 12,000 points does not overflow the call stack.
- The reach of a click is 4 pixels on the screen at every zoom level.
- The selected shape stays in the list when it leaves the view, so its button keeps the focus.
- Delete on a shape button, or an undo that removes its shape: the focus moves to the canvas, not to nowhere.
- A shape that is still being drawn is not in the list.
- Saved text that is not a scene (old version, broken JSON, wrong types): `loadScene` returns null.
- The page is hidden before the save delay is over: the scene is saved at once.
- The browser has no `ResizeObserver`: the canvas keeps its first size.
- A mouse wheel that reports lines, not pixels: one line counts as 16 pixels.
- The whiteboard throws again right after a restart: the message is shown again.

## Accessibility

- Inside the `<canvas>` element is a list with one button for each shape in view: "Rectangle 2 at 120, 80". The browser does not draw what is inside a canvas, but it keeps it in the tab order and shows it to screen readers.
- Focus on a shape button selects that shape, so a sighted keyboard user sees the selection box move. The arrow keys, Shift with the arrow keys and Delete then work on it.
- The list holds the 50 top-most shapes in view. When more are in view, its last line says how many, and to zoom in.
- When a key removes the shape whose button has the focus, the focus moves to the canvas.
- The status line also says when an undo had nothing left to do, and when the board is full.
- A colour button has the name of the colour as text, next to the swatch.
- Another user's pointer has their name next to it, and their selection is a dashed box. Neither is known by colour alone.
- Every text comes from `messages`, also the texts of the error boundary. The count of shapes that are not in the list is worded with `Intl.PluralRules`.

What remains hard, and is not solved here: the list says where a shape is, in
numbers, not what the drawing means. A freehand line has no words. The pointers
of the other users are not announced. And nobody can draw a freehand line with
the keyboard.

## What is still missing

This is a first week, not a finished product. The server is a fake one. The
scene that autosave writes is not read back by the demo. The next section
lists what the book describes and this folder does not build.

## Known limits, described in the book but not built here

- Shapes: there are rectangles and freehand lines. Ellipses, straight lines and text are not built.
- No selection of several shapes, no selection rectangle, and no grouped command that moves several shapes as one undo step.
- No resize handles. A rectangle is resized with Shift and the arrow keys. A freehand line cannot be resized.
- No snapping to a grid.
- No cached layer in an offscreen canvas while one shape is dragged. Every frame draws the shapes in view again. With 10,000 rectangles the measurements did not ask for it.
- No pan with the space key held, and no pinch with two fingers on a touch screen. The second finger is ignored. Pan is the wheel, the Pan tool or the arrow keys. Zoom is Ctrl and the wheel, a pinch on a trackpad, or the plus and minus keys.
- The grid is built again after every command, also after every operation of another user. It is not updated in place.
- A very large shape lies in very many cells of the grid.
- Nothing listens for a change of the device pixel ratio alone (the user zooms the page, or moves the window to another screen). The canvas is sharp again at the next redraw, not at once.
- A rectangle is hit anywhere in its box, not only on its border.
- Collaboration is "one order from the server, and the later number wins". There is no operational transformation and no CRDT. Chapter 13 goes deeper.
- The undo of "add" removes the shape, also when someone else has changed it since.
- A shape that was added offline keeps the place in the drawing order it had when it was drawn. It can end up under shapes that others drew in the meantime.
- The board does not ask for an operation that is missing. The transport must deliver in order.
- An unconfirmed operation is sent again after a reconnect only. There is no timer that sends it again while the connection is up.
- A user who vanishes without a "left" message stays on the other boards. There is no timeout for presence.
- The server is a fake in the page. Nothing here checks who may draw, and the log of operations is never made shorter.
- Autosave writes the scene, not the history, and the demo does not load it. A saved scene is not merged with what the server has.
- The picture holds the view, not the whole board.
- The size of the history is the length of its JSON, which is a fair measure and not the true memory.
- `simplifyPath` can take time that grows with the square of the number of points, for a line that zigzags at every point.
- The `frame` event holds the time of the drawing calls on the main thread. The time the browser then needs to put the pixels on the screen is not in it.
- No build step fails when the size budget is crossed. The size is measured by hand, with the command above.
- WebGL is not used. Canvas 2D was measured first, and it was enough.

## Try it in the demo

1. Draw a rectangle on Asha's board, and one on Bela's. Press Undo on Asha's board: only Asha's rectangle goes, on both boards.
2. Untick "Connected to the server" for Asha and draw two shapes. "Waiting for the server" shows 2, and Bela sees nothing. Tick it again: Bela gets both, once, and the events show `reconnect` with `resent: 2`.
3. Select the same shape on both boards and choose a different colour on each, quickly. Both boards end with the same colour: that of the operation the server numbered later.
4. Colour a shape red on Asha's board, then blue on Bela's. Press Undo on Asha's board: the shape stays blue.
5. Choose Freehand and draw a long line. The saved scene (`localStorage`, key `chapter-12-asha`) holds far fewer points than the pointer reported.
6. Move the pointer over one board and watch the other.
7. Press Tab on a board until a shape is selected, then use the arrow keys.
8. Press "Load 25,000 shapes": both boards refuse to open the scene.
