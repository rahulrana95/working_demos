/*
 * PART OF THE INTERVIEW: yes (about 5 minutes).
 * The arithmetic of the virtual list, with no React and no DOM. Write it
 * before `useVirtualRows`, and test it in your head with three rows.
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
    first = last = viewportTop >= top ? Math.max(0, count - 1) : 0;
  }

  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + 1 + overscan);
  // `tops[index]` is missing for an empty list and for `end === count`.
  return { start, end, spaceBefore: tops[start] ?? 0, spaceAfter: top - (tops[end] ?? top) };
}
