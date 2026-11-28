/*
 * NOT PART OF THE INTERVIEW: production version.
 * The hook that loads pages. The state and its changes are in `feedState.ts`.
 * The production version adds a timeout, the reason of an error, the saved
 * first page, the memory limit with pages that are fetched again, and events.
 *
 * Why it holds at scale:
 *   1. One page request at a time, for "load more" and for a dropped page.
 *   2. A request that never answers is stopped after `timeoutMs`.
 *   3. The data of at most `maxPosts` posts is in memory, however long the
 *      session lasts.
 *   4. A reload shows the saved first page at once, with no network.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedSession } from "./feedSession";
import {
  addPage,
  dropFarPages,
  findDroppedPage,
  holdNewPosts,
  mergeFirstPage,
  mergeRestoredPage,
  restoreFeed,
  showWaitingPosts,
  startFromCache,
} from "./feedState";
import type { FeedState } from "./feedState";
import { readCachedPage, writeCachedPage } from "./pageCache";
import type { FeedErrorReason, FeedEvent, FeedPage, FetchPageFn, Post } from "./types";

export interface UseFeedOptions {
  fetchPage: FetchPageFn;
  session: FeedSession;
  /** The `sessionStorage` key of the saved first page. Without it nothing is saved. */
  cacheKey?: string;
  maxPosts: number;
  timeoutMs: number;
  onEvent?: (event: FeedEvent) => void;
  /** Called when a request has succeeded: the network works. */
  onSuccess?: () => void;
}

export interface UseFeedReturn extends FeedState {
  /** Loads the next page. Does nothing while a page is loading or after an error. */
  loadMore: () => void;
  /** Sends the failed request again. Does nothing when there is no error. */
  retry: () => void;
  /** Changes some fields of one post, for example after a like. */
  updatePost: (postId: string, changes: Partial<Post>) => void;
  /** Keeps new posts behind the pill. */
  holdNew: (newPosts: Post[]) => void;
  /** Puts the posts behind the pill at the top of the feed. */
  showWaiting: () => void;
  /** Fetches the dropped page of this post again. `isRetry` is for the user's "Try again". */
  restorePage: (postId: string, isRetry?: boolean) => void;
}

/** What one page request ended in. `null`: it was aborted, and nobody waits for it. */
type RequestResult = { page: FeedPage; durationMs: number } | { reason: FeedErrorReason } | null;

/** What to report once the posts of a request are on the page. */
interface LoadReport {
  durationMs: number;
  postCount: number;
}

