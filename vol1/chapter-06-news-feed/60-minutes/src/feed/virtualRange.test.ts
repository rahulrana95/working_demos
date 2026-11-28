/*
 * NOT PART OF THE INTERVIEW.
 * The arithmetic of the virtual list, tested with plain numbers.
 */
import { getVirtualRange } from "./virtualRange";

/** Ten rows of 100px each, on a screen of 250px. */
const uniform = () => 100;

describe("getVirtualRange", () => {
  it("draws nothing for an empty list", () => {
    expect(getVirtualRange(0, uniform, 0, 250, 2)).toEqual({
      start: 0,
      end: 0,
      spaceBefore: 0,
      spaceAfter: 0,
    });
    expect(getVirtualRange(0, uniform, 9000, 250, 2).end).toBe(0);
  });

  it("draws the rows on screen at the top of the list", () => {
    const range = getVirtualRange(10, uniform, 0, 250, 0);

    // Rows 0, 1 and 2 touch the first 250px.
    expect(range).toMatchObject({ start: 0, end: 3, spaceBefore: 0, spaceAfter: 700 });
  });

  it("adds the overscan rows above and below the screen", () => {
    const range = getVirtualRange(10, uniform, 400, 250, 2);

    // Rows 4, 5 and 6 are on screen. Two more are drawn on each side.
    expect(range).toMatchObject({ start: 2, end: 9, spaceBefore: 200, spaceAfter: 100 });
  });

  it("does not go past the first or the last row", () => {
    expect(getVirtualRange(10, uniform, 0, 250, 5).start).toBe(0);
    expect(getVirtualRange(10, uniform, 800, 250, 5)).toMatchObject({ end: 10, spaceAfter: 0 });
  });

  it("keeps the total height the same wherever the screen is", () => {
    const heights = [80, 300, 120, 450, 90, 200, 310, 75, 260, 140];
    const heightOf = (index: number) => heights[index];
    const total = heights.reduce((sum, height) => sum + height, 0);

    for (let viewportTop = 0; viewportTop < total; viewportTop += 37) {
      const range = getVirtualRange(10, heightOf, viewportTop, 400, 1);
      const drawn = heights.slice(range.start, range.end).reduce((sum, height) => sum + height, 0);

      expect(range.spaceBefore + drawn + range.spaceAfter).toBe(total);
    }
  });

  it("uses the real height of every row, not one height for all", () => {
    const heights = [500, 50, 50, 50, 500];

    const range = getVirtualRange(5, (index) => heights[index], 520, 100, 0);

    // 520 to 620 covers rows 1, 2 and 3 (500 to 650).
    expect(range).toMatchObject({ start: 1, end: 4, spaceBefore: 500, spaceAfter: 500 });
  });

  it("does not draw a row that ends exactly at the top of the screen", () => {
    expect(getVirtualRange(10, uniform, 300, 100, 0)).toMatchObject({ start: 3, end: 4 });
  });

  it("starts at the first row when the list begins below the top of the screen", () => {
    // The top of the screen is 150px above the list, for example over a page header.
    const range = getVirtualRange(10, uniform, -150, 600, 0);

    expect(range).toMatchObject({ start: 0, end: 5, spaceBefore: 0 });
  });

  it("keeps the last rows when the screen is below the whole list", () => {
    const range = getVirtualRange(10, uniform, 5000, 250, 2);

    expect(range).toMatchObject({ start: 7, end: 10, spaceAfter: 0 });
  });

  it("keeps the first rows when the screen is above the whole list", () => {
    const range = getVirtualRange(10, uniform, -5000, 250, 2);

    expect(range).toMatchObject({ start: 0, end: 3, spaceBefore: 0 });
  });

  it("draws a bounded number of rows however long the list is", () => {
    const range = getVirtualRange(100_000, uniform, 5_000_000, 800, 3);

    // 800px of 100px rows is 8 or 9 rows, plus 3 on each side.
    expect(range.end - range.start).toBeLessThanOrEqual(15);
  });
});
