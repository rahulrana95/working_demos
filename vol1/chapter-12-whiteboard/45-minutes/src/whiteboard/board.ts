/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * One pure function holds every rule of the board: tools, drags, keys, undo.
 * Write it after history.ts and before the component.
 *
 * Why it holds at scale: a drag keeps ONE pending command and replaces it on
 * every pointer move. The history gets that command once, when the pointer
 * is released. So a drag of 500 moves is one undo step, not 500.
 */
import { apply } from "./commands";
import type { Command } from "./commands";
import { execute, redo, undo } from "./history";
import type { Doc } from "./history";
import { hitTest, makeRect } from "./scene";
import type { Point, Scene } from "./scene";

export type Tool = "select" | "rect";

export interface BoardState {
  doc: Doc;
  tool: Tool;
  /** May name a shape that an undo has removed. Every user of it allows for that. */
  selectedId: string | null;
  /**
   * The drag in progress, or null. `pending` is the command the drag would
   * run if the pointer were released now.
   */
  drag: { start: Point; pending: Command | null } | null;
  /** Grows by one with every command. A new shape takes it as its id, so no id repeats. */
  nextId: number;
  /** The last change, in words, for screen readers. */
  status: string;
}

export type BoardAction =
  | { type: "tool"; tool: Tool }
  | { type: "down" | "drag"; point: Point }
  | { type: "up" | "cancel" | "undo" | "redo" | "remove" | "add" }
  | { type: "nudge"; dx: number; dy: number };

const NUDGE_STEP = 10;

export function createBoard(scene: Scene = { shapesById: {}, order: [] }): BoardState {
  const doc = { scene, undoStack: [], redoStack: [] };
  // Ids that are not numbers count as 0, so a new id never repeats an old one.
  const nextId = Math.max(0, ...scene.order.map((id) => Number(id) || 0)) + 1;
  return { doc, tool: "select", selectedId: null, drag: null, nextId, status: "" };
}

/** The scene to draw: the saved scene plus the drag that is not finished yet. */
export function previewScene({ doc, drag }: BoardState): Scene {
  return drag?.pending ? apply(doc.scene, drag.pending) : doc.scene;
}

/** Runs one command as one history entry, and ends any drag. A new shape becomes selected. */
function commit(state: BoardState, command: Command): BoardState {
  const doc = execute(state.doc, command);
  const selectedId = command.type === "add" ? command.shape.id : state.selectedId;
  const status = doc === state.doc ? state.status : say("Done", command, doc);
  return { ...state, doc, drag: null, selectedId, nextId: state.nextId + 1, status };
}

/** The count makes two equal messages in a row differ, so a screen reader reads both. */
function say(word: string, { type }: Command, { undoStack }: Doc): string {
  return `${word}: ${type} rectangle. Steps to undo: ${undoStack.length}.`;
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  const { doc, drag, selectedId, tool } = state;
  // While a drag is in progress, only the drag itself may change the board.
  // So Ctrl+Z, Delete or a second pointer in the middle of a drag do nothing.
  if (drag !== null && !["drag", "up", "cancel"].includes(action.type)) {
    return state;
  }
  const id = String(state.nextId);
  const index = doc.scene.order.length;

  switch (action.type) {
    case "tool":
      return { ...state, tool: action.tool };
    case "down": {
      const hitId = tool === "select" ? hitTest(doc.scene, action.point) : selectedId;
      return { ...state, selectedId: hitId, drag: { start: action.point, pending: null } };
    }
    case "drag": {
      if (drag === null) {
        return state;
      }
      const { start } = drag;
      const { point } = action;
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
      return { ...state, doc: next, status: say(isUndo ? "Undid" : "Redid", command, next) };
    }
    case "remove":
      return selectedId === null ? state : commit(state, { type: "remove", id: selectedId });
    case "nudge":
      return selectedId === null
        ? state
        : commit(state, { ...action, type: "move", id: selectedId });
    case "add": {
      // The keyboard way to draw: a rectangle of a fixed size at a fixed place.
      const shape = makeRect(id, { x: 40, y: 40 }, { x: 160, y: 120 });
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
