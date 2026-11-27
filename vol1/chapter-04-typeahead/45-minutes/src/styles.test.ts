/*
 * NOT PART OF THE INTERVIEW.
 * This test proves the active row can be seen in high-contrast mode.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
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

  it("keeps the text of the input at 16px or more, so Safari on iPhone does not zoom", () => {
    expect(withoutComments(styles)).toMatch(
      /\.typeahead__input\s*{[^}]*font-size: max\(16px, 1em\)/,
    );
  });

  it("makes every row at least 44px tall, so a finger can hit it", () => {
    expect(withoutComments(styles)).toMatch(/\.typeahead__option\s*{[^}]*min-height: 44px/);
  });

  it("lets the host app set the stacking order of the popup, with 10 as the default", () => {
    expect(withoutComments(styles)).toMatch(
      /\.typeahead__popup\s*{[^}]*z-index: var\(--typeahead-z-index, 10\)/,
    );
  });
});
