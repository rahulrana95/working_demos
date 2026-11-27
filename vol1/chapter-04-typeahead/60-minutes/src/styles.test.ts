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

  it("marks the active row with a real border, which high-contrast mode keeps", () => {
    const css = withoutComments(styles);

    expect(css).toMatch(/\.is-active\s*{[^}]*border-inline-start-color/);
    expect(css).not.toMatch(/\.is-active\s*{[^}]*box-shadow/);
  });

  it("gives every row the same border and padding, so the text does not move", () => {
    const css = withoutComments(styles);

    expect(css).toMatch(/\.typeahead__option\s*{[^}]*border-inline-start: 3px solid transparent/);
    expect(css).not.toMatch(/\.is-active\s*{[^}]*padding/);
  });

  it("hides the bar of a normal row in high-contrast mode and shows the active one", () => {
    const highContrast = withoutComments(styles).split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(/\.typeahead__option\s*{\s*border-inline-start-color: Canvas/);
    expect(highContrast).toMatch(/\.is-active\s*{\s*border-inline-start-color: Highlight/);
  });
});
