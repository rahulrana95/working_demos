/*
 * NOT PART OF THE INTERVIEW: production version.
 * One pure function still holds every rule of the board. On top of the
 * 60-minute answer it has: freehand lines, colours, resize with the keyboard,
 * a pan tool, the list limit, several users (see sync.ts) and an undo that
 * only touches the user's own work.
 *
 * Why it holds at scale: a drag keeps ONE pending command and replaces it on
 * every pointer move. The history, and the server, get that command once,
 * when the pointer is released.
 */
import { apply, invert, stepOnCurrentScene } from "./commands";
import type { Command } from "./commands";
import { hitTest, shapesNear } from "./grid";
import { DEFAULT_HISTORY_LIMITS, EMPTY_HISTORY, makeEntry, record, shift } from "./history";
import type { History, HistoryLimits } from "./history";
import type { Presence } from "./presence";
import { EMPTY_SCENE, makePath, makeRect } from "./scene";
import type { Point, Scene, ShapeKind } from "./scene";
import { isFarEnough, simplifyPath } from "./simplify";
import { addLocal, createSync, receive } from "./sync";
import type { Operation, SyncState } from "./sync";
import { toBoard, zoomAt } from "./view";
import type { View } from "./view";

export type Tool = "select" | "rect" | "pen" | "hand";

/** The last thing that happened, as data. The component turns it into words. */
export interface Change {
  /**
   * "skipped": an undo or redo had nothing left to do, because someone else
   * changed or removed the shape. "refused": the board is full.
   */
  how: "done" | "undone" | "redone" | "skipped" | "refused";
  what: Command["type"];
  /** The kind of the shape, or null when the shape was already gone. */
  kind: ShapeKind | null;
  /** How many steps the user can still undo. */
  steps: number;
}

export interface BoardLimits extends HistoryLimits {
  /** No shape can be added by this user when the board holds this many. */
  maxShapes: number;
}

export const DEFAULT_LIMITS: BoardLimits = { ...DEFAULT_HISTORY_LIMITS, maxShapes: 20_000 };

export interface BoardState {
  userId: string;
  sync: SyncState;
  /** This user's own commands only. */
  history: History;
  limits: BoardLimits;
  tool: Tool;
  /** The colour of new shapes. */
  stroke: string;
  /** May name a shape that is gone. Every user of it allows for that. */
  selectedId: string | null;
  /**
   * The drag in progress, or null. `last` is the last pointer position on the
   * canvas, `points` the board positions of a freehand line so far, and
   * `pending` the command the drag would run if the pointer were released now.
   */
  drag: { start: Point; last: Point; points: Point[]; pending: Command | null } | null;
  /** Grows by one with every operation. Ids are "<user>-<number>", so no two users make the same id. */
  nextId: number;
  lastChange: Change | null;
  view: View;
  /** The size of the canvas in CSS pixels. The component reports it. */
  size: { width: number; height: number };
  /** The other users, by user id. */
  peers: Record<string, Presence>;
  /** How often someone else changed a shape that this user was changing too. */
  conflictCount: number;
}

/** Every `point` is a position on the canvas, as the browser reports it. */
export type BoardAction =
  | { type: "tool"; tool: Tool }
  | { type: "stroke"; stroke: string }
  | { type: "select"; id: string }
  | { type: "down" | "drag"; point: Point }
  | { type: "up" | "cancel" | "undo" | "redo" | "remove" | "add" }
  | { type: "nudge" | "grow"; dx: number; dy: number; at: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; factor: number; point?: Point }
  | { type: "resize"; width: number; height: number }
  | { type: "remote"; seq: number; operation: Operation }
  | { type: "presence"; presence: Presence }
  | { type: "peerLeft"; userId: string };

export const STROKES = ["#1c1f23", "#b42318", "#1a56db"];
const NUDGE_STEP = 10;
const KEY_ZOOM = 1.25;
/** A new point of a freehand line must be this far from the last one, in screen pixels. */
const PEN_MIN_DISTANCE = 2;
/** A finished freehand line may differ this much from what was drawn, in screen pixels. */
const PEN_TOLERANCE = 0.75;
/** These go on while a drag is in progress. Everything else waits. */
const ALLOWED_IN_DRAG = ["drag", "up", "cancel", "resize", "remote", "presence", "peerLeft"];

export class SceneTooLargeError extends Error {
  constructor(
    readonly shapeCount: number,
    readonly maxShapes: number,
  ) {
    super(`The scene has ${shapeCount} shapes. The limit is ${maxShapes}.`);
    this.name = "SceneTooLargeError";
  }
}

export interface BoardOptions {
  userId: string;
  scene?: Scene;
  /** The sequence number the scene belongs to, when it came from the server. */
  lastSeq?: number;
  limits?: Partial<BoardLimits>;
}

