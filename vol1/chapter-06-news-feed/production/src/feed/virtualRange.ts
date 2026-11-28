/*
 * NOT PART OF THE INTERVIEW: production version.
 * The arithmetic of the virtual list, with no React and no DOM. It is the
 * same as in the staff answer.
 *
 * Why it holds at scale: one pass over the heights, a few additions per
 * post. For 10,000 posts that is far less than a millisecond. If a feed
 * ever holds millions of rows, keep running totals in a tree instead.
 */

export interface VirtualRange {
  /** The first row to draw. */
  start: number;
  /** One past the last row to draw. */
  end: number;
  /** The height of all rows before `start`. It becomes empty space above. */
  spaceBefore: number;
  /** The height of all rows from `end` on. It becomes empty space below. */
  spaceAfter: number;
  /** The first row that is on screen, or -1 for an empty list. */
  anchorIndex: number;
  /** How far the top of the screen is below the top of that row. */
  anchorOffset: number;
}

/** The distance from the top of the list to the top of row `index`. */
export function getRowTop(heightOf: (index: number) => number, index: number): number {
  let top = 0;
  for (let row = 0; row < index; row++) {
    top += heightOf(row);
  }
  return top;
}

/**
 * Says which rows to draw. `viewportTop` is the top of the screen, measured
 * from the top of the list. `overscan` rows are drawn above and below the
 * screen too, so a scroll shows ready rows and not empty space.
 */
export function getVirtualRange(
  count: number,
  heightOf: (index: number) => number,
  viewportTop: number,
  viewportHeight: number,
  overscan: number,
): VirtualRange {
  if (count === 0) {
    return { start: 0, end: 0, spaceBefore: 0, spaceAfter: 0, anchorIndex: -1, anchorOffset: 0 };
  }

  const tops: number[] = [];
  let top = 0;
  let first = -1;
  let last = -1;

  for (let index = 0; index < count; index++) {
    tops.push(top);
    const bottom = top + heightOf(index);
    if (bottom > viewportTop && top < viewportTop + viewportHeight) {
      first = first === -1 ? index : first;
      last = index;
    }
    top = bottom;
  }

  // The screen is above or below the whole list. Keep the nearest row.
  if (first === -1) {
    first = last = viewportTop >= top ? count - 1 : 0;
  }

  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + 1 + overscan);

  return {
    start,
    end,
    spaceBefore: tops[start],
    spaceAfter: end === count ? 0 : top - tops[end],
    anchorIndex: first,
    anchorOffset: viewportTop - tops[first],
  };
}
