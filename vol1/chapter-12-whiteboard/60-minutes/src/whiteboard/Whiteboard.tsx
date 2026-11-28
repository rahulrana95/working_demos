/*
 * PART OF THE INTERVIEW: yes (about 11 minutes).
 * Write it last. It holds almost no logic: it turns browser events into
 * actions for the reducer, and asks for one redraw per frame.
 * Order to write it in:
 *   1. The canvas with the pointer handlers.          (3 minutes)
 *   2. The redraw effect.                             (2 minutes)
 *   3. The toolbar and the keys.                      (3 minutes)
 *   4. The wheel.                                     (2 minutes)
 *   5. The status line for screen readers.            (1 minute)
 *
 * Why it holds at scale: any number of pointer moves in one frame cause one
 * redraw, because each change cancels the frame that was waiting and asks
 * for a new one.
 */
import { useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { CANVAS_SIZE, keyToAction } from "./board";
import type { BoardAction, BoardState, Tool } from "./board";
import { DEFAULT_MESSAGES } from "./messages";
import type { WhiteboardMessages } from "./messages";
import { paint } from "./render";

export interface WhiteboardProps {
  /** From `useReducer(boardReducer, createBoard())`. The parent can read the history from it. */
  state: BoardState;
  dispatch: (action: BoardAction) => void;
  /** Replace any text, for example to translate it. */
  messages?: WhiteboardMessages;
}

/**
 * The action for a pointer event, with the position inside the canvas. While
 * the canvas has captured the pointer, it is the target of every event, so
 * the position is also right outside its box.
 */
function pointerAction(type: "down" | "drag", event: PointerEvent<HTMLCanvasElement>): BoardAction {
  return { type, point: { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY } };
}

export function Whiteboard({ state, dispatch, messages = DEFAULT_MESSAGES }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canUndo = state.doc.undoStack.length > 0;
  const canRedo = state.doc.redoStack.length > 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    const frameId = requestAnimationFrame(() => canvas && paint(canvas, state));
    // A newer change, or the removal of the board, cancels a frame that is still waiting.
    return () => cancelAnimationFrame(frameId);
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    function handleWheel(event: WheelEvent) {
      // Keep the page from scrolling or zooming. React's onWheel cannot do this:
      // React listens passively, and a passive listener may not cancel the event.
      event.preventDefault();
      const point = { x: event.offsetX, y: event.offsetY };
      // A pinch on a trackpad arrives as a wheel event with ctrlKey set.
      dispatch(
        event.ctrlKey || event.metaKey
          ? { type: "zoom", point, factor: Math.exp(-event.deltaY / 200) }
          : { type: "pan", dx: -event.deltaX, dy: -event.deltaY },
      );
    }
    canvas?.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas?.removeEventListener("wheel", handleWheel);
  }, [dispatch]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    // Enter on a button presses that button. Keys typed in a field belong to the field.
    const isOurs =
      event.key === "Enter" ? target === canvasRef.current : !target.closest("input, textarea");
    const action = isOurs ? keyToAction(event) : null;
    if (action !== null) {
      event.preventDefault();
      dispatch(action);
    }
  }

  return (
    <div className="whiteboard" onKeyDown={handleKeyDown}>
      <div className="whiteboard__toolbar" role="group" aria-label={messages.toolbar}>
        {(Object.keys(messages.tools) as Tool[]).map((tool) => (
          <button
            key={tool}
            type="button"
            aria-pressed={state.tool === tool}
            onClick={() => dispatch({ type: "tool", tool })}
          >
            {messages.tools[tool]}
          </button>
        ))}
        {/* aria-disabled, not disabled: a disabled button would drop the keyboard focus. */}
        <button type="button" aria-disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>
          {messages.undo}
        </button>
        <button type="button" aria-disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}>
          {messages.redo}
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="whiteboard__canvas"
        style={CANVAS_SIZE}
        role="application"
        aria-label={messages.board}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.isPrimary && event.button === 0) {
            // Capture sends every later move to the canvas, also outside it.
            event.currentTarget.setPointerCapture(event.pointerId);
            dispatch(pointerAction("down", event));
          }
        }}
        onPointerMove={(event) => event.isPrimary && dispatch(pointerAction("drag", event))}
        onPointerUp={(event) => event.isPrimary && dispatch({ type: "up" })}
        onPointerCancel={() => dispatch({ type: "cancel" })}
      />
      <p role="status" className="visually-hidden">
        {state.lastChange && messages.status(state.lastChange)}
      </p>
    </div>
  );
}
