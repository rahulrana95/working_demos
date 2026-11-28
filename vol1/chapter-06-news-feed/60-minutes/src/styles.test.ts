/*
 * NOT PART OF THE INTERVIEW.
 * This test proves the styles can be mirrored for right-to-left languages,
 * and that the rules the feed depends on are there.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words like "left" in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** `.visually-hidden` is the one rule that must use width and height: it hides text. */
function withoutVisuallyHidden(css: string): string {
  return css.replace(/\.visually-hidden\s*{[^}]*}/, "");
}

describe("styles", () => {
  const css = withoutComments(styles);

  it("uses no left or right, so the layout works in right-to-left languages", () => {
    expect(css).not.toMatch(/\b(left|right)\b/);
  });

  it("uses no physical width, height, top or bottom outside the hidden-text rule", () => {
    expect(withoutVisuallyHidden(css)).not.toMatch(
      /(^|[\s;{])(min-|max-)?(width|height|top|bottom)\s*:/,
    );
    expect(css).not.toMatch(/(margin|padding|border)-(top|bottom)/);
  });

  it("puts the space between two posts inside the post, so its measured height holds it", () => {
    expect(css).toMatch(/\.post\s*{[^}]*border-block-end: 8px solid/);
    expect(css).not.toMatch(/\.post\s*{[^}]*margin/);
  });

  it("switches off the scroll anchoring of the browser for the list, because the feed does it", () => {
    expect(css).toMatch(/\.feed__list\s*{[^}]*overflow-anchor: none/);
  });

  it("makes the image fill the box that keeps its shape", () => {
    expect(css).toMatch(/\.post__media img\s*{[^}]*block-size: 100%/);
    expect(css).toMatch(/\.post__media img\s*{[^}]*object-fit: cover/);
  });

  it("makes every button at least 44px tall, so a finger can hit it", () => {
    for (const selector of ["post__like", "feed__more"]) {
      expect(css).toMatch(new RegExp(`\\.${selector}\\s*{[^}]*min-block-size: 44px`));
    }
  });

  it("marks a pressed like button with a border and a tick, not with colour alone", () => {
    expect(css).toMatch(/\.post__like\[aria-pressed="true"\]\s*{[^}]*border-color/);
    expect(css).toMatch(/\.post__like\[aria-pressed="true"\]::before\s*{[^}]*content/);
  });

  it("keeps the mark of a pressed button in high-contrast mode", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(
      /\.post__like\[aria-pressed="true"\]\s*{\s*border-color: Highlight/,
    );
  });

  it("shows the keyboard focus on a post with an outline", () => {
    expect(css).toMatch(/\.post:focus-visible\s*{[^}]*outline: 3px solid/);
  });
});
