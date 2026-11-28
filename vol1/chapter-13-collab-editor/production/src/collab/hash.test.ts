/* NOT PART OF THE INTERVIEW: production version. Tests for the text hash. */
import { hashText } from "./hash";

describe("hashText", () => {
  it("gives the known FNV-1a values", () => {
    expect(hashText("")).toBe(0x811c9dc5);
    expect(hashText("a")).toBe(0xe40c292c);
    expect(hashText("foobar")).toBe(0xbf9cf968);
  });

  it("gives the same number for the same text, and another for another text", () => {
    expect(hashText("hello world")).toBe(hashText("hello world"));
    expect(hashText("hello world")).not.toBe(hashText("hello wrold"));
  });

  it("reads every half of an emoji", () => {
    expect(hashText("😀")).not.toBe(hashText("😁"));
  });
});
