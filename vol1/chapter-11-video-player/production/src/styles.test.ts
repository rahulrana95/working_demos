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
    expect(css).toMatch(/\.player button\s*{[^}]*min-block-size: 44px/);
    expect(css).toMatch(/\.player input\[type="range"\]\s*{[^}]*block-size: 44px/);
  });

  it("keeps the text of the buttons at 16px or more", () => {
    expect(css).toMatch(/\.player button\s*{[^}]*font-size: max\(16px, 1em\)/);
  });

  it("places the captions above the bar of controls, so the controls never cover them", () => {
    const captions = css.match(/\.player__captions\s*{[^}]*}/)?.[0] ?? "";

    // 100% is the height of the bar of controls below the captions.
    expect(captions).toMatch(/inset-block-end: calc\(100% \+ 8px\)/);
    expect(captions).toMatch(/border: 1px solid transparent/);
    expect(css).toMatch(/\.player__bottom\s*{[^}]*inset-block-end: 0/);
  });

  it("uses logical properties, so the layout mirrors itself in a right-to-left language", () => {
    expect(css).not.toMatch(
      /[\s;{](left|right|top|bottom|width|height|margin-left|margin-right|padding-left|padding-right):/,
    );
    expect(css).toMatch(/\[dir="rtl"\] \.player__seek::-webkit-slider-runnable-track/);
  });

  it("hides the controls when the user is idle, but never while one has the focus or the mouse", () => {
    const rule =
      /\.player\[data-idle="true"\] \.player__controls:not\(:focus-within, :hover\)\s*{[^}]*}/;
    const hidden = css.match(rule)?.[0] ?? "";

    // Transparent, not removed: Tab still reaches the controls and brings them back.
    expect(hidden).toMatch(/opacity: 0/);
    expect(hidden).not.toMatch(/display: none|visibility: hidden/);
  });

  it("stops the spinner from turning and the controls from fading for a user who asked for less motion", () => {
    const reducedMotion = css.split("@media (prefers-reduced-motion: reduce)")[1];

    expect(reducedMotion).toMatch(/animation: player-appear 0s linear 300ms both/);
    expect(reducedMotion).not.toMatch(/player-spin/);
    expect(reducedMotion).toMatch(/\.player__controls\s*{\s*transition: none/);
  });

  it("makes the menus at least 44px tall, with text of 16px or more", () => {
    expect(css).toMatch(/\.player__select\s*{[^}]*min-block-size: 44px/);
    expect(css).toMatch(/\.player__select\s*{[^}]*font-size: max\(16px, 1em\)/);
  });

  it("insets the layer of downloaded ranges by half a thumb, the number the code uses too", () => {
    expect(css).toMatch(/\.player__ranges\s*{[^}]*inset-inline: 9px/);
    expect(css).toMatch(/slider-thumb\s*{[^}]*inline-size: 18px/);
  });

  it("keeps the shape of the player before the video loads, so the page does not jump", () => {
    expect(css).toMatch(/\.player\s*{[^}]*aspect-ratio: 16 \/ 9/);
  });
});
