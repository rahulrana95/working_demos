/*
 * NOT PART OF THE INTERVIEW: production version.
 * The virtual list: only the posts near the screen are in the DOM. It is
 * the same as in the staff answer.
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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { FeedSession } from "./feedSession";
import { getRowTop, getVirtualRange } from "./virtualRange";
import type { VirtualRange } from "./virtualRange";

export interface VirtualRowsOptions {
  /** The height to assume for a post that was never drawn. */
  estimatedHeight: number;
  /** How many posts to draw above and below the screen. */
  overscan: number;
}

export interface VirtualRows {
  /** Put it on the element that holds the rows. */
  listRef: RefObject<HTMLDivElement>;
  range: VirtualRange;
  /** Starts measuring a row. Returns the function that stops it. */
  observeRow: (row: HTMLElement) => () => void;
}

function isSameRange(a: VirtualRange, b: VirtualRange): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.spaceBefore === b.spaceBefore &&
    a.spaceAfter === b.spaceAfter
  );
}

export function useVirtualRows(
  ids: string[],
  session: FeedSession,
  { estimatedHeight, overscan }: VirtualRowsOptions,
): VirtualRows {
  const listRef = useRef<HTMLDivElement>(null);
  const { heights } = session;

  // useCallback: `update` below depends on these two functions.
  const heightOf = useCallback(
    (index: number) => heights.get(ids[index]) ?? estimatedHeight,
    [heights, ids, estimatedHeight],
  );
  const getRange = useCallback(
    (viewportTop: number) =>
      getVirtualRange(ids.length, heightOf, viewportTop, window.innerHeight, overscan),
    [ids, heightOf, overscan],
  );

  /** Where the screen top was when the feed was last on the page, or `null`. */
  function getSavedViewportTop(): number | null {
    const { anchor } = session;
    const index = anchor === null ? -1 : ids.indexOf(anchor.postId);
    return anchor === null || index === -1 ? null : getRowTop(heightOf, index) + anchor.offset;
  }

  // The first render has no DOM to measure. It draws the rows around the
  // saved place, so they are there when we scroll back to it.
  const [range, setRange] = useState(() => getRange(getSavedViewportTop() ?? 0));

  // Works out the rows for the current scroll position. It keeps the old
  // object when nothing changed, so React draws nothing.
  // useCallback: it is a dependency of the effects below.
  const update = useCallback(() => {
    const list = listRef.current;
    if (list === null) {
      return;
    }

    const next = getRange(-list.getBoundingClientRect().top);
    if (next.anchorIndex !== -1) {
      session.anchor = { postId: ids[next.anchorIndex], offset: next.anchorOffset };
    }
    setRange((previous) => (isSameRange(previous, next) ? previous : next));
  }, [getRange, ids, session]);

  // Scroll restoration: put the saved post back at the saved place. It runs
  // once, before the browser paints, so the user never sees the top first.
  useLayoutEffect(() => {
    const list = listRef.current;
    const savedTop = getSavedViewportTop();
    if (list !== null && savedTop !== null) {
      const listTop = list.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, listTop + savedTop);
    }
    // Only when the feed appears. Later scrolling belongs to the user.
  }, []);

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

  // The observer calls the newest `handleResize` through a ref.
  const handleResizeRef = useRef<ResizeObserverCallback>(() => {});
  useEffect(() => {
    handleResizeRef.current = (entries) => {
      let hasChanged = false;

      for (const { target } of entries) {
        const postId = (target as HTMLElement).dataset.postId;
        const rect = target.getBoundingClientRect();
        // A row that was just removed reports a height of 0. Ignore it.
        if (postId === undefined || !target.isConnected) {
          continue;
        }

        const plannedHeight = heights.get(postId) ?? estimatedHeight;
        if (rect.height !== plannedHeight) {
          heights.set(postId, rect.height);
          hasChanged = true;
          // The whole row is above the screen and is not as tall as we had
          // planned. Scroll by the difference, so the post the user reads
          // does not move.
          if (rect.bottom <= 0) {
            window.scrollBy(0, rect.height - plannedHeight);
          }
        }
      }

      if (hasChanged) {
        update();
      }
    };
  }, [estimatedHeight, heights, update]);

  // One observer for all rows. A browser without ResizeObserver uses the estimate.
  const [observer] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries, self) => handleResizeRef.current(entries, self)),
  );
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
