/*
 * NOT PART OF THE INTERVIEW.
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
});
