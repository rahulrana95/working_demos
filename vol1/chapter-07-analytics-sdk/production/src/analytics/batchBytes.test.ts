/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove how many events go in one request.
 */
import { byteLength, countThatFit, MAX_BATCH_BYTES } from "./batchBytes";

describe("byteLength", () => {
  it("counts bytes, not characters: Hindi text takes three bytes for each character", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("कखग")).toBe(9);
    expect(byteLength("😀")).toBe(4);
    expect(byteLength("")).toBe(0);
  });
});

describe("countThatFit", () => {
  it("takes at most maxCount events", () => {
    expect(countThatFit(Array<number>(50).fill(100), 20)).toBe(20);
  });

  it("takes all events when there are fewer than maxCount", () => {
    expect(countThatFit([100, 100, 100], 20)).toBe(3);
    expect(countThatFit([], 20)).toBe(0);
  });

  it("stops before the bytes go over the limit, and counts the commas", () => {
    // 59 events of 1000 bytes with their commas are 59,059 bytes. The next one would cross 60,000.
    expect(countThatFit(Array<number>(100).fill(1000), 100)).toBe(59);
    expect(countThatFit([29_999, 29_999, 1], 20, MAX_BATCH_BYTES)).toBe(2);
    expect(countThatFit([29_999, 29_997, 1], 20, MAX_BATCH_BYTES)).toBe(3);
  });

  it("takes one event even when it is larger than the limit alone", () => {
    expect(countThatFit([100_000, 10, 10], 20)).toBe(1);
  });
});
