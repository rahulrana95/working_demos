/*
 * PART OF THE INTERVIEW: yes (about 9 minutes).
 * Write it last. It holds almost no logic: it turns browser events into
 * actions for the reducer, and asks for one redraw per frame.
 * Order to write it in:
 *   1. The canvas with the pointer handlers.          (3 minutes)
 *   2. The redraw effect.                             (2 minutes)
 *   3. The toolbar and the keys.                      (3 minutes)
 *   4. The status line for screen readers.            (1 minute)
 *
 * Why it holds at scale: any number of pointer moves in one frame cause one
 * redraw, because each change cancels the frame that was waiting and asks
 * for a new one.
 */
import { useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { keyToAction, previewScene } from "./board";
import type { BoardAction, BoardState, Tool } from "./board";
import { paint } from "./render";

export interface WhiteboardProps {
  /** The name of the drawing area, read out by screen readers. */
  label: string;
  /** From `useReducer(boardReducer, createBoard())`. The parent can read the history from it. */
  state: BoardState;
  dispatch: (action: BoardAction) => void;
}

const TOOL_NAMES: Record<Tool, string> = { select: "Select", rect: "Rectangle" };

/**
 * The action for a pointer event, with the position inside the canvas. While
 * the canvas has captured the pointer, it is the target of every event, so
 * the position is also right outside its box.
 */
function pointerAction(type: "down" | "drag", event: PointerEvent<HTMLCanvasElement>): BoardAction {
  return { type, point: { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY } };
}

export function Whiteboard({ label, state, dispatch }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canUndo = state.doc.undoStack.length > 0;
  const canRedo = state.doc.redoStack.length > 0;
  const scene = previewScene(state);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frameId = requestAnimationFrame(() => canvas && paint(canvas, scene, state.selectedId));
    // A newer change, or the removal of the board, cancels a frame that is still waiting.
    return () => cancelAnimationFrame(frameId);
  }, [scene, state.selectedId]);

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
      <div className="whiteboard__toolbar" role="group" aria-label="Tools">
        {(Object.keys(TOOL_NAMES) as Tool[]).map((tool) => (
          <button
            key={tool}
            type="button"
            aria-pressed={state.tool === tool}
            onClick={() => dispatch({ type: "tool", tool })}
          >
            {TOOL_NAMES[tool]}
          </button>
        ))}
        {/* aria-disabled, not disabled: a disabled button would drop the keyboard focus. */}
        <button type="button" aria-disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>
          Undo
        </button>
        <button type="button" aria-disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}>
          Redo
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="whiteboard__canvas"
        role="application"
        aria-label={label}
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
        {state.status}
      </p>
    </div>
  );
}
