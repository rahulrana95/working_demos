/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the whiteboard and a panel with what the user
 * cannot see: the undo and redo stacks, the pointer moves and the frame rate.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { createDemoScene } from "./demoScene";
import { Whiteboard, boardReducer, createBoard } from "./whiteboard";
import type { BoardAction, HistoryEntry, Scene } from "./whiteboard";

function describeEntry({ command }: HistoryEntry): string {
  if (command.type === "add") {
    return `add rectangle ${command.shape.id}`;
  }
  if (command.type === "move") {
    return `move rectangle ${command.id} by ${command.dx}, ${command.dy}`;
  }
  return `remove rectangle ${command.id}`;
}

/** Counts the frames the browser draws, once a second. */
function useFramesPerSecond(): number {
  const [framesPerSecond, setFramesPerSecond] = useState(0);

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let frameId = requestAnimationFrame(function count(now) {
      frames += 1;
      if (now - windowStart >= 1000) {
        setFramesPerSecond(Math.round((frames * 1000) / (now - windowStart)));
        frames = 0;
        windowStart = now;
      }
      frameId = requestAnimationFrame(count);
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  return framesPerSecond;
}

function Board({ initialScene }: { initialScene: Scene }) {
  const [state, dispatch] = useReducer(boardReducer, initialScene, createBoard);
  const [pointerMoves, setPointerMoves] = useState(0);
  const framesPerSecond = useFramesPerSecond();
  const { scene, undoStack, redoStack } = state.doc;

  // Read in the event handler below, so the handler does not need the state.
  const isDraggingRef = useRef(false);
  useEffect(() => {
    isDraggingRef.current = state.drag !== null;
  }, [state.drag]);

  function countingDispatch(action: BoardAction) {
    if (action.type === "drag" && isDraggingRef.current) {
      setPointerMoves((count) => count + 1);
    }
    dispatch(action);
  }

  return (
    <>
      <Whiteboard label="Whiteboard" state={state} dispatch={countingDispatch} />

      <section className="panel" aria-label="What is happening">
        <p>
          <strong>Shapes:</strong> <span data-testid="shape-count">{scene.order.length}</span>.{" "}
          <strong>Pointer moves during drags:</strong>{" "}
          <span data-testid="pointer-moves">{pointerMoves}</span>.{" "}
          <strong>Frames per second:</strong> {framesPerSecond}.
        </p>
        <div className="panel__stacks">
          <div>
            <p>
              <strong>Undo stack: {undoStack.length}</strong>
            </p>
            <ol className="panel__log" data-testid="undo-stack">
              {undoStack.map((entry, index) => (
                <li key={index}>{describeEntry(entry)}</li>
              ))}
            </ol>
          </div>
          <div>
            <p>
              <strong>Redo stack: {redoStack.length}</strong>
            </p>
            <ol className="panel__log" data-testid="redo-stack">
              {redoStack.map((entry, index) => (
                <li key={index}>{describeEntry(entry)}</li>
              ))}
            </ol>
          </div>
        </div>
        <p className="panel__hint">
          Drag a rectangle across the board. The pointer moves go up by hundreds, and the undo stack
          gets one entry.
        </p>
      </section>
    </>
  );
}

const SCENE_SIZES = [0, 1000, 10000];

/** For the measurements: "?shapes=100000" in the address starts with that many shapes. */
function shapeCountFromAddress(): number {
  return Number(new URLSearchParams(window.location.search).get("shapes")) || 0;
}

export function App() {
  const [shapeCount, setShapeCount] = useState(shapeCountFromAddress);
  const [loadCount, setLoadCount] = useState(0);

  return (
    <main className="page">
      <h1>Chapter 12: Whiteboard</h1>
      <p className="page__intro">
        Choose <kbd>Rectangle</kbd> and drag on the board to draw. Choose <kbd>Select</kbd> and drag
        a rectangle to move it. Keys: <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+
        <kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, arrows move the selected
        rectangle, <kbd>Delete</kbd> removes it, <kbd>Escape</kbd> cancels a drag. With the
        Rectangle tool, <kbd>Enter</kbd> on the board adds a rectangle.
      </p>

      {/* A new key makes a new board, with an empty history. */}
      <Board key={loadCount} initialScene={createDemoScene(shapeCount)} />

      <p className="page__loaders">
        {SCENE_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => {
              setShapeCount(size);
              setLoadCount((count) => count + 1);
            }}
          >
            {size === 0 ? "Empty board" : `Load ${size.toLocaleString("en")} shapes`}
          </button>
        ))}
      </p>
    </main>
  );
}