/** Throws SceneTooLargeError when the scene has more shapes than `limits.maxShapes`. */
export function createBoard(options: BoardOptions): BoardState {
  const { userId, scene = EMPTY_SCENE, lastSeq = 0 } = options;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  if (scene.order.length > limits.maxShapes) {
    throw new SceneTooLargeError(scene.order.length, limits.maxShapes);
  }
  // Only this user's own ids count: "<user>-<number>".
  const ownNumbers = scene.order
    .filter((id) => id.startsWith(`${userId}-`))
    .map((id) => Number(id.slice(userId.length + 1)) || 0);
  return {
    userId,
    sync: createSync(scene, lastSeq),
    history: EMPTY_HISTORY,
    limits,
    tool: "select",
    stroke: STROKES[0],
    selectedId: null,
    drag: null,
    nextId: Math.max(0, ...ownNumbers) + 1,
    lastChange: null,
    view: { x: 0, y: 0, scale: 1 },
    size: { width: 0, height: 0 },
    peers: {},
    conflictCount: 0,
  };
}

/** The scene to draw: what the user sees, plus the drag that is not finished yet. */
export function previewScene({ sync, drag }: BoardState): Scene {
  return drag?.pending ? apply(sync.scene, drag.pending) : sync.scene;
}

/** The ids of the shapes to draw: only those near the part of the board that is in view. */
export function visibleIds({ sync, drag, view, size }: BoardState): string[] {
  const inView = { ...view, width: size.width / view.scale, height: size.height / view.scale };
  const ids = shapesNear(sync.scene, inView);
  // A shape that is still being drawn is not in the scene, so add it by hand.
  return drag?.pending?.type === "add" ? [...ids, drag.pending.shape.id] : ids;
}

function centre({ size }: BoardState): Point {
  return { x: size.width / 2, y: size.height / 2 };
}

/** Notes what happened to the shape of `command`. Call it with the scene from before the step. */
function note(scene: Scene, how: Change["how"], command: Command, history: History) {
  const kind =
    command.type === "add" ? command.shape.kind : (scene.shapesById[command.id]?.kind ?? null);
  return {
    history,
    lastChange: { how, what: command.type, kind, steps: history.undoStack.length },
  };
}

/** Shows the command at once and queues it for the server. The history is the caller's job. */
function send(state: BoardState, command: Command): BoardState {
  const operation = { id: `${state.userId}-${state.nextId}`, userId: state.userId, command };
  return { ...state, sync: addLocal(state.sync, operation), nextId: state.nextId + 1, drag: null };
}

/** Runs one new command of this user: one operation and one history entry. */
function commit(state: BoardState, command: Command, nudgedAt?: number): BoardState {
  const { scene } = state.sync;
  const isFull = command.type === "add" && scene.order.length >= state.limits.maxShapes;
  if (isFull) {
    return { ...state, ...note(scene, "refused", command, state.history), drag: null };
  }
  // A command that changes nothing is not sent and costs no undo step.
  if (apply(scene, command) === scene) {
    return { ...state, drag: null };
  }
  const entry = makeEntry(command, invert(command, scene), nudgedAt);
  const history = record(state.history, entry, state.limits);
  const selectedId = command.type === "add" ? command.shape.id : state.selectedId;
  return { ...send(state, command), ...note(scene, "done", command, history), selectedId };
}

/** Undo or redo of this user's own last command, as a new operation. */
function travel(state: BoardState, direction: "undo" | "redo"): BoardState {
  const stack = direction === "undo" ? state.history.undoStack : state.history.redoStack;
  const entry = stack[stack.length - 1];
  if (entry === undefined) {
    return state;
  }
  const [wanted, opposite] =
    direction === "undo" ? [entry.inverse, entry.command] : [entry.command, entry.inverse];
  // Others may have changed the scene since. Keep only the part that is still ours.
  const { scene } = state.sync;
  const step = stepOnCurrentScene(wanted, opposite, scene);
  if (step === null) {
    // The entry is dropped: it can never do anything again.
    const history = shift(state.history, direction, false);
    return { ...state, ...note(scene, "skipped", entry.command, history) };
  }
  const how = direction === "undo" ? "undone" : "redone";
  const history = shift(state.history, direction, true);
  return { ...send(state, step), ...note(scene, how, entry.command, history) };
}

function dragTo(state: BoardState, canvasPoint: Point): BoardState {
  const { drag, tool, view, selectedId, stroke } = state;
  if (drag === null) {
    return state;
  }
  const from = toBoard(view, drag.start);
  const to = toBoard(view, canvasPoint);
  const next = { ...drag, last: canvasPoint };
  const id = `${state.userId}-${state.nextId}`;
  const index = state.sync.scene.order.length;

  if (tool === "hand") {
    // The board follows the pointer, and the next move is measured from here.
    const moved = { ...view, x: view.x + from.x - to.x, y: view.y + from.y - to.y };
    return { ...state, view: moved, drag: { ...next, start: canvasPoint } };
  }
  if (tool === "rect") {
    const shape = makeRect(id, from, to, stroke);
    return { ...state, drag: { ...next, pending: { type: "add", shape, index } } };
  }
  if (tool === "pen") {
    // The distance filter: a point very near the last one adds nothing the eye can see.
    const lastPoint = drag.points[drag.points.length - 1];
    if (!isFarEnough(lastPoint, to, PEN_MIN_DISTANCE / view.scale)) {
      return { ...state, drag: next };
    }
    const points = [...drag.points, to];
    const shape = makePath(id, points, stroke);
    return { ...state, drag: { ...next, points, pending: { type: "add", shape, index } } };
  }
  if (selectedId === null) {
    return { ...state, drag: next };
  }
  const pending: Command = { type: "move", id: selectedId, dx: to.x - from.x, dy: to.y - from.y };
  return { ...state, drag: { ...next, pending } };
}

