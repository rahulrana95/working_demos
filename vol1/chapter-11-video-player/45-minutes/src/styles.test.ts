/*
 * NOT PART OF THE INTERVIEW.
 * This test proves the parts of the player that only the CSS can do:
 * the spinner waits 300 ms, and state is not shown by colour alone.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  const css = withoutComments(styles);

  it("draws the spinner only while loading or buffering, and only after 300 ms", () => {
    const rule =
      /\.player\[data-status="loading"\]::after,\s*\.player\[data-status="buffering"\]::after\s*{[^}]*}/;
    const spinner = css.match(rule)?.[0] ?? "";

    expect(spinner).toMatch(/player-appear 0s linear 300ms both/);
    expect(css).toMatch(/@keyframes player-appear\s*{\s*from\s*{\s*visibility: hidden/);
    expect(css).not.toMatch(/\.player\[data-status="playing"\]::after/);
  });

  it("shows the keyboard focus with a real outline on the player, its buttons and its sliders", () => {
    expect(css).toMatch(
      /\.player:focus-visible,\s*\.player button:focus-visible,\s*\.player input:focus-visible\s*{[^}]*outline: 3px solid/,
    );
  });

  it("shows a pressed Mute button with a thicker border, not by colour alone", () => {
    expect(css).toMatch(/button\[aria-pressed="true"\]\s*{[^}]*border-width: 3px/);
  });

  it("keeps the seek bar and its thumb visible in high-contrast mode, with real borders", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(css).toMatch(/slider-runnable-track\s*{[^}]*border: 1px solid/);
    expect(highContrast).toMatch(/slider-runnable-track\s*{\s*border-color: ButtonText/);
    expect(highContrast).toMatch(/slider-thumb\s*{[^}]*border-color: ButtonText/);
  });

  it("makes every button and slider at least 44px tall, so a finger can hit it", () => {
    expect(css).toMatch(/\.player button\s*{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.player input\[type="range"\]\s*{[^}]*height: 44px/);
  });

  it("keeps the text of the buttons at 16px or more", () => {
    expect(css).toMatch(/\.player button\s*{[^}]*font-size: max\(16px, 1em\)/);
  });

  it("keeps the shape of the player before the video loads, so the page does not jump", () => {
    expect(css).toMatch(/\.player\s*{[^}]*aspect-ratio: 16 \/ 9/);
  });
});
