/*
 * PART OF THE INTERVIEW: yes (about 5 minutes).
 * Write it after the CRDT. A textarea only tells us its new text, so we
 * compare it with the old text to learn what the user did.
 */
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
