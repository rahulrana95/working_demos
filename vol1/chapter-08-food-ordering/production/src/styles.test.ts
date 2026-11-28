/*
 * NOT PART OF THE INTERVIEW: production version.
 * These tests prove that state can be seen without colour, and that a finger
 * can hit the buttons.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
const css = styles.replace(/\/\*[\s\S]*?\*\//g, "");

describe("styles", () => {
  it("makes the cart buttons at least 44px wide and tall, so a finger can hit them", () => {
    expect(css).toMatch(/\.stepper__button\s*{[^}]*min-width: 44px/);
    expect(css).toMatch(/\.stepper__button\s*{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.button\s*{[^}]*min-height: 44px/);
  });

  it("marks a button that cannot be used with a real border, not with colour alone", () => {
    expect(css).toMatch(/\.button\[aria-disabled="true"\]\s*{[^}]*border-style: dashed/);
  });

  it("marks the current step with a real border, which high-contrast mode keeps", () => {
    const currentStep = /\.steps__step\[aria-current="step"\]\s*{([^}]*)}/.exec(css)?.[1] ?? "";

    expect(currentStep).toMatch(/border-inline-start-color/);
    expect(currentStep).not.toMatch(/box-shadow/);
  });

  it("hides the bar of a normal step in high-contrast mode and shows the current one", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(/\.steps__step\s*{\s*border-inline-start-color: Canvas/);
    expect(highContrast).toMatch(
      /\.steps__step\[aria-current="step"\]\s*{\s*border-inline-start-color: Highlight/,
    );
  });

  it("marks a finished step with a check mark, not with colour alone", () => {
    expect(css).toMatch(
      /\.steps__step:has\(~ \[aria-current="step"\]\)::before\s*{\s*content: "✓ "/,
    );
  });

  it("keeps the focused row above the sticky cart bar", () => {
    expect(css).toMatch(/scroll-padding-block-end: var\(--cart-bar-space\)/);
    expect(css).toMatch(/\.cart-bar\s*{[^}]*position: sticky/);
  });

  it("keeps the text of every input at 16px or more, so Safari on iPhone does not zoom", () => {
    expect(css).toMatch(
      /\.menu-search__input,\s*\.stepper__input\s*{[^}]*font-size: max\(16px, 1em\)/,
    );
  });

  it("makes the quantity field and the category links 44px tall", () => {
    expect(css).toMatch(/\.stepper__input\s*{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.category-nav__link\s*{[^}]*min-height: 44px/);
  });

  it("marks the current category with a real border, also in high-contrast mode", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(css).toMatch(
      /\.category-nav__link\[aria-current="true"\]\s*{[^}]*border-block-end-color/,
    );
    expect(highContrast).toMatch(
      /\.category-nav__link\[aria-current="true"\]\s*{\s*border-block-end-color: Highlight/,
    );
  });

  it("gives the picture of a dish a box of a fixed shape, so the page does not jump", () => {
    expect(css).toMatch(/\.menu-item__image\s*{[^}]*aspect-ratio: 1/);
  });

  it("lets the browser skip the drawing of categories that are far from the screen", () => {
    expect(css).toMatch(/\.menu-category\s*{[^}]*content-visibility: auto/);
    expect(css).toMatch(/\.menu-category\s*{[^}]*contain-intrinsic-size: auto/);
  });

  it("uses no physical left or right, so the layout mirrors in right-to-left languages", () => {
    expect(css).not.toMatch(
      /(margin|padding|border)-(left|right)|[^-](left|right):|text-align: (left|right)/,
    );
  });

  it("keeps a category that the user jumps to below the sticky category links", () => {
    expect(css).toMatch(/scroll-padding-block-start: var\(--category-nav-space\)/);
  });
});
