/* NOT PART OF THE INTERVIEW. Tests for the step from "new text" to operations. */
import { Rga } from "./rga";
import { createRandom, pickIndex } from "./testHelpers";
import { applyTextChange, diffText } from "./textChange";

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

describe("applyTextChange", () => {
  it("makes one insert operation for each typed character, each after the one before", () => {
    const doc = new Rga("a");

    const ops = applyTextChange(doc, "hi", 2);

    expect(doc.text()).toBe("hi");
    expect(ops).toEqual([
      { type: "insert", id: { site: "a", counter: 1 }, after: null, char: "h" },
      {
        type: "insert",
        id: { site: "a", counter: 2 },
        after: { site: "a", counter: 1 },
        char: "i",
      },
    ]);
  });

  it("makes a delete operation with the id of the character, not its index", () => {
    const doc = new Rga("a");
    applyTextChange(doc, "abc", 3);

    const ops = applyTextChange(doc, "ac", 1);

    expect(ops).toEqual([{ type: "delete", id: { site: "a", counter: 2 } }]);
  });

  it("deletes the selection and inserts the new text when a selection is replaced", () => {
    const doc = new Rga("a");
    applyTextChange(doc, "hello world", 11);

    const ops = applyTextChange(doc, "hello you", 9);

    expect(doc.text()).toBe("hello you");
    expect(ops.map((op) => op.type)).toEqual([
      "delete",
      "delete",
      "delete",
      "delete",
      "delete",
      "insert",
      "insert",
      "insert",
    ]);
  });

  it("makes no operation when the text did not change", () => {
    const doc = new Rga("a");
    applyTextChange(doc, "abc", 3);

    expect(applyTextChange(doc, "abc", 1)).toEqual([]);
  });

  it("keeps an emoji whole: its two halves are two characters next to each other", () => {
    const doc = new Rga("a");

    const ops = applyTextChange(doc, "a😀b", 4);

    expect(ops).toHaveLength(4);
    expect(doc.text()).toBe("a😀b");
  });

  it("gives another site the same text when it applies the operations", () => {
    const a = new Rga("a");
    const b = new Rga("b");

    for (const [text, caret] of [
      ["hello", 5],
      ["help", 4],
      ["yelp", 1],
      ["", 0],
      ["नमस्ते", 6],
    ] as const) {
      applyTextChange(a, text, caret).forEach((op) => b.apply(op));
      expect(b.text()).toBe(text);
    }
  });
});
