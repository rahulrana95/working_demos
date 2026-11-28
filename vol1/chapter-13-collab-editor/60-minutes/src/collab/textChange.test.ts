/* NOT PART OF THE INTERVIEW. Tests for the step from "new text" to "what changed". */
import { createRandom, pickIndex } from "./testHelpers";
import { diffText } from "./textChange";

describe("diffText", () => {
  it("finds one typed character", () => {
    expect(diffText("helo", "hello", 4)).toEqual({ start: 3, removed: 0, inserted: "l" });
  });

  it("uses the caret to find a character typed in a run of equal characters", () => {
    expect(diffText("aaa", "aaaa", 1)).toEqual({ start: 0, removed: 0, inserted: "a" });
    expect(diffText("aaa", "aaaa", 2)).toEqual({ start: 1, removed: 0, inserted: "a" });
    expect(diffText("aaa", "aaaa", 4)).toEqual({ start: 3, removed: 0, inserted: "a" });
  });

  it("uses the caret to find a character deleted in a run of equal characters", () => {
    expect(diffText("aaa", "aa", 0)).toEqual({ start: 0, removed: 1, inserted: "" });
    expect(diffText("aaa", "aa", 1)).toEqual({ start: 1, removed: 1, inserted: "" });
    expect(diffText("aaa", "aa", 2)).toEqual({ start: 2, removed: 1, inserted: "" });
  });

  it("finds a selection that was replaced by typed text", () => {
    expect(diffText("hello world", "hello x", 7)).toEqual({ start: 6, removed: 5, inserted: "x" });
  });

  it("finds a pasted text", () => {
    expect(diffText("ad", "abcd", 3)).toEqual({ start: 1, removed: 0, inserted: "bc" });
  });

  it("finds a deleted range", () => {
    expect(diffText("abcdef", "af", 1)).toEqual({ start: 1, removed: 4, inserted: "" });
  });

  it("gives an empty change when nothing changed", () => {
    expect(diffText("abc", "abc", 2)).toEqual({ start: 2, removed: 0, inserted: "" });
  });

  it("handles an empty old text and an empty new text", () => {
    expect(diffText("", "abc", 3)).toEqual({ start: 0, removed: 0, inserted: "abc" });
    expect(diffText("abc", "", 0)).toEqual({ start: 0, removed: 3, inserted: "" });
  });

  it("still gives a correct change when the caret is wrong or outside the text", () => {
    for (const caret of [-5, 0, 2, 99]) {
      const change = diffText("hello", "help", caret);
      const rebuilt =
        "hello".slice(0, change.start) +
        change.inserted +
        "hello".slice(change.start + change.removed);

      expect(rebuilt).toBe("help");
    }
  });

  it("always gives a change that turns the old text into the new one (2,000 random pairs)", () => {
    const random = createRandom(7);
    const randomText = () =>
      Array.from({ length: pickIndex(random, 8) }, () => "ab"[pickIndex(random, 2)]).join("");

    for (let round = 0; round < 2000; round += 1) {
      const oldText = randomText();
      const newText = randomText();
      const change = diffText(oldText, newText, pickIndex(random, newText.length + 1));
      const rebuilt =
        oldText.slice(0, change.start) +
        change.inserted +
        oldText.slice(change.start + change.removed);

      expect(rebuilt).toBe(newText);
      expect(change.removed).toBeGreaterThanOrEqual(0);
    }
  });
});
