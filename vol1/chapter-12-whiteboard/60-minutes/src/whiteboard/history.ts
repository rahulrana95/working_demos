/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * Two stacks. Say the three rules aloud while you write them:
 *   1. A new command goes on the undo stack and empties the redo stack.
 *   2. Undo moves the top entry to the redo stack and applies its inverse.
 *   3. Redo moves it back and applies the command again.
 *
 * Why it holds at scale: the undo stack never holds more than `limit`
 * entries, so a board that stays open all day does not grow without end.
 */
import { apply, invert } from "./commands";
import type { Command } from "./commands";
import type { Scene } from "./scene";

export interface HistoryEntry {
  command: Command;
  inverse: Command;
}

/** The document: the scene and its history. The three functions below return a new one. */
export interface Doc {
  scene: Scene;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export const DEFAULT_HISTORY_LIMIT = 100;

/** Runs a command and remembers how to take it back. */
export function execute(doc: Doc, command: Command, limit = DEFAULT_HISTORY_LIMIT): Doc {
  const scene = apply(doc.scene, command);
  // A command that changed nothing must not cost the user an undo step.
  if (scene === doc.scene) {
    return doc;
  }
  const entry = { command, inverse: invert(command, doc.scene) };
  // slice(-limit) drops the oldest entries when the stack is too long.
  return { scene, undoStack: [...doc.undoStack, entry].slice(-limit), redoStack: [] };
}

export function undo(doc: Doc): Doc {
  const entry = doc.undoStack[doc.undoStack.length - 1];
  if (entry === undefined) {
    return doc;
  }
  const scene = apply(doc.scene, entry.inverse);
  return { scene, undoStack: doc.undoStack.slice(0, -1), redoStack: [...doc.redoStack, entry] };
}

export function redo(doc: Doc): Doc {
  const entry = doc.redoStack[doc.redoStack.length - 1];
  if (entry === undefined) {
    return doc;
  }
  const scene = apply(doc.scene, entry.command);
  return { scene, undoStack: [...doc.undoStack, entry], redoStack: doc.redoStack.slice(0, -1) };
}