export function useFeed({
  fetchPage,
  session,
  cacheKey,
  maxPosts,
  timeoutMs,
  onEvent,
  onSuccess,
}: UseFeedOptions): UseFeedReturn {
  // useState with a function reads the session and the storage once, on the
  // first render. The session wins: it is newer and holds more.
  const [start] = useState(() => {
    const restored = restoreFeed(session.state);
    const cachedPage = restored.order.length === 0 ? readCachedPage(cacheKey) : null;
    return {
      state: cachedPage === null ? restored : startFromCache(cachedPage),
      cameBack: restored.order.length > 0,
      time: performance.now(),
    };
  });
  const initial = start.state;
  const [state, setState] = useState(initial);

  // Keep the session up to date. It is one assignment, so it costs nothing.
  useEffect(() => {
    session.state = state;
  }, [session, state]);

  // The parent may pass new functions on every render. We keep the latest
  // ones in a ref, so a new function does not start a new request.
  const latest = useRef({ fetchPage, onEvent, onSuccess });
  useEffect(() => {
    latest.current = { fetchPage, onEvent, onSuccess };
  }, [fetchPage, onEvent, onSuccess]);

  // These are read and written between renders, so they cannot wait for a
  // render. `inFlight` is the lock: one page request at a time.
  const inFlight = useRef<{ controller: AbortController; timerId: number } | null>(null);
  const next = useRef({
    // The saved first page has no cursor we can trust: the real page 1 comes first.
    cursor: initial.isFromCache ? null : initial.nextCursor,
    hasMore: initial.isFromCache || initial.hasMore,
    hasFailed: initial.status === "error",
  });
  const report = useRef<LoadReport | null>(null);
  // A feed that comes back from the session was reported when it first loaded.
  const hasReportedFeed = useRef(start.cameBack);

  /**
   * Sends one page request, with the lock and the timeout. The caller must
   * check `inFlight` first.
   */
  // useCallback: `load` and `restorePage` depend on it.
  const request = useCallback(
    async (cursor: string | null): Promise<RequestResult> => {
      const controller = new AbortController();
      const startedAt = performance.now();

      const timeout = new Promise<"timeout">((resolve) => {
        const timerId = window.setTimeout(() => resolve("timeout"), timeoutMs);
        inFlight.current = { controller, timerId };
      });
      // The executor turns an error that is thrown at once into a rejection.
      const answer = new Promise<FeedPage>((resolve) => {
        resolve(latest.current.fetchPage(cursor, controller.signal));
      }).then(
        (page) => ({ page }),
        () => "failed" as const,
      );
      // The race does not wait for a fetch function that never answers.
      const outcome = await Promise.race([answer, timeout]);

      // The feed was removed while we waited. Nobody waits for this answer.
      if (controller.signal.aborted) {
        return null;
      }
      window.clearTimeout(inFlight.current?.timerId);
      inFlight.current = null;

      if (outcome === "timeout") {
        controller.abort();
        return { reason: "timeout" };
      }
      if (outcome === "failed") {
        // `navigator.onLine` is only a hint. We always send the request, and
        // use the hint only to choose the message after a failure.
        return { reason: navigator.onLine === false ? "offline" : "failed" };
      }
      return { page: outcome.page, durationMs: performance.now() - startedAt };
    },
    [timeoutMs],
  );

  // useCallback: the function is a dependency of the effects that call it.
  const load = useCallback(
    async (isRetry: boolean) => {
      const { cursor, hasMore, hasFailed } = next.current;
      if (inFlight.current !== null || !hasMore || hasFailed !== isRetry) {
        return;
      }

      setState((previous) => ({
        ...previous,
        status: previous.order.length === 0 || previous.isFromCache ? "loading" : "loadingMore",
      }));
      const result = await request(cursor);
      if (result === null) {
        return;
      }

      if ("reason" in result) {
        // The cursor did not move, so "Try again" asks for the same page.
        next.current = { cursor, hasMore: true, hasFailed: true };
        setState((previous) => ({ ...previous, status: "error", errorReason: result.reason }));
        latest.current.onEvent?.({
          type: "load_failed",
          reason: result.reason,
          isFirstPage: cursor === null,
        });
        return;
      }

      const { page, durationMs } = result;
      next.current = {
        cursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
        hasFailed: false,
      };
      if (cursor === null) {
        writeCachedPage(cacheKey, page);
      }
      report.current = { durationMs, postCount: page.posts.length };
      setState((previous) => {
        const merged = previous.isFromCache
          ? mergeFirstPage(previous, page)
          : addPage(previous, page, cursor);
        return dropFarPages(merged, session.anchor?.postId ?? null, maxPosts);
      });
      latest.current.onSuccess?.();
    },
    [request, cacheKey, maxPosts, session],
  );

  // Load the first page, unless the session gave us posts. When the feed is
  // removed, cancel the request and its timeout.
  useEffect(() => {
    if (initial.order.length === 0 || initial.isFromCache) {
      void load(false);
    }

    return () => {
      inFlight.current?.controller.abort();
      window.clearTimeout(inFlight.current?.timerId);
      inFlight.current = null;
    };
  }, [load, initial]);

  // Events are sent after React has put the posts on the page.
  useEffect(() => {
    const postCount = state.order.length;
    if (!hasReportedFeed.current && postCount > 0) {
      hasReportedFeed.current = true;
      latest.current.onEvent?.({
        type: "feed_loaded",
        durationMs: performance.now() - start.time,
        postCount,
        fromCache: state.isFromCache,
      });
    }
    if (report.current !== null) {
      const postsInMemory = Object.keys(state.postsById).length;
      latest.current.onEvent?.({ type: "page_loaded", ...report.current, postsInMemory });
      report.current = null;
    }
  }, [state, start]);

  const loadMore = useCallback(() => void load(false), [load]);
  const retry = useCallback(() => void load(true), [load]);

  // useCallback: `restorePage` depends on it.
  const restore = useCallback(
    async (postId: string, isRetry: boolean) => {
      // The session holds the state of the last render.
      const current = session.state;
      const cursor = current === null ? undefined : findDroppedPage(current, postId)?.cursor;
      // After a failure only the user's "Try again" asks again, so a broken
      // server is not asked in a loop. A dropped page always has a cursor
      // of its own; the check is for TypeScript.
      if (
        inFlight.current !== null ||
        current === null ||
        typeof cursor !== "string" ||
        current.restoreFailed !== isRetry
      ) {
        return;
      }

      setState((previous) =>
        previous.restoreFailed ? { ...previous, restoreFailed: false } : previous,
      );
      const result = await request(cursor);
      if (result === null) {
        return;
      }

      if ("reason" in result) {
        setState((previous) => ({ ...previous, restoreFailed: true }));
        latest.current.onEvent?.({
          type: "load_failed",
          reason: result.reason,
          isFirstPage: false,
        });
        return;
      }

      report.current = { durationMs: result.durationMs, postCount: result.page.posts.length };
      setState((previous) =>
        dropFarPages(
          mergeRestoredPage(previous, cursor, result.page),
          session.anchor?.postId ?? null,
          maxPosts,
        ),
      );
      latest.current.onSuccess?.();
    },
    [request, maxPosts, session],
  );

  // useCallback: the feed calls it from an effect.
  const restorePage = useCallback(
    (postId: string, isRetry = false) => void restore(postId, isRetry),
    [restore],
  );

  // useCallback: the like code and every post get this function. A new one
  // on each render would draw every post again.
  const updatePost = useCallback((postId: string, changes: Partial<Post>) => {
    setState((previous) => {
      const post = previous.postsById[postId];
      // The post was dropped to save memory. Its page brings the new numbers later.
      if (post === undefined) {
        return previous;
      }
      return {
        ...previous,
        postsById: { ...previous.postsById, [postId]: { ...post, ...changes } },
      };
    });
  }, []);

  // useCallback: the live connection keeps this function in its effect.
  const holdNew = useCallback((newPosts: Post[]) => {
    setState((previous) => holdNewPosts(previous, newPosts));
  }, []);

  // The new posts take room in memory, so far pages may have to go.
  const showWaiting = useCallback(() => {
    setState((previous) =>
      dropFarPages(showWaitingPosts(previous), session.anchor?.postId ?? null, maxPosts),
    );
  }, [maxPosts, session]);

  return { ...state, loadMore, retry, updatePost, holdNew, showWaiting, restorePage };
}
