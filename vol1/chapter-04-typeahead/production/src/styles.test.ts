/*
 * NOT PART OF THE INTERVIEW.
 * This test proves the styles can be mirrored for right-to-left languages.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words like "left" in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  it("uses no left or right, so the layout works in right-to-left languages", () => {
    const physicalSide = /\b(left|right)\b/;

    expect(withoutComments(styles)).not.toMatch(physicalSide);
  });

  it("puts the bar of the active row at the start of the line", () => {
    expect(withoutComments(styles)).toMatch(/\.is-active\s*{[^}]*border-inline-start/);
  });
});
