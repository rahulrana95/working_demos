/*
 * PART OF THE INTERVIEW: yes (about 8 minutes).
 * Write it after the CRDT. A textarea only tells us its new text, so we
 * compare it with the old text to learn what the user did.
 */
import type { Rga } from "./rga";
import type { Op } from "./types";

export interface TextChange {
  /** Where the change starts. */
  start: number;
  /** How many characters were removed there. */
  removed: number;
  /** The text that was put there. */
  inserted: string;
}

/**
 * Finds the one range that changed between two texts.
 *
 * The caret is the hint that makes it exact. After a key press, the text to
 * the right of the caret is the text the user did not touch. Without the
 * hint, a typed "a" in "aaa" could be any of four places, and each place
 * is another id.
 */
export function diffText(oldText: string, newText: string, caret: number): TextChange {
  const untouchedRight = Math.max(0, newText.length - caret);
  const maxSuffix = Math.min(oldText.length, newText.length, untouchedRight);
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const maxStart = Math.min(oldText.length, newText.length) - suffix;
  let start = 0;
  while (start < maxStart && oldText[start] === newText[start]) {
    start += 1;
  }

  return {
    start,
    removed: oldText.length - suffix - start,
    inserted: newText.slice(start, newText.length - suffix),
  };
}

/**
 * Turns the new text of the textarea into operations, and applies them to
 * the document. Returns the operations to send.
 */
export function applyTextChange(doc: Rga, newText: string, caret: number): Op[] {
  const change = diffText(doc.text(), newText, caret);
  const ids = doc.ids();

  const ops: Op[] = ids
    .slice(change.start, change.start + change.removed)
    .map((id) => doc.delete(id));

  // Each new character goes after the one before it. One element is one
  // UTF-16 unit, the same unit a textarea counts its caret in.
  let left = change.start === 0 ? null : ids[change.start - 1];
  for (let index = 0; index < change.inserted.length; index += 1) {
    const op = doc.insertAfter(left, change.inserted[index]);
    ops.push(op);
    left = op.id;
  }
  return ops;
}
