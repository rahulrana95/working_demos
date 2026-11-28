/*
 * NOT PART OF THE INTERVIEW.
 * These tests read the CSS text. They prove the rules that the calendar
 * needs for touch, for iPhone and for high-contrast mode are there.
 */
/// <reference types="vite/client" />
import { HOUR_HEIGHT } from "./calendar";
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  const css = withoutComments(styles);

  it("makes a slot as tall as one hour of the layout, which is more than 44px", () => {
    expect(css).toMatch(
      new RegExp(`\\[role="gridcell"\\] > button\\s*{[^}]*height: ${HOUR_HEIGHT}px`),
    );
    expect(HOUR_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it("marks an event with a real border, which high-contrast mode keeps", () => {
    expect(css).toMatch(/\.calendar li > button\s*{[^}]*border: 1px solid/);
    expect(css.split("@media (forced-colors: active)")[1]).toMatch(
      /\.calendar li > button\s*{\s*border-color: ButtonText/,
    );
  });

  it("shows focus with an outline, not with a shadow", () => {
    expect(css).toMatch(/button:focus-visible[^{]*{[^}]*outline: 3px solid/);
    expect(css).not.toMatch(/box-shadow/);
  });

  it("lets a click between two events fall through to the slot under the list", () => {
    expect(css).toMatch(/\.calendar ol\s*{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.calendar li\s*{[^}]*pointer-events: auto/);
  });

  it("keeps a strip free beside the events, so a slot can be clicked in a full hour", () => {
    expect(css).toMatch(/\.calendar ol\s*{[^}]*inset-inline: 72px 16px/);
  });

  it("keeps the text of the inputs at 16px or more, so Safari on iPhone does not zoom", () => {
    expect(css).toMatch(/\.calendar form input\s*{[^}]*font-size: max\(16px, 1em\)/);
  });

  it("makes the inputs and the buttons of the form at least 44px tall, so a finger can hit them", () => {
    expect(css).toMatch(/\.calendar form input\s*{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.calendar form button,[^{]*{[^}]*min-height: 44px/);
  });

  it("marks an error with a border, not by colour alone", () => {
    expect(css).toMatch(/\.calendar \[role="alert"\]\s*{[^}]*border: 1px solid/);
  });
});
