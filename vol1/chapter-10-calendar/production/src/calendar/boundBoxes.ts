/*
 * NOT PART OF THE INTERVIEW: production version.
 * Keeps the number of event boxes in the page small, however many events a
 * day holds. Two limits, both plain functions:
 *
 *   1. `capColumns`: a day draws at most `maxColumns` columns side by side.
 *      A box in a later column would be a few pixels wide and no use to
 *      anyone. Those boxes are counted, and one "+N more" box stands in for
 *      them in the last column.
 *   2. `boxesInWindow`: only the boxes near the hours on screen are drawn.
 *
 * Together they bound the page. A column holds boxes of at least 24px, one
 * under the other, so a window of 800px holds about 33 of them. With 4
 * columns and 7 days that is under a thousand boxes, for 50 events or 50,000.
 */
import type { PositionedEvent } from "./types";

/** The box that stands in for the events that got no column. */
export interface MoreBox {
  top: number;
  height: number;
  /** How many events it stands for. */
  count: number;
}

export interface CappedDay {
  boxes: PositionedEvent[];
  more: MoreBox[];
}

/**
 * `boxes` must be the result of `layoutDay`: in time order, cluster by cluster.
 * A cluster with more than `maxColumns` columns keeps its first
 * `maxColumns - 1` columns. The last column goes to one "+N more" box.
 */
export function capColumns(boxes: PositionedEvent[], maxColumns: number): CappedDay {
  const kept: PositionedEvent[] = [];
  const more: MoreBox[] = [];
  let clusterBottom = -Infinity;
  /** The "+N more" box of the open cluster. */
  let open: MoreBox | null = null;

  for (const box of boxes) {
    // Half a pixel of slack: `top` and `height` are fractions, and their sum can be off in its last digit.
    if (box.top >= clusterBottom - 0.5) {
      open = null;
      clusterBottom = -Infinity;
    }
    clusterBottom = Math.max(clusterBottom, box.top + box.height);

    if (box.columnCount <= maxColumns) {
      kept.push(box);
    } else if (box.column < maxColumns - 1) {
      kept.push({ ...box, columnCount: maxColumns });
    } else if (open === null) {
      open = { top: box.top, height: box.height, count: 1 };
      more.push(open);
    } else {
      const bottom = Math.max(open.top + open.height, box.top + box.height);
      open.top = Math.min(open.top, box.top);
      open.height = bottom - open.top;
      open.count++;
    }
  }
  return { boxes: kept, more };
}

/** The boxes that touch the pixels from `top` to `bottom`. Works for event boxes and "+N more" boxes. */
export function boxesInWindow<T extends { top: number; height: number }>(
  boxes: T[],
  top: number,
  bottom: number,
): T[] {
  return boxes.filter((box) => box.top + box.height > top && box.top < bottom);
}
