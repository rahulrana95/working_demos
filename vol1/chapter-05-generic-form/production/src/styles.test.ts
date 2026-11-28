/*
 * NOT PART OF THE INTERVIEW: production version.
 * This test proves that an error and the busy button can be seen in
 * high-contrast mode, where shadows and background colours are removed.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  it("never uses a box-shadow, which high-contrast mode removes", () => {
    expect(withoutComments(styles)).not.toMatch(/box-shadow/);
  });

  it("marks a control in error with a thicker real border", () => {
    const css = withoutComments(styles);

    expect(css).toMatch(/\.field__input\[aria-invalid="true"\]\s*{[^}]*border: 3px solid/);
  });

  it("gives every field the same bar and padding, so the text does not move on an error", () => {
    const css = withoutComments(styles);

    expect(css).toMatch(/\.field\s*{[^}]*border-inline-start: 3px solid transparent/);
    expect(css).not.toMatch(/\.field\.is-invalid\s*{[^}]*padding/);
  });

  it("hides the bar of a normal field in high-contrast mode and shows the one in error", () => {
    const highContrast = withoutComments(styles).split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(/\.field\s*{\s*border-inline-start-color: Canvas/);
    expect(highContrast).toMatch(/\.field\.is-invalid\s*{\s*border-inline-start-color: Highlight/);
  });

  it("shows keyboard focus with an outline on every control and on the button", () => {
    const css = withoutComments(styles);

    expect(css).toMatch(
      /\.field__input:focus-visible,\s*\.field__checkbox:focus-visible,\s*\.form__submit:focus-visible\s*{[^}]*outline: 3px solid/,
    );
    expect(css).not.toMatch(/outline:\s*(none|0)/);
  });

  it("marks the busy button with its border style, not with colour alone", () => {
    const css = withoutComments(styles);

    expect(css).toMatch(/\.form__submit\[aria-busy="true"\]\s*{[^}]*border-style: dashed/);
  });

  it("marks the current step with a solid border and bold text, not with colour alone", () => {
    const css = withoutComments(styles);

    expect(css).toMatch(/\.steps__step\s*{[^}]*border: 2px dashed/);
    expect(css).toMatch(
      /\.steps__step\[aria-current="step"\]\s*{[^}]*border-style: solid[^}]*font-weight: 600/,
    );
  });

  it("marks the “Add” button at its limit with its border style, not with colour alone", () => {
    expect(withoutComments(styles)).toMatch(
      /\.group__button\[aria-disabled="true"\]\s*{[^}]*border-style: dashed/,
    );
  });

  it("makes the buttons of a group and “Back” at least 44px tall, so a finger can hit them", () => {
    expect(withoutComments(styles)).toMatch(
      /\.group__button,\s*\.form__back,\s*\.panel__button\s*{[^}]*min-height: 44px/,
    );
  });
});
