/*
 * NOT PART OF THE INTERVIEW: production version.
 * What the whiteboard reports to analytics and monitoring.
 *
 * An event never holds what the user drew: no positions, no points, no
 * colours, no shape ids and no user ids. It holds what kind of thing
 * happened, counts and times.
 */
import type { BoardAction, BoardState } from "./board";
import type { ShapeKind } from "./scene";

export type BoardEvent =
  | { type: "shape_created"; kind: ShapeKind }
  /** `applied` is false when nothing was left to do because someone else changed the shape. */
  | { type: "undo" | "redo"; applied: boolean }
  | { type: "sync_conflict" }
  | { type: "scene_too_large"; shapeCount: number }
  | { type: "save"; ok: boolean; size: number }
  | { type: "reconnect"; resent: number }
  /** A sample, not every frame: how long one redraw took and how many shapes it drew. */
  | { type: "frame"; drawMs: number; shapesDrawn: number };

/** The events for one step of the reducer: what changed between the two states. */
export function eventsFor(
  previous: BoardState,
  next: BoardState,
  action: BoardAction,
): BoardEvent[] {
  const events: BoardEvent[] = [];
  if (next === previous) {
    return events;
  }
  const how = next.lastChange !== previous.lastChange ? next.lastChange?.how : undefined;
  const newest = next.history.undoStack[next.history.undoStack.length - 1]?.command;

  if (how === "done" && newest?.type === "add") {
    events.push({ type: "shape_created", kind: newest.shape.kind });
  }
  if (action.type === "undo" || action.type === "redo") {
    events.push({ type: action.type, applied: how !== "skipped" });
  }
  if (how === "refused") {
    events.push({ type: "scene_too_large", shapeCount: next.sync.scene.order.length });
  }
  if (next.conflictCount > previous.conflictCount) {
    events.push({ type: "sync_conflict" });
  }
  return events;
}
