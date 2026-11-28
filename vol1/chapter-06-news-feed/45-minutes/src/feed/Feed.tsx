/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * Order to write it in:
 *   1. The list of posts and the "Load more" button.      (3 minutes)
 *   2. The sentinel that loads the next page by itself.   (4 minutes)
 *   3. Loading, empty, error and end-of-feed states.      (2 minutes)
 *   4. The feed pattern for screen readers and keyboards. (3 minutes)
 *
 * Why it holds at scale: one IntersectionObserver watches one empty element
 * near the end of the list. There is no scroll listener, so scrolling runs
 * none of our code. The hook allows one page request at a time.
 */
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { PostCard } from "./PostCard";
import type { FetchPageFn, SetLikeFn } from "./types";
import { useFeed } from "./useFeed";
import { useLike } from "./useLike";

export interface FeedProps {
  /** The name of the feed. Screen readers read it out. */
  label: string;
  fetchPage: FetchPageFn;
  setLike: SetLikeFn;
}

export function Feed({ label, fetchPage, setLike }: FeedProps) {
  const { postsById, order, status, hasMore, lastAdded, loadMore, retry, updatePost } =
    useFeed(fetchPage);
  const toggleLike = useLike(setLike, updatePost);

  const isLoading = status === "idle" || status === "loading" || status === "loadingMore";
  const canLoadMore = status === "success" && hasMore;

  const sentinelRef = useRef<HTMLDivElement>(null);

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
      // Start loading when the end of the list is still 600px below the screen.
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

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
    <section className="feed">
      <div
        className="feed__list"
        role="feed"
        aria-label={label}
        aria-busy={isLoading}
        onKeyDown={handleKeyDown}
      >
        {order.map((postId, index) => (
          <PostCard
            key={postId}
            post={postsById[postId]}
            position={index + 1}
            setSize={hasMore ? -1 : order.length}
            onToggleLike={toggleLike}
          />
        ))}
      </div>

      {status === "success" && order.length === 0 && <p className="feed__message">No posts yet.</p>}

      {status === "error" && (
        <p className="feed__message feed__message--error" role="alert">
          {order.length === 0 ? "Could not load the posts." : "Could not load more posts."}
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
        >
          {status === "error" ? "Try again" : isLoading ? "Loading posts…" : "Load more"}
        </button>
      )}

      {status === "success" && !hasMore && order.length > 0 && (
        <p className="feed__message">You have seen all the posts.</p>
      )}

      {/* Screen readers read this text when it changes. It is hidden on screen. */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {status === "success" && lastAdded > 0
          ? `${lastAdded} more ${lastAdded === 1 ? "post" : "posts"} loaded`
          : ""}
      </div>
    </section>
  );
}
