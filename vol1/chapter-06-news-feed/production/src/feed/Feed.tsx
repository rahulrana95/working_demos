/*
 * NOT PART OF THE INTERVIEW: production version.
 * The feed that a team ships in the first week. It is the staff answer, plus:
 *   - what moved here from the staff answer to keep it at 60 minutes:
 *     scroll and focus restoration, the "new posts" pill with its poll, the
 *     like queue with idempotency keys, `messages` and `renderPost`
 *   - a live connection for new posts, in place of the poll (`subscribe`)
 *   - a limit on the posts kept in memory (`maxPosts`)
 *   - the first page saved for the next visit (`cacheKey`)
 *   - likes that wait for the network, and a timeout for pages
 *   - an error boundary around every post
 *   - impressions and the other events (`onEvent`)
 *   - video posts and responsive images
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { createFeedSession } from "./feedSession";
import type { FeedSession } from "./feedSession";
import { ImpressionTracker } from "./impressions";
import { DEFAULT_MESSAGES } from "./messages";
import type { FeedMessages } from "./messages";
import { PostCard, PostPlaceholder } from "./PostCard";
import type { RenderPostHelpers } from "./PostCard";
import type { FeedEvent, FetchNewerFn, FetchPageFn, Post, SetLikeFn, SubscribeFn } from "./types";
import { useFeed } from "./useFeed";
import { useLike } from "./useLike";
import { useLivePosts } from "./useLivePosts";
import { useVirtualRows } from "./useVirtualRows";

export interface FeedProps {
  /** The name of the feed. Screen readers read it out. */
  label: string;
  fetchPage: FetchPageFn;
  setLike: SetLikeFn;
  /**
   * Fetches posts newer than the newest one the feed knows. The feed offers
   * them in a pill. With `subscribe` it is called after every connect, for
   * the posts the feed missed. Without `subscribe` it is the poll.
   */
  fetchNewer?: FetchNewerFn;
  /** Opens the live connection for new posts. It replaces the poll. */
  subscribe?: SubscribeFn;
  /** How long to wait between two polls. Used only without `subscribe`. */
  pollMs?: number;
  /**
   * Keeps the posts, the scroll position and the focus while the feed is not
   * on the page. The feed reads it once, when it appears.
   */
  session?: FeedSession;
  /**
   * The `sessionStorage` key under which the first page is saved, so the
   * next visit shows posts at once. Put the id of the user in it, and call
   * `clearCachedPage` on logout. The feed reads it once, when it appears.
   */
  cacheKey?: string;
  /** The feed keeps the data of at most this many posts in memory. */
  maxPosts?: number;
  /** A page request that takes longer than this fails. */
  timeoutMs?: number;
  /** The address of the page of one post. With it, the date is a link. */
  postHref?: (post: Post) => string;
  /** Draws the inside of one post. The default is `PostCard`. */
  renderPost?: (post: Post, helpers: RenderPostHelpers) => ReactNode;
  /** Replaces some or all of the English texts. */
  messages?: Partial<FeedMessages>;
  /** The `sizes` attribute of every image: how wide a picture is on screen. */
  imageSizes?: string;
  /** The height, in pixels, to assume for a post that was never drawn. */
  estimatedPostHeight?: number;
  /** How many posts to draw above and below the screen. */
  overscan?: number;
  /** Gets every event, for analytics and monitoring. An event never holds the text of a post. */
  onEvent?: (event: FeedEvent) => void;
  /** An extra class name for the root element. */
  className?: string;
}

/** Start loading when the end of the list is this close to the screen. */
const LOAD_AHEAD = "600px";
const SKELETON_ROWS = [1, 2, 3];
const TEN_SECONDS_MS = 10_000;
const THIRTY_SECONDS_MS = 30_000;

