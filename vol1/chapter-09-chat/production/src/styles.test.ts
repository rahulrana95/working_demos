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
    expect(css).toMatch(/\.chat button,[^{]*{[^}]*min-block-size: 44px/);
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

  it("gives an image a fixed box, so a slow image does not move the list", () => {
    expect(css).toMatch(/\.message__image\s*{[^}]*block-size: 150px/);
    expect(css).toMatch(/\.message__image\s*{[^}]*object-fit: cover/);
  });

  it("keeps the height of the typing line when it is empty, so the text box does not move", () => {
    expect(css).toMatch(/\.chat__typing\s*{[^}]*min-block-size: 24px/);
  });

  it("underlines a link in a message, so it is not marked by colour alone", () => {
    expect(css).toMatch(/\.message a\s*{[^}]*text-decoration: underline/);
  });

  it("marks the open conversation with a border, and keeps it in high-contrast mode", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(css).toMatch(/button\[aria-current="true"\]\s*{[^}]*border-inline-start-color/);
    expect(highContrast).toMatch(
      /button\[aria-current="true"\]\s*{\s*border-inline-start-color: Highlight/,
    );
  });

  it("hides the file field for the eye only, and shows the keyboard focus on its label", () => {
    expect(css).toMatch(/\.visually-hidden\s*{[^}]*clip-path: inset\(50%\)/);
    expect(css).not.toMatch(/\.visually-hidden\s*{[^}]*display: none/);
    expect(css).toMatch(/\.composer__attach:focus-within[^{]*{[^}]*outline: 2px solid/);
  });

  it("makes the conversation buttons and the image button at least 44px tall", () => {
    expect(css).toMatch(
      /\.conversations button,\s*\.composer__attach\s*{[^}]*min-block-size: 44px/,
    );
  });
});
