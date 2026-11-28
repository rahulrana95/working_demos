/*
 * PART OF THE INTERVIEW: yes (about 14 minutes).
 * One pure function holds every rule of the board: tools, drags, keys, undo,
 * and in this answer also the view. Write it after history.ts and before the
 * component.
 *
 * Why it holds at scale: a drag keeps ONE pending command and replaces it on
 * every pointer move. The history gets that command once, when the pointer
 * is released. So a drag of 500 moves is one undo step, not 500.
 */
import { apply } from "./commands";
import type { Command } from "./commands";
import { hitTest, shapesNear } from "./grid";
import { execute, redo, undo } from "./history";
import type { Doc } from "./history";
import { makeRect } from "./scene";
import type { Point, Scene } from "./scene";
import { toBoard, zoomAt } from "./view";
import type { View } from "./view";

export type Tool = "select" | "rect";

export interface BoardState {
  doc: Doc;
  tool: Tool;
  /** May name a shape that an undo has removed. Every user of it allows for that. */
  selectedId: string | null;
  /**
   * The drag in progress, or null. `start` is a position on the board.
   * `pending` is the command the drag would run if the pointer were released now.
   */
  drag: { start: Point; pending: Command | null } | null;
  /** Grows by one with every command. A new shape takes it as its id, so no id repeats. */
  nextId: number;
  /** The last change, as data. The component turns it into words for screen readers. */
  lastChange: { how: "done" | "undone" | "redone"; what: Command["type"]; steps: number } | null;
  view: View;
}

/** Every `point` is a position on the canvas, as the browser reports it. */
export type BoardAction =
  | { type: "tool"; tool: Tool }
  | { type: "down" | "drag"; point: Point }
  | { type: "up" | "cancel" | "undo" | "redo" | "remove" | "add" }
  | { type: "nudge" | "pan"; dx: number; dy: number }
  | { type: "zoom"; point: Point; factor: number };

const NUDGE_STEP = 10;
/** The size of the canvas in CSS pixels. This answer does not follow a canvas that changes size. */
export const CANVAS_SIZE = { width: 720, height: 420 };

export function createBoard(scene: Scene = { shapesById: {}, order: [] }): BoardState {
  const doc = { scene, undoStack: [], redoStack: [] };
  // Ids that are not numbers count as 0, so a new id never repeats an old one.
  const nextId = Math.max(0, ...scene.order.map((id) => Number(id) || 0)) + 1;
  const view = { x: 0, y: 0, scale: 1 };
  return { doc, tool: "select", selectedId: null, drag: null, nextId, lastChange: null, view };
}

/** The scene to draw: the saved scene plus the drag that is not finished yet. */
export function previewScene({ doc, drag }: BoardState): Scene {
  return drag?.pending ? apply(doc.scene, drag.pending) : doc.scene;
}

/** The ids of the shapes to draw: only those near the part of the board that is in view. */
export function visibleIds({ doc, drag, view }: BoardState): string[] {
  const { width, height } = CANVAS_SIZE;
  const ids = shapesNear(doc.scene, {
    ...view,
    width: width / view.scale,
    height: height / view.scale,
  });
  // A shape that is still being drawn is not in the saved scene, so add it by hand.
  return drag?.pending?.type === "add" ? [...ids, drag.pending.shape.id] : ids;
}

/** Runs one command as one history entry, and ends any drag. A new shape becomes selected. */
function commit(state: BoardState, command: Command): BoardState {
  const doc = execute(state.doc, command);
  const selectedId = command.type === "add" ? command.shape.id : state.selectedId;
  const done = { how: "done" as const, what: command.type, steps: doc.undoStack.length };
  const lastChange = doc === state.doc ? state.lastChange : done;
  return { ...state, doc, drag: null, selectedId, nextId: state.nextId + 1, lastChange };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  const { doc, drag, selectedId, tool, view } = state;
  // While a drag is in progress, only the drag itself may change the board.
  // So Ctrl+Z, Delete, the wheel or a second pointer in the middle of a drag do nothing.
  if (drag !== null && !["drag", "up", "cancel"].includes(action.type)) {
    return state;
  }
  const id = String(state.nextId);
  const index = doc.scene.order.length;

  switch (action.type) {
    case "tool":
      return { ...state, tool: action.tool };
    case "zoom":
      return { ...state, view: zoomAt(view, action.point, action.factor) };
    case "pan": {
      const { x, y } = toBoard(view, { x: -action.dx, y: -action.dy });
      return { ...state, view: { ...view, x, y } };
    }
    case "down": {
      const start = toBoard(view, action.point);
      const hitId = tool === "select" ? hitTest(doc.scene, start) : selectedId;
      return { ...state, selectedId: hitId, drag: { start, pending: null } };
    }
    case "drag": {
      if (drag === null) {
        return state;
      }
      const { start } = drag;
      const point = toBoard(view, action.point);
      const pending: Command | null =
        tool === "rect"
          ? { type: "add", shape: makeRect(id, start, point), index }
          : selectedId !== null
            ? { type: "move", id: selectedId, dx: point.x - start.x, dy: point.y - start.y }
            : null;
      return { ...state, drag: { start, pending } };
    }
    case "up": {
      const pending = drag?.pending ?? null;
      // A click, or a drag that ends where it began, is not a change.
      const isChange = pending?.type !== "move" || pending.dx !== 0 || pending.dy !== 0;
      return pending !== null && isChange ? commit(state, pending) : { ...state, drag: null };
    }
    case "cancel":
      return { ...state, drag: null };
    case "undo":
    case "redo": {
      const isUndo = action.type === "undo";
      const next = isUndo ? undo(doc) : redo(doc);
      if (next === doc) {
        return state;
      }
      // The entry that moved from one stack to the other.
      const { command } = (isUndo ? next.redoStack : next.undoStack).slice(-1)[0];
      const how = isUndo ? ("undone" as const) : ("redone" as const);
      const lastChange = { how, what: command.type, steps: next.undoStack.length };
      return { ...state, doc: next, lastChange };
    }
    case "remove":
      return selectedId === null ? state : commit(state, { type: "remove", id: selectedId });
    case "nudge":
      // With no shape to move, the arrow keys move the view: a keyboard user needs a way to pan.
      return selectedId === null
        ? boardReducer(state, { ...action, type: "pan", dx: -action.dx, dy: -action.dy })
        : commit(state, { ...action, type: "move", id: selectedId });
    case "add": {
      // The keyboard way to draw: a rectangle of a fixed size near the corner of the view.
      const shape = makeRect(
        id,
        toBoard(view, { x: 40, y: 40 }),
        toBoard(view, { x: 160, y: 120 }),
      );
      return tool === "rect" ? commit(state, { type: "add", shape, index }) : state;
    }
  }
}

type KeyPress = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">;

/** The action for a key press, or null when the key is not a shortcut. */
export function keyToAction(event: KeyPress): BoardAction | null {
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    const isRedo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey);
    return isRedo ? { type: "redo" } : key === "z" ? { type: "undo" } : null;
  }
  const dx = key === "arrowleft" ? -NUDGE_STEP : key === "arrowright" ? NUDGE_STEP : 0;
  const dy = key === "arrowup" ? -NUDGE_STEP : key === "arrowdown" ? NUDGE_STEP : 0;
  if (dx !== 0 || dy !== 0) {
    return { type: "nudge", dx, dy };
  }
  const isRemove = key === "delete" || key === "backspace";
  const type = isRemove ? "remove" : key === "escape" ? "cancel" : key === "enter" ? "add" : null;
  return type === null ? null : { type };
}
