/*
 * NOT PART OF THE INTERVIEW: production version.
 * This test proves that the carets of other people can be seen in
 * high-contrast mode, and that the two layers of the field have the same box.
 */
/// <reference types="vite/client" />
import styles from "./styles.css?raw";

/** Removes the comments, so words in a comment do not count. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles", () => {
  const css = withoutComments(styles);

  it("gives the textarea and the caret layer one rule for their box, font and line breaks", () => {
    const shared = css.match(/\.collab-editor__input,\s*\.collab-editor__presence\s*{([^}]*)}/);

    for (const property of ["padding", "border", "font-family", "font-size", "line-height"]) {
      expect(shared?.[1]).toContain(`${property}:`);
    }
    expect(shared?.[1]).toContain("white-space: pre-wrap");
    expect(shared?.[1]).toContain("overflow-wrap: break-word");
  });

  it("keeps the text at 16px or more, so Safari on iPhone does not zoom", () => {
    expect(css).toMatch(/\.collab-editor__presence\s*{[^}]*font-size: max\(16px, 1em\)/);
  });

  it("draws a caret of another person with a real border, not a shadow", () => {
    expect(css).toMatch(/\.collab-editor__caret\s*{[^}]*border-inline-start: 2px solid/);
    expect(css).not.toMatch(/\.collab-editor__caret\s*{[^}]*box-shadow/);
  });

  it("marks a selection of another person with a line, not with colour alone", () => {
    expect(css).toMatch(/\.collab-editor__presence mark\s*{[^}]*border-block-end: 2px solid/);
  });

  it("uses the system colours for carets and selections in high-contrast mode", () => {
    const highContrast = css.split("@media (forced-colors: active)")[1];

    expect(highContrast).toMatch(
      /\.collab-editor__caret\s*{\s*border-inline-start-color: Highlight/,
    );
    expect(highContrast).toMatch(/mark\s*{\s*border-block-end-color: Highlight/);
  });

  it("uses logical properties, so the layout mirrors in right-to-left languages", () => {
    const editor = css.slice(css.indexOf(".collab-editor__label"));

    expect(editor).not.toMatch(/(margin|padding|border)-(left|right)\b/);
    expect(editor).not.toMatch(/[^-](left|right):/);
  });
});
