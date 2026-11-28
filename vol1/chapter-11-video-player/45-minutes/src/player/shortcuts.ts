/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * The player has keyboard shortcuts. This function says when a key press is
 * not a shortcut, because the focused control needs that key itself.
 */

export function controlOwnsKey(target: Element, key: string): boolean {
  // Space and Enter press a focused button.
  if (target.matches("button")) {
    return key === " " || key === "Enter";
  }
  // The arrows, Home and End move a focused slider.
  if (target.matches("input[type=range]")) {
    return key.startsWith("Arrow") || key === "Home" || key === "End";
  }
  // In a text field every key is text. "k" must type a "k".
  return target.matches("input, textarea, select, [contenteditable]");
}
