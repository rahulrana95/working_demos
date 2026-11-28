/*
 * PART OF THE INTERVIEW: yes (about 13 minutes).
 * This hook is the heart of the answer. Write it before the components.
 *
 * Why it holds at scale:
 *   1. Normalised state: every post is stored once, by id. A like changes
 *      one object, so only that post is drawn again.
 *   2. One page request at a time: a fast scroll cannot start ten requests.
 *   3. Posts are de-duplicated by id: a page that overlaps the last one
 *      never shows a post twice.
 *   4. A failed "load more" keeps the posts that are already on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPage, FeedStatus, FetchPageFn, Post } from "./types";

export interface FeedState {
  postsById: Record<string, Post>;
  /** The ids in the order the server ranked them. */
  order: string[];
  status: FeedStatus;
  hasMore: boolean;
  /** How many posts the last "load more" added. The screen reader message uses it. */
  lastAdded: number;
}

export const EMPTY_FEED: FeedState = {
  postsById: {},
  order: [],
  status: "idle",
  hasMore: true,
  lastAdded: 0,
};

/** Adds one page to the feed. A post that we already hold is skipped. */
export function addPage(state: FeedState, page: FeedPage): FeedState {
  const postsById = { ...state.postsById };
  const order = [...state.order];

  for (const post of page.posts) {
    // We keep our own copy of a known post: it may hold a like that the
    // server has not answered yet.
    if (postsById[post.id] === undefined) {
      postsById[post.id] = post;
      order.push(post.id);
    }
  }

  return {
    postsById,
    order,
    status: "success",
    hasMore: page.nextCursor !== null,
    lastAdded: state.order.length === 0 ? 0 : order.length - state.order.length,
  };
}

export interface UseFeedReturn extends FeedState {
  /** Loads the next page. Does nothing while a page is loading or after an error. */
  loadMore: () => void;
  /** Sends the failed request again. Does nothing when there is no error. */
  retry: () => void;
  /** Changes some fields of one post, for example after a like. */
  updatePost: (postId: string, changes: Partial<Post>) => void;
}

export function useFeed(fetchPage: FetchPageFn): UseFeedReturn {
  const [state, setState] = useState(EMPTY_FEED);

  // The parent may pass a new function on every render. We keep the latest
  // one in a ref, so a new function does not start a new request.
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  // These are read and written between renders, so they cannot wait for a
  // render. `inFlight` is the lock: one page request at a time.
  const inFlight = useRef<AbortController | null>(null);
  const next = useRef({ cursor: null as string | null, hasMore: true, failed: false });

  // useCallback: the function is a dependency of the effects that call it.
  const load = useCallback(async (isRetry: boolean) => {
    const { cursor, hasMore, failed } = next.current;
    if (inFlight.current !== null || !hasMore || failed !== isRetry) {
      return;
    }

    const controller = new AbortController();
    inFlight.current = controller;
    setState((previous) => ({
      ...previous,
      status: previous.order.length === 0 ? "loading" : "loadingMore",
    }));

    try {
      const page = await fetchPageRef.current(cursor, controller.signal);

      // The feed was removed while we waited. A late answer is ignored.
      if (controller.signal.aborted) {
        return;
      }

      inFlight.current = null;
      const { nextCursor } = page;
      next.current = { cursor: nextCursor, hasMore: nextCursor !== null, failed: false };
      setState((previous) => addPage(previous, page));
    } catch {
      if (controller.signal.aborted) {
        return;
      }

      // The cursor did not move, so "Try again" asks for the same page.
      inFlight.current = null;
      next.current = { cursor, hasMore: true, failed: true };
      setState((previous) => ({ ...previous, status: "error" }));
    }
  }, []);

  // Load the first page. When the feed is removed, cancel the request.
  useEffect(() => {
    void load(false);

    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [load]);

  const loadMore = useCallback(() => void load(false), [load]);
  const retry = useCallback(() => void load(true), [load]);

  // useCallback: the like code and every post get this function. A new one
  // on each render would draw every post again.
  const updatePost = useCallback((postId: string, changes: Partial<Post>) => {
    setState((previous) => {
      const post = previous.postsById[postId];
      return {
        ...previous,
        postsById: { ...previous.postsById, [postId]: { ...post, ...changes } },
      };
    });
  }, []);

  return { ...state, loadMore, retry, updatePost };
}
