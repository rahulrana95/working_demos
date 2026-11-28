/*
 * NOT PART OF THE INTERVIEW: production version.
 * The component. It still holds almost no logic: it turns browser events
 * into actions, asks for one redraw per frame, and mirrors the shapes in view
 * for screen readers.
 *
 * A canvas is one picture. A screen reader finds nothing in it. So the
 * shapes in view are also inside the <canvas> element as a list of buttons:
 * the browser does not draw them, but they can be focused and are read out.
 * Focus on a button selects its shape, and the keys of the board then work
 * on it.
 *
 * Why it holds at scale: any number of pointer moves in one frame cause one
 * redraw. The list holds at most LIST_LIMIT buttons, however many shapes the
 * board has.
 */
import { useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { STROKES, keyToAction, visibleIds } from "./board";
import type { BoardAction, Tool } from "./board";
import { exportPng } from "./exportPng";
import { DEFAULT_MESSAGES } from "./messages";
import type { WhiteboardMessages } from "./messages";
import { paint } from "./render";
import type { UseWhiteboardReturn } from "./useWhiteboard";

export interface WhiteboardProps {
  /** What `useWhiteboard` returned. */
  board: UseWhiteboardReturn;
  /** Replace any text, for example to translate it. */
  messages?: Partial<WhiteboardMessages>;
}

/** The most shapes the list for screen readers holds: the top-most ones in view. */
export const LIST_LIMIT = 50;
/** One line of a mouse wheel, in pixels, for a browser that reports lines. */
const WHEEL_LINE = 16;

function toCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
  // While the canvas has captured the pointer, it is the target of every
  // event, so the position is also right outside its box.
  return { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
}

export function Whiteboard({ board, messages }: WhiteboardProps) {
  const text = { ...DEFAULT_MESSAGES, ...messages };
  const { state, dispatch, reportCursor, reportFrame } = board;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { scene } = state.sync;
  const { selectedId } = state;
  const canUndo = state.history.undoStack.length > 0;
  const canRedo = state.history.redoStack.length > 0;

  // The list: the top-most shapes in view. The selected shape is always in
  // it, so its button keeps the focus when the shape leaves the view.
  const inView = visibleIds({ ...state, drag: null });
  const listed = inView.slice(-LIST_LIMIT);
  const notListed = inView.length - listed.length;
  if (selectedId !== null && selectedId in scene.shapesById && !listed.includes(selectedId)) {
    listed.push(selectedId);
  }
  const { lastChange } = state;
  const kindName = lastChange?.kind ? text.kinds[lastChange.kind] : text.anyShape;

  useEffect(() => {
    const canvas = canvasRef.current;
    const frameId = requestAnimationFrame(() => {
      if (canvas !== null) {
        const startedAt = performance.now();
        const shapesDrawn = paint(canvas, state);
        reportFrame(performance.now() - startedAt, shapesDrawn);
      }
    });
    // A newer change, or the removal of the board, cancels a frame that is still waiting.
    return () => cancelAnimationFrame(frameId);
  }, [state, reportFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const reportSize = () =>
      dispatch({ type: "resize", width: canvas.clientWidth, height: canvas.clientHeight });
    reportSize();
    // A browser without ResizeObserver keeps the first size.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reportSize);
    observer?.observe(canvas);

    function handleWheel(event: WheelEvent) {
      // Keep the page from scrolling or zooming. React's onWheel cannot do this:
      // React listens passively, and a passive listener may not cancel the event.
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE : 1;
      // A pinch on a trackpad arrives as a wheel event with ctrlKey set.
      if (event.ctrlKey || event.metaKey) {
        const point = { x: event.offsetX, y: event.offsetY };
        dispatch({ type: "zoom", point, factor: Math.exp((-event.deltaY * unit) / 200) });
      } else {
        dispatch({ type: "pan", dx: -event.deltaX * unit, dy: -event.deltaY * unit });
      }
    }
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      observer?.disconnect();
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [dispatch]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const canvas = canvasRef.current;
    // Enter on a button presses that button. Keys typed in a field belong to the field.
    const isOurs =
      event.key === "Enter" ? target === canvas : !target.closest("input, textarea, select");
    const action = isOurs ? keyToAction(event) : null;
    if (action === null) {
      return;
    }
    event.preventDefault();
    // The key may remove the shape button that has the focus (Delete, undo of
    // an add). The focus goes to the canvas first, so it is never lost.
    const isMove = action.type === "nudge" || action.type === "grow";
    if (!isMove && canvas !== null && canvas !== target && canvas.contains(target)) {
      canvas.focus();
    }
    dispatch(action);
  }

  function toolButton(tool: Tool) {
    const action: BoardAction = { type: "tool", tool };
    return (
      <button
        key={tool}
        type="button"
        aria-pressed={state.tool === tool}
        onClick={() => dispatch(action)}
      >
        {text.tools[tool]}
      </button>
    );
  }

  return (
    <div className="whiteboard" onKeyDown={handleKeyDown}>
      <div className="whiteboard__toolbar" role="group" aria-label={text.toolbar}>
        {(Object.keys(text.tools) as Tool[]).map(toolButton)}
        {/* aria-disabled, not disabled: a disabled button would drop the keyboard focus. */}
        <button type="button" aria-disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>
          {text.undo}
        </button>
        <button type="button" aria-disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}>
          {text.redo}
        </button>
        <button
          type="button"
          onClick={() => canvasRef.current !== null && void exportPng(canvasRef.current)}
        >
          {text.exportPng}
        </button>
      </div>
      <div className="whiteboard__toolbar" role="group" aria-label={text.colours}>
        {STROKES.map((stroke, index) => (
          <button
            key={stroke}
            type="button"
            aria-pressed={state.stroke === stroke}
            onClick={() => dispatch({ type: "stroke", stroke })}
          >
            <span className="whiteboard__swatch" style={{ backgroundColor: stroke }} />
            {text.colourNames[index]}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        className="whiteboard__canvas"
        role="application"
        aria-label={text.board}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.isPrimary && event.button === 0) {
            // Capture sends every later move to the canvas, also outside it.
            event.currentTarget.setPointerCapture(event.pointerId);
            dispatch({ type: "down", point: toCanvasPoint(event) });
          }
        }}
        onPointerMove={(event) => {
          if (event.isPrimary) {
            dispatch({ type: "drag", point: toCanvasPoint(event) });
            reportCursor(toCanvasPoint(event));
          }
        }}
        onPointerUp={(event) => event.isPrimary && dispatch({ type: "up" })}
        onPointerCancel={() => dispatch({ type: "cancel" })}
        onPointerLeave={() => reportCursor(null)}
      >
        <ul>
          {listed.map((id, index) => (
            <li key={id}>
              <button
                type="button"
                aria-pressed={id === selectedId}
                onFocus={() => id !== selectedId && dispatch({ type: "select", id })}
              >
                {text.shape(scene.shapesById[id], text.kinds[scene.shapesById[id].kind], index + 1)}
              </button>
            </li>
          ))}
          {notListed > 0 && <li>{text.moreShapes(notListed)}</li>}
        </ul>
      </canvas>
      <p role="status" className="visually-hidden">
        {lastChange && text.status(lastChange, text.changes[lastChange.what], kindName)}
      </p>
    </div>
  );
}