export function Feed({
  label,
  fetchPage,
  setLike,
  fetchNewer,
  subscribe,
  pollMs = THIRTY_SECONDS_MS,
  session: sessionFromProps,
  cacheKey,
  maxPosts = 500,
  timeoutMs = TEN_SECONDS_MS,
  postHref,
  renderPost,
  messages,
  imageSizes = "(min-width: 592px) 560px, 100vw",
  estimatedPostHeight = 300,
  overscan = 3,
  onEvent,
  className,
}: FeedProps) {
  // Without a session from the page, the feed keeps one for its own life.
  const [session] = useState(() => sessionFromProps ?? createFeedSession());
  // useMemo: every post gets this object. A new one on each render would
  // draw every post again.
  const text = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messages }), [messages]);

  // The parent may pass a new `onEvent` on every render. The functions
  // below call the latest one through this ref, so they never change.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  // useCallback: the hooks and every post keep this function.
  const emit = useCallback((event: FeedEvent) => onEventRef.current?.(event), []);

  // `useFeed` needs `resumeLikes`, and `useLike` needs `updatePost` from
  // `useFeed`. The ref breaks the circle.
  const resumeLikesRef = useRef<() => void>(() => {});
  // useCallback: `useFeed` and `useLivePosts` keep this function.
  const handleSuccess = useCallback(() => resumeLikesRef.current(), []);

  const feed = useFeed({
    fetchPage,
    session,
    cacheKey,
    maxPosts,
    timeoutMs,
    onEvent: emit,
    onSuccess: handleSuccess,
  });
  const { postsById, order, status, errorReason, hasMore, lastAdded, waiting, restoreFailed } =
    feed;
  const { loadMore, retry, updatePost, holdNew, showWaiting, restorePage } = feed;

  const { toggleLike, failedPostId, isWaitingForNetwork, resumeLikes } = useLike(
    setLike,
    updatePost,
    emit,
  );
  useEffect(() => {
    resumeLikesRef.current = resumeLikes;
  }, [resumeLikes]);

  const virtual = useVirtualRows(order, session, {
    estimatedHeight: estimatedPostHeight,
    overscan,
  });
  const { listRef, range } = virtual;

  useLivePosts({
    subscribe,
    fetchNewer,
    pollMs,
    newestId: waiting[0]?.id ?? order[0] ?? null,
    isReady: status !== "idle" && status !== "loading",
    onPosts: holdNew,
    onSuccess: handleSuccess,
  });

  // Impressions: one tracker for the life of the feed.
  const [impressions] = useState(
    () => new ImpressionTracker((postIds) => emit({ type: "post_impression", postIds })),
  );
  useEffect(() => {
    impressions.start();
    return () => impressions.stop();
  }, [impressions]);

  // Every post is measured by the virtual list and watched for impressions.
  // useCallback: every post gets this function for its effect.
  const observeVirtualRow = virtual.observeRow;
  const observeRow = useCallback(
    (row: HTMLElement) => {
      const stopMeasuring = observeVirtualRow(row);
      const stopWatching = impressions.observe(row);
      return () => {
        stopMeasuring();
        stopWatching();
      };
    },
    [observeVirtualRow, impressions],
  );

  // useCallback: every post gets this function.
  const handleRenderError = useCallback(
    (postId: string) => emit({ type: "post_render_failed", postId }),
    [emit],
  );

  const isLoading = status === "idle" || status === "loading" || status === "loadingMore";
  const canLoadMore = status === "success" && hasMore;
  const isEnd = status === "success" && !hasMore && order.length > 0;
  const drawnIds = order.slice(range.start, range.end);

  const rootRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);
  const moreButtonHasFocus = useRef(false);
  /** The id of the post that must get the focus after the next render. */
  const focusAfterRender = useRef(session.focusedPostId);

  // A post near the screen has no data: it was dropped to save memory.
  // Fetch its page again. After a failure the user must ask, so a broken
  // server is not asked in a loop.
  const missingPostId = drawnIds.find((postId) => postsById[postId] === undefined);
  useEffect(() => {
    if (missingPostId !== undefined && !restoreFailed && !isLoading) {
      restorePage(missingPostId);
    }
  }, [missingPostId, restoreFailed, isLoading, postsById, restorePage]);

  // The sentinel is an empty element after the last post. When it comes
  // near the screen, we load the next page. It is on the page only while we
  // can load more, so after every page a new observer checks again. That
  // matters when one page does not fill the screen.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    // A browser without IntersectionObserver still has the button.
    if (!canLoadMore || sentinel === null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: `${LOAD_AHEAD} 0px` },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

  // The button goes away after the last page. If the keyboard focus was on
  // it, we move the focus to the closing message, so it is not lost.
  useEffect(() => {
    if (isEnd && moreButtonHasFocus.current) {
      moreButtonHasFocus.current = false;
      endRef.current?.focus();
    }
  }, [isEnd]);

  // Focus restoration. It runs after every render, but does its work once:
  // when the post that must get the focus is in the DOM. That is the case
  // after coming back from a post, and after the pill put new posts on top.
  useLayoutEffect(() => {
    const postId = focusAfterRender.current;
    const row =
      postId === null ? null : listRef.current?.querySelector(`[data-post-id="${postId}"]`);
    if (row instanceof HTMLElement) {
      focusAfterRender.current = null;
      // The scroll position is already right. Focus must not move it.
      row.focus({ preventScroll: true });
    }
  });

  // The post that had the focus is drawn at once when the feed comes back,
  // or it is far from the saved place. Then we do not wait for it: it must
  // not take the focus minutes later, when the user scrolls to it.
  useLayoutEffect(() => {
    focusAfterRender.current = null;
  }, []);

  function showNewPosts() {
    // The pill goes away, so the focus moves to the first new post.
    focusAfterRender.current = waiting[0]?.id ?? null;
    rootRef.current?.scrollIntoView();
    showWaiting();
  }

  function getErrorText(): string {
    if (errorReason === "offline") {
      return text.offline;
    }
    if (errorReason === "timeout") {
      return text.timeout;
    }
    return order.length === 0 ? text.loadFailed : text.loadMoreFailed;
  }

  // Remember which post holds the focus, for the day the feed comes back.
  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    const row = event.target.closest<HTMLElement>("[data-post-id]");
    session.focusedPostId = row?.dataset.postId ?? null;
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      session.focusedPostId = null;
    }
  }

  // The feed pattern: Page Down and Page Up move focus to the next and the
  // previous post, from anywhere inside a post.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "PageDown" && event.key !== "PageUp") {
      return;
    }

    const current = (event.target as HTMLElement).closest("article");
    const next =
      event.key === "PageDown" ? current?.nextElementSibling : current?.previousElementSibling;

    if (next instanceof HTMLElement) {
      // We move the focus, so the browser must not also scroll a full page.
      event.preventDefault();
      next.focus();
    }
  }

  return (
    <section ref={rootRef} className={className ? `feed ${className}` : "feed"}>
      {waiting.length > 0 && (
        <button type="button" className="feed__new" onClick={showNewPosts}>
          {text.newPosts(waiting.length)}
        </button>
      )}

      <div
        ref={listRef}
        className="feed__list"
        role="feed"
        aria-label={label}
        aria-busy={isLoading}
        // The empty space that stands in for the posts that are not drawn.
        style={{ paddingBlockStart: range.spaceBefore, paddingBlockEnd: range.spaceAfter }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {drawnIds.map((postId, index) => {
          const post = postsById[postId];
          const position = range.start + index + 1;
          const setSize = hasMore ? -1 : order.length;

          return post === undefined ? (
            <PostPlaceholder
              key={postId}
              postId={postId}
              position={position}
              setSize={setSize}
              height={session.heights.get(postId) ?? estimatedPostHeight}
              hasFailed={restoreFailed}
              text={text}
              onRetry={restorePage}
            />
          ) : (
            <PostCard
              key={postId}
              post={post}
              position={position}
              setSize={setSize}
              likeFailed={failedPostId === postId}
              text={text}
              imageSizes={imageSizes}
              onToggleLike={toggleLike}
              observeRow={observeRow}
              onRenderError={handleRenderError}
              postHref={postHref}
              renderPost={renderPost}
            />
          );
        })}
      </div>

      {isLoading && order.length === 0 && (
        <div className="feed__skeleton" aria-hidden="true">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="feed__skeleton-post" />
          ))}
        </div>
      )}

      {status === "success" && order.length === 0 && <p className="feed__message">{text.empty}</p>}

      {status === "error" && (
        <p className="feed__message feed__message--error" role="alert">
          {getErrorText()}
        </p>
      )}

      {canLoadMore && <div ref={sentinelRef} className="feed__sentinel" />}

      {/*
        One button for "Load more" and "Try again". It stays on the page
        while a page loads, so the keyboard focus is never lost. It also
        tells the user that a page is loading.
      */}
      {hasMore && (
        <button
          type="button"
          className="feed__more"
          aria-disabled={isLoading}
          onClick={status === "error" ? retry : loadMore}
          onFocus={() => {
            moreButtonHasFocus.current = true;
          }}
          onBlur={() => {
            moreButtonHasFocus.current = false;
          }}
        >
          {status === "error" ? text.retry : isLoading ? text.loading : text.loadMore}
        </button>
      )}

      {isEnd && (
        <p ref={endRef} className="feed__message" tabIndex={-1}>
          {text.endOfFeed}
        </p>
      )}

      {/*
        The likes are on screen but not saved. The user must know, because a
        closed tab would lose them. `navigator.onLine` only picks the wording.
      */}
      {isWaitingForNetwork && (
        <p className="feed__notice" role="status">
          {navigator.onLine === false ? text.likesWaitingOffline : text.likesWaiting}
        </p>
      )}

      {/* Screen readers read this text when it changes. It is hidden on screen. */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {status === "success" && lastAdded > 0 ? text.morePostsLoaded(lastAdded) : ""}
      </div>
    </section>
  );
}
