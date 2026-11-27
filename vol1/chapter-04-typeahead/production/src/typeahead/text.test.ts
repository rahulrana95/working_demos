/*
 * NOT PART OF THE INTERVIEW: production version.
 * These tests prove that the typed text is cleaned and counted correctly.
 */
import { countGraphemes, normaliseQuery } from "./text";

describe("normaliseQuery", () => {
  it("removes the spaces around the text", () => {
    expect(normaliseQuery("  pune  ")).toBe("pune");
  });

  it("turns many spaces, tabs and line breaks into one space", () => {
    expect(normaliseQuery("new \t\n  delhi")).toBe("new delhi");
  });

  it("makes the text lower case", () => {
    expect(normaliseQuery("New DELHI", "en")).toBe("new delhi");
  });

  it("uses the lower case rules of the given language", () => {
    // Turkish has two letters "i": with a dot and without a dot.
    expect(normaliseQuery("ISPARTA", "tr")).toBe("ısparta");
    expect(normaliseQuery("ISPARTA", "en")).toBe("isparta");
  });

  it("gives one form to a letter that can be stored in two ways", () => {
    const oneCode = "café";
    const letterPlusAccent = "café";

    expect(letterPlusAccent).not.toBe(oneCode);
    expect(normaliseQuery(letterPlusAccent)).toBe(oneCode);
  });

  it("returns an empty text for only spaces", () => {
    expect(normaliseQuery("   ")).toBe("");
  });
});

describe("countGraphemes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts “ab” as 2", () => {
    expect(countGraphemes("ab")).toBe(2);
  });

  it("counts the Hindi “दि” as 1, although it is two code units", () => {
    expect("दि").toHaveLength(2);
    expect(countGraphemes("दि")).toBe(1);
  });

  it("counts an emoji with a skin tone as 1", () => {
    expect("👍🏽".length).toBeGreaterThan(1);
    expect(countGraphemes("👍🏽")).toBe(1);
  });

  it("counts an empty text as 0", () => {
    expect(countGraphemes("")).toBe(0);
  });

  it("still counts in a browser without Intl.Segmenter", () => {
    vi.stubGlobal("Intl", { Segmenter: undefined });

    expect(countGraphemes("ab")).toBe(2);
    expect(countGraphemes("😀")).toBe(1);
  });
});
