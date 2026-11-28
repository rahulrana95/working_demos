/*
 * NOT PART OF THE INTERVIEW: production version.
 * Moving and resizing an event, with the mouse, a finger or the keyboard.
 * All three change one piece of state: the `preview` of the event. The grid
 * draws the preview in place of the event, so the box moves and the other
 * boxes make room while the user drags. Nothing is saved until the drop.
 *
 * Pointer: the handlers for move and up are put on the window when the drag
 * starts, and taken off when it ends. They keep working when the box moves
 * to another day, which makes React draw it in another list. The CSS sets
 * `touch-action: none` on an event. Without it, the browser takes the touch
 * for scrolling and sends `pointercancel`.
 *
 * Keyboard: M on an event starts a move. The arrow keys move it by a quarter
 * of an hour or by a day, Shift with ArrowUp or ArrowDown changes its end,
 * Enter drops it and Escape puts it back.
 */
import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { dragEvent, SNAP_MINUTES } from "./dragEvent";
import type { DragMode } from "./dragEvent";
import { HOUR_HEIGHT } from "./layoutDay";
import type { CalendarEvent } from "./types";

/** A pointer must travel this many pixels before a press becomes a drag. Less is a click. */
const DRAG_THRESHOLD = 4;

export interface DragState {
  /** The event as it was when the drag began. */
  original: CalendarEvent;
  /** The event as it would be if the user dropped it now. */
  preview: CalendarEvent;
  by: "drag" | "keyboard";
}

export interface UseEventDragOptions {
  timeZone: string;
  /** The width of one day column in pixels, measured when it is needed. */
  getDayWidth: () => number;
  /** True in a right-to-left page, where the next day is on the left. */
  isRtl: () => boolean;
  /** Called on a drop that changed the event. */
  onDrop: (edited: CalendarEvent, original: CalendarEvent, by: "drag" | "keyboard") => void;
}

const sameTimes = (a: CalendarEvent, b: CalendarEvent) => a.start === b.start && a.end === b.end;

export function useEventDrag(options: UseEventDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Takes the window handlers of a pointer drag off again. */
  const stopPointer = useRef<() => void>(() => {});
  /** True right after a drop. The click that the browser sends then must not open the form. */
  const swallowClick = useRef(false);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  // A drag that is still going when the calendar is removed must not leave handlers on the window.
  useEffect(() => () => stopPointer.current(), []);

  function drop(state: DragState) {
    setDrag(null);
    if (!sameTimes(state.preview, state.original)) {
      latest.current.onDrop(state.preview, state.original, state.by);
    }
  }

  function onPointerDown(pointerEvent: ReactPointerEvent<HTMLElement>, event: CalendarEvent) {
    // Only the main button of a mouse starts a drag. A finger and a pen report button 0 too.
    if (pointerEvent.button !== 0) {
      return;
    }
    const target = pointerEvent.target as Element;
    const mode: DragMode = target.closest("[data-resize]") === null ? "move" : "resize";
    const origin = { x: pointerEvent.clientX, y: pointerEvent.clientY };
    let state: DragState | null = null;
    swallowClick.current = false;
    stopPointer.current();

    const move = (moveEvent: PointerEvent) => {
      const [dx, dy] = [moveEvent.clientX - origin.x, moveEvent.clientY - origin.y];
      if (state === null && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }
      const dayWidth = latest.current.getDayWidth();
      const direction = latest.current.isRtl() ? -1 : 1;
      const days = mode === "move" && dayWidth > 0 ? Math.round(dx / dayWidth) * direction : 0;
      const minutes = (dy / HOUR_HEIGHT) * 60;
      const preview = dragEvent(event, mode, minutes, days, latest.current.timeZone);
      state = { original: event, preview, by: "drag" };
      setDrag(state);
    };
    const end = (isDrop: boolean) => {
      stop();
      if (state !== null) {
        // The browser sends a click right after the pointer goes up. That click
        // is not a click. A moment later the flag is off again, in case the
        // pointer went up outside the box and no click came.
        swallowClick.current = true;
        setTimeout(() => {
          swallowClick.current = false;
        }, 0);
        if (isDrop) {
          drop(state);
        } else {
          setDrag(null);
        }
      }
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (keyEvent: globalThis.KeyboardEvent) => keyEvent.key === "Escape" && cancel();
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      stopPointer.current = () => {};
    };
    stopPointer.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
  }

  /** Returns true when the key belonged to a move, so the caller does nothing more with it. */
  function onKeyDown(keyEvent: KeyboardEvent<HTMLElement>, event: CalendarEvent): boolean {
    const isMoving = drag?.by === "keyboard" && drag.original.id === event.id;
    if (!isMoving) {
      const isPlainM = keyEvent.key.toLowerCase() === "m" && !keyEvent.ctrlKey && !keyEvent.metaKey;
      if (isPlainM && !keyEvent.altKey) {
        keyEvent.preventDefault();
        setDrag({ original: event, preview: event, by: "keyboard" });
      }
      return isPlainM;
    }
    const direction = latest.current.isRtl() ? -1 : 1;
    const steps: Record<string, [minutes: number, days: number]> = {
      ArrowUp: [-SNAP_MINUTES, 0],
      ArrowDown: [SNAP_MINUTES, 0],
      ArrowLeft: [0, -direction],
      ArrowRight: [0, direction],
    };
    const step = steps[keyEvent.key];
    if (step !== undefined) {
      // Shift changes the end. A sideways step with Shift does nothing.
      const [minutes, days] = step;
      const mode: DragMode = keyEvent.shiftKey ? "resize" : "move";
      const preview =
        mode === "resize" && days !== 0
          ? drag.preview
          : dragEvent(drag.preview, mode, minutes, days, latest.current.timeZone);
      setDrag({ ...drag, preview });
    } else if (keyEvent.key === "Enter") {
      drop(drag);
    } else if (keyEvent.key === "Escape") {
      setDrag(null);
    } else {
      // Tab and the other keys work as usual. Leaving the event cancels the move (see onBlur).
      return false;
    }
    // Enter must not also click the button, and the arrows must not scroll the page.
    keyEvent.preventDefault();
    return true;
  }

  /** Focus left the event that is being moved with the keyboard: the move is cancelled. */
  function onBlur(focusEvent: FocusEvent<HTMLElement>, event: CalendarEvent) {
    // `relatedTarget` is null when the box was only drawn again in another day. That is not leaving.
    const isMoving = drag?.by === "keyboard" && drag.original.id === event.id;
    if (isMoving && focusEvent.relatedTarget !== null) {
      setDrag(null);
    }
  }

  /** True once after a pointer drag ended: the click that follows it is not a click. */
  function consumeClick(): boolean {
    const swallow = swallowClick.current;
    swallowClick.current = false;
    return swallow;
  }

  return { drag, onPointerDown, onKeyDown, onBlur, consumeClick };
}
