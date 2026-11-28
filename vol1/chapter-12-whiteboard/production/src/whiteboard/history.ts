/*
 * NOT PART OF THE INTERVIEW: production version.
 * The two stacks of ONE user. They hold only the commands this user ran, so
 * an undo can never take back the work of someone else. The interview
 * versions limit the stack by a count. This one also limits it by size,
 * because one freehand line can be larger than a thousand moves.
 */
import type { Command } from "./commands";

export interface HistoryEntry {
  command: Command;
  inverse: Command;
  /** The number of characters of the entry as JSON. A fair measure of its memory. */
  size: number;
  /** Set for a key press only: the time of the press. Quick repeats join into one entry. */
  nudgedAt?: number;
}

export interface History {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export interface HistoryLimits {
  /** The most entries the undo stack may hold. */
  maxEntries: number;
  /** The most characters of JSON the undo stack may hold. */
  maxSize: number;
}

export const DEFAULT_HISTORY_LIMITS: HistoryLimits = { maxEntries: 100, maxSize: 1_000_000 };
/** Key presses on one shape that follow each other this fast are one undo step. */
export const MERGE_WINDOW_MS = 600;

export const EMPTY_HISTORY: History = { undoStack: [], redoStack: [] };

export function makeEntry(command: Command, inverse: Command, nudgedAt?: number): HistoryEntry {
  return { command, inverse, size: JSON.stringify([command, inverse]).length, nudgedAt };
}

/** Drops the oldest entries until both limits hold. The newest entry always stays. */
function trim(stack: HistoryEntry[], limits: HistoryLimits): HistoryEntry[] {
  let first = Math.max(0, stack.length - limits.maxEntries);
  let size = 0;
  for (let index = first; index < stack.length; index++) {
    size += stack[index].size;
  }
  while (size > limits.maxSize && first < stack.length - 1) {
    size -= stack[first].size;
    first += 1;
  }
  return first === 0 ? stack : stack.slice(first);
}

/** Two moves or two patches of one shape, as one command. Null when they cannot be joined. */
function join(first: Command, second: Command): Command | null {
  if (first.type === "move" && second.type === "move" && first.id === second.id) {
    return { ...first, dx: first.dx + second.dx, dy: first.dy + second.dy };
  }
  if (first.type === "resize" && second.type === "resize" && first.id === second.id) {
    return { ...first, patch: { ...first.patch, ...second.patch } };
  }
  return null;
}

/**
 * Puts a new command on the undo stack and empties the redo stack.
 * A key press that quickly follows another key press on the same shape joins
 * the entry before it, so ten presses of an arrow key are one undo step.
 */
export function record(history: History, entry: HistoryEntry, limits: HistoryLimits): History {
  const top = history.undoStack[history.undoStack.length - 1];
  const isRepeat =
    top?.nudgedAt !== undefined &&
    entry.nudgedAt !== undefined &&
    entry.nudgedAt - top.nudgedAt < MERGE_WINDOW_MS;
  const joined = isRepeat ? join(top.command, entry.command) : null;
  // The joined inverse runs the newer inverse first, so it is joined in that order.
  const joinedInverse = isRepeat ? join(entry.inverse, top.inverse) : null;

  const undoStack =
    joined !== null && joinedInverse !== null
      ? [...history.undoStack.slice(0, -1), makeEntry(joined, joinedInverse, entry.nudgedAt)]
      : [...history.undoStack, entry];
  return { undoStack: trim(undoStack, limits), redoStack: [] };
}

/** Moves the top entry of one stack to the other, or drops it when `keep` is false. */
export function shift(history: History, direction: "undo" | "redo", keep: boolean): History {
  const [from, to] =
    direction === "undo"
      ? [history.undoStack, history.redoStack]
      : [history.redoStack, history.undoStack];
  const moved = keep ? [...to, from[from.length - 1]] : to;
  const rest = from.slice(0, -1);
  return direction === "undo"
    ? { undoStack: rest, redoStack: moved }
    : { undoStack: moved, redoStack: rest };
}
