/* NOT PART OF THE INTERVIEW: production version. Tests for the pieces of the caret layer. */
import type { PeerCaret } from "./engine";
import { presenceParts } from "./presence";

const peer = (name: string, start: number, end = start): PeerCaret => ({
  site: name.toLowerCase(),
  name,
  start,
  end,
});

describe("presenceParts", () => {
  it("is the whole text in one part when nobody else is here", () => {
    expect(presenceParts("hello", [])).toEqual([{ carets: [], text: "hello", selected: false }]);
  });

  it("puts a caret before the text that follows it", () => {
    const ravi = peer("Ravi", 2);

    expect(presenceParts("hello", [ravi])).toEqual([
      { carets: [], text: "he", selected: false },
      { carets: [ravi], text: "llo", selected: false },
    ]);
  });

  it("puts a caret at the start and at the end of the text", () => {
    const atStart = peer("A", 0);
    const atEnd = peer("B", 5);

    expect(presenceParts("hello", [atStart, atEnd])).toEqual([
      { carets: [atStart], text: "hello", selected: false },
      { carets: [atEnd], text: "", selected: false },
    ]);
  });

  it("marks the text inside a selection, and puts the caret at its end", () => {
    const ravi = peer("Ravi", 6, 11);

    expect(presenceParts("hello world!", [ravi])).toEqual([
      { carets: [], text: "hello ", selected: false },
      { carets: [], text: "world", selected: true },
      { carets: [ravi], text: "!", selected: false },
    ]);
  });

  it("puts two carets at the same place in one part", () => {
    const a = peer("A", 3);
    const b = peer("B", 3);

    expect(presenceParts("hello", [a, b])[1].carets).toEqual([a, b]);
  });

  it("handles selections that overlap", () => {
    const parts = presenceParts("abcdefgh", [peer("A", 1, 5), peer("B", 3, 7)]);

    expect(parts.map((part) => part.text)).toEqual(["a", "bc", "de", "fg", "h"]);
    expect(parts.map((part) => part.selected)).toEqual([false, true, true, true, false]);
  });

  it("gives back every character of the text exactly once", () => {
    const text = "the quick brown fox";
    const parts = presenceParts(text, [peer("A", 4, 9), peer("B", 0), peer("C", 19), peer("D", 7)]);

    expect(parts.map((part) => part.text).join("")).toBe(text);
  });

  it("handles an empty text", () => {
    const ravi = peer("Ravi", 0);

    expect(presenceParts("", [ravi])).toEqual([{ carets: [ravi], text: "", selected: false }]);
  });
});