function release(state: BoardState): BoardState {
  const { drag, view } = state;
  const pending = drag?.pending ?? null;
  if (drag === null || pending === null) {
    return { ...state, drag: null };
  }
  if (pending.type === "move" && pending.dx === 0 && pending.dy === 0) {
    return { ...state, drag: null };
  }
  if (pending.type === "add" && pending.shape.kind === "path") {
    // The line is finished: now drop the points that a straight piece can stand in for.
    const points = simplifyPath(drag.points, PEN_TOLERANCE / view.scale);
    const shape = makePath(pending.shape.id, points, pending.shape.stroke);
    return commit(state, { ...pending, shape });
  }
  return commit(state, pending);
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  const { drag, selectedId, tool, view, sync } = state;
  // While a drag is in progress, only the drag itself and messages from
  // outside may change the board. So Ctrl+Z, Delete, the wheel or a second
  // pointer in the middle of a drag do nothing.
  if (drag !== null && !ALLOWED_IN_DRAG.includes(action.type)) {
    return state;
  }
  const selected = selectedId === null ? undefined : sync.scene.shapesById[selectedId];

  switch (action.type) {
    case "tool":
      return { ...state, tool: action.tool };
    case "stroke": {
      const withStroke = { ...state, stroke: action.stroke };
      // With a shape selected, a colour button also colours that shape.
      return selected === undefined
        ? withStroke
        : commit(withStroke, {
            type: "restyle",
            id: selected.id,
            patch: { stroke: action.stroke },
          });
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "resize":
      return { ...state, size: { width: action.width, height: action.height } };
    case "zoom":
      // Without a pointer position, zoom around the middle of the canvas.
      return { ...state, view: zoomAt(view, action.point ?? centre(state), action.factor) };
    case "pan": {
      const { x, y } = toBoard(view, { x: -action.dx, y: -action.dy });
      return { ...state, view: { ...view, x, y } };
    }
    case "down": {
      const boardPoint = toBoard(view, action.point);
      const hitId = tool === "select" ? hitTest(sync.scene, boardPoint, view.scale) : selectedId;
      const { point } = action;
      return {
        ...state,
        selectedId: hitId,
        drag: { start: point, last: point, points: [boardPoint], pending: null },
      };
    }
    case "drag":
      return dragTo(state, action.point);
    case "up":
      return release(state);
    case "cancel":
      return { ...state, drag: null };
    case "undo":
    case "redo":
      return travel(state, action.type);
    case "remove":
      return selected === undefined ? state : commit(state, { type: "remove", id: selected.id });
    case "nudge":
      // With no shape to move, the arrow keys move the view: a keyboard user needs a way to pan.
      return selected === undefined
        ? boardReducer(state, { type: "pan", dx: -action.dx, dy: -action.dy })
        : commit(state, { type: "move", id: selected.id, dx: action.dx, dy: action.dy }, action.at);
    case "grow": {
      // Shift and an arrow key: the keyboard way to resize. Only a rectangle can be resized.
      if (selected === undefined || selected.kind !== "rect") {
        return state;
      }
      const patch = {
        width: Math.max(1, selected.width + action.dx),
        height: Math.max(1, selected.height + action.dy),
      };
      return commit(state, { type: "resize", id: selected.id, patch }, action.at);
    }
    case "add": {
      if (tool !== "rect") {
        return state;
      }
      // The keyboard way to draw: a rectangle of a fixed size in the middle of the view.
      const { x, y } = toBoard(view, centre(state));
      const id = `${state.userId}-${state.nextId}`;
      const shape = makeRect(id, { x: x - 60, y: y - 40 }, { x: x + 60, y: y + 40 }, state.stroke);
      return commit(state, { type: "add", shape, index: sync.scene.order.length });
    }
    case "remote": {
      const result = receive(sync, action.seq, action.operation);
      const conflictCount = state.conflictCount + (result.isConflict ? 1 : 0);
      return result.sync === sync ? state : { ...state, sync: result.sync, conflictCount };
    }
    case "presence":
      return { ...state, peers: { ...state.peers, [action.presence.userId]: action.presence } };
    case "peerLeft": {
      const { [action.userId]: _gone, ...peers } = state.peers;
      return { ...state, peers };
    }
  }
}

type KeyPress = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "timeStamp">;

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
    return { type: event.shiftKey ? "grow" : "nudge", dx, dy, at: event.timeStamp };
  }
  if (key === "+" || key === "=" || key === "-") {
    return { type: "zoom", factor: key === "-" ? 1 / KEY_ZOOM : KEY_ZOOM };
  }
  const isRemove = key === "delete" || key === "backspace";
  const type = isRemove ? "remove" : key === "escape" ? "cancel" : key === "enter" ? "add" : null;
  return type === null ? null : { type };
}
