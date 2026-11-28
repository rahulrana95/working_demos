/*
 * NOT PART OF THE INTERVIEW.
 * The component needs a few CSS rules to work as described. These tests
 * fail when one of them is removed.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  const css = withoutComments(styles);

  it("makes the list scroll, and switches off the scroll anchoring of the browser", () => {
    expect(css).toMatch(/\.chat__log\s*{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.chat__log\s*{[^}]*overflow-anchor: none/);
  });

  it("keeps the line breaks of a message and breaks a very long word", () => {
    expect(css).toMatch(/\.message__text\s*{[^}]*white-space: pre-wrap/);
    expect(css).toMatch(/\.message__text\s*{[^}]*overflow-wrap: anywhere/);
  });

  it("keeps the text of the text box at 16px or more, so Safari on iPhone does not zoom", () => {
    expect(css).toMatch(/\.composer textarea\s*{[^}]*font-size: max\(16px, 1rem\)/);
  });

  it("makes every button at least 44px tall, so a finger can hit it", () => {
    expect(css).toMatch(/\.chat button\s*{[^}]*min-block-size: 44px/);
  });

  it("gives the bar above the list a fixed height, so the list does not move when its text changes", () => {
    expect(css).toMatch(/\.chat__older\s*{[^}]*min-block-size: 60px/);
  });

  it("shows the focus on the list with an outline, which high-contrast mode keeps", () => {
    expect(css).toMatch(/\.chat__log:focus-visible\s*{[^}]*outline: 2px solid/);
  });

  it("marks a failed message with a broken border, not only with a colour", () => {
    expect(css).toMatch(/\.message:has\(button\)\s*{[^}]*border-style: dashed/);
  });

  it("uses logical properties only, so the layout mirrors itself from right to left", () => {
    const chatRules = withoutComments(styles.split("/* ---------- Demo panel")[0]);

    expect(css).toMatch(/\.message--mine\s*{[^}]*margin-inline: auto 0/);
    expect(chatRules).not.toMatch(
      /(margin|padding|border)-(left|right)|[^-](left|right):|text-align: (left|right)/,
    );
  });

  it("marks my own messages with a thicker border in high-contrast mode, where the colours are gone", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(/\.message--mine\s*{\s*border-inline-end-width: 4px/);
  });
});
