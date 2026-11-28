/*
 * PART OF THE INTERVIEW: yes (about 9 minutes).
 * The virtual list: only the posts near the screen are in the DOM. Write it
 * after `virtualRange.ts`, which holds the arithmetic.
 *
 * Why it holds at scale:
 *   1. The DOM holds the posts on screen plus a few above and below, not
 *      every post. After 1,000 posts the page is as light as after 10.
 *   2. Posts have different heights. We measure each one with a
 *      ResizeObserver and remember it. A post that was never drawn counts
 *      as an estimate.
 *   3. Empty space above and below stands in for the posts that are not
 *      drawn, so the scrollbar keeps its size and place.
 *   4. A scroll that shows the same posts draws nothing again.
 *
 * The cost: the browser's "find in page" and a screen reader's browse mode
 * only see the posts that are in the DOM.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { getVirtualRange } from "./virtualRange";
import type { VirtualRange } from "./virtualRange";

/** The height to assume for a post that was never drawn. */
export const ESTIMATED_HEIGHT = 300;
/** How many posts to draw above and below the screen. */
export const OVERSCAN = 3;

export interface VirtualRows {
  /** Put it on the element that holds the rows. */
  listRef: RefObject<HTMLDivElement>;
  range: VirtualRange;
  /** Starts measuring a row. Returns the function that stops it. */
  observeRow: (row: HTMLElement) => () => void;
}

export function useVirtualRows(ids: string[]): VirtualRows {
  const listRef = useRef<HTMLDivElement>(null);
  // useState with a function creates the map once. It holds the measured
  // height of every post that was drawn, by post id.
  const [heights] = useState(() => new Map<string, number>());
  // An empty list gives the empty range. The first effect below replaces it.
  const [range, setRange] = useState(() => getVirtualRange(0, () => 0, 0, 0, 0));

  // Works out the rows for the current scroll position. It keeps the old
  // object when nothing changed, so React draws nothing.
  // useCallback: it is a dependency of the effects below.
  const update = useCallback(() => {
    const viewportTop = -(listRef.current?.getBoundingClientRect().top ?? 0);
    const heightOf = (index: number) => heights.get(ids[index]) ?? ESTIMATED_HEIGHT;
    const next = getVirtualRange(ids.length, heightOf, viewportTop, window.innerHeight, OVERSCAN);

    setRange((previous) =>
      Object.entries(next).every(([key, value]) => previous[key as keyof VirtualRange] === value)
        ? previous
        : next,
    );
  }, [ids, heights]);

  // The browser sends at most one scroll event per frame, so we need no
  // timer here. The listener is passive: it can never block scrolling.
  useEffect(() => {
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  // The observer calls the newest `update` through a ref.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  // One observer for all rows. A browser without ResizeObserver uses the estimate.
  const [observer] = useState(() => {
    if (typeof ResizeObserver === "undefined") {
      return null;
    }

    return new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const postId = (target as HTMLElement).dataset.postId;
        const rect = target.getBoundingClientRect();
        // A row that was just removed reports a height of 0. Ignore it.
        if (postId === undefined || !target.isConnected) {
          continue;
        }

        const plannedHeight = heights.get(postId) ?? ESTIMATED_HEIGHT;
        heights.set(postId, rect.height);
        // The whole row is above the screen and is not as tall as we had
        // planned. Scroll by the difference, so the post the user reads
        // does not move.
        if (rect.bottom <= 0 && rect.height !== plannedHeight) {
          window.scrollBy(0, rect.height - plannedHeight);
        }
      }
      updateRef.current();
    });
  });
  useEffect(() => () => observer?.disconnect(), [observer]);

  // useCallback: every row gets this function for its effect.
  const observeRow = useCallback(
    (row: HTMLElement) => {
      observer?.observe(row);
      return () => observer?.unobserve(row);
    },
    [observer],
  );

  return { listRef, range, observeRow };
}
