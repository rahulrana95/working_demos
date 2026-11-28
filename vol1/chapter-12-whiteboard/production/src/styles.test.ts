/*
 * NOT PART OF THE INTERVIEW.
 * This test proves the rules in the CSS that the whiteboard cannot work without.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  const css = withoutComments(styles);

  it("stops the browser from scrolling the page when a finger drags on the canvas", () => {
    expect(css).toMatch(/\.whiteboard__canvas\s*{[^}]*touch-action: none/);
  });

  it("marks the chosen tool with a thicker border, not with a colour alone", () => {
    expect(css).toMatch(/button\[aria-pressed="true"\]\s*{[^}]*border-width: 4px/);
    expect(css).not.toMatch(/button\[aria-pressed="true"\]\s*{[^}]*box-shadow/);
  });

  it("keeps the size of a tool button the same when it is chosen", () => {
    // 2px border + 8px padding is the same as 4px border + 6px padding.
    expect(css).toMatch(/\nbutton\s*{[^}]*padding: 8px 14px;[^}]*border: 2px solid/);
    expect(css).toMatch(/button\[aria-pressed="true"\]\s*{[^}]*padding: 6px 12px/);
  });

  it("marks a button that cannot be used with a dashed border", () => {
    expect(css).toMatch(/button\[aria-disabled="true"\]\s*{[^}]*border-style: dashed/);
  });

  it("makes every button at least 44px in both directions, so a finger can hit it", () => {
    expect(css).toMatch(/\nbutton\s*{[^}]*min-height: 44px;[^}]*min-width: 44px/);
  });

  it("shows where the keyboard focus is, on buttons and on the canvas", () => {
    expect(css).toMatch(
      /button:focus-visible,\s*\.whiteboard__canvas:focus-visible\s*{[^}]*outline: 3px solid/,
    );
  });

  it("uses logical properties, so the layout mirrors itself in right-to-left languages", () => {
    expect(css).toMatch(/margin-block-end/);
    expect(css).toMatch(/padding-inline-start/);
    expect(css).not.toMatch(/(margin|padding)-(left|right)/);
  });

  it("lets the canvas follow the width of its box", () => {
    expect(css).toMatch(/\.whiteboard__canvas\s*{[^}]*inline-size: 100%/);
  });

  it("keeps the colour of a swatch in high-contrast mode, because the user chose that colour", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(/\.whiteboard__swatch\s*{\s*forced-color-adjust: none/);
  });

  it("uses system colours for the chosen and the unusable button in high-contrast mode", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(/aria-pressed="true"\]\s*{\s*border-color: Highlight/);
    expect(highContrast).toMatch(/aria-disabled="true"\]\s*{[^}]*GrayText/);
  });
});
