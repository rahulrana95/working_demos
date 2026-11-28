/*
 * NOT PART OF THE INTERVIEW: production version.
 * New posts, held until the user asks for them. With `subscribe` they come
 * in real time over a live connection. Without it, and with `fetchNewer`,
 * the feed asks the server every `pollMs`.
 *
 * Why it holds at scale:
 *   1. When the connection drops, we wait before we subscribe again, and
 *      the wait doubles with every failed try, with a random part. A server
 *      that comes back is not hit by every feed in the same second.
 *   2. A hidden tab holds no connection. A million background tabs cost
 *      the server nothing.
 *   3. After every connect we ask `fetchNewer` once for what we missed, so
 *      a post that was sent while we were away is not lost.
 *   4. The poll starts its next wait only after the last answer, so a slow
 *      server never gets two polls at once. A hidden tab does not poll.
 */
import { useEffect, useRef } from "react";
import { getBackoffDelayMs } from "./backoff";
import type { FeedStreamEvent, FetchNewerFn, Post, SubscribeFn } from "./types";

export interface UseLivePostsOptions {
  /** Without it the feed opens no connection, and polls with `fetchNewer`. */
  subscribe: SubscribeFn | undefined;
  /** Catches up after a connect. Without `subscribe` it is the poll. */
  fetchNewer: FetchNewerFn | undefined;
  /** How long to wait between two polls. Used only without `subscribe`. */
  pollMs: number;
  /** The id of the newest post the feed knows, or `null`. */
  newestId: string | null;
  /** False until the first page is there. We do not connect before that. */
  isReady: boolean;
  /** Gets the new posts, newest first. */
  onPosts: (posts: Post[]) => void;
  /** Called when a catch-up request has succeeded: the network works. */
  onSuccess?: () => void;
}

export function useLivePosts({
  subscribe,
  fetchNewer,
  pollMs,
  newestId,
  isReady,
  onPosts,
  onSuccess,
}: UseLivePostsOptions): void {
  // The connection reads the newest values from this ref. So a new post or
  // a new function from the parent does not close and reopen it.
  const latest = useRef({ subscribe, fetchNewer, newestId, onPosts, onSuccess });
  useEffect(() => {
    latest.current = { subscribe, fetchNewer, newestId, onPosts, onSuccess };
  }, [subscribe, fetchNewer, newestId, onPosts, onSuccess]);

  const hasSubscribe = subscribe !== undefined;
  const hasFetchNewer = fetchNewer !== undefined;

  useEffect(() => {
    if (!isReady || (!hasSubscribe && !hasFetchNewer)) {
      return;
    }

    const controller = new AbortController();
    let unsubscribe: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let failedTries = 0;

    async function catchUp() {
      try {
        const posts = await latest.current.fetchNewer?.(latest.current.newestId, controller.signal);
        if (!controller.signal.aborted && posts !== undefined) {
          latest.current.onPosts(posts);
          latest.current.onSuccess?.();
        }
      } catch {
        // No error is shown: the user did not ask for anything. The next
        // connect catches up again.
      }
    }

    function disconnect() {
      clearTimeout(reconnectTimer);
      unsubscribe?.();
      unsubscribe = null;
    }

    function handleEvent(event: FeedStreamEvent) {
      if (event.type === "post") {
        latest.current.onPosts([event.post]);
      } else if (event.type === "open") {
        failedTries = 0;
        void catchUp();
      } else {
        // The connection dropped. Wait, then subscribe again.
        disconnect();
        reconnectTimer = setTimeout(connect, getBackoffDelayMs(failedTries, Math.random()));
        failedTries += 1;
      }
    }

    function connect() {
      disconnect();
      // A hidden tab stays without a connection until it is shown again.
      if (document.visibilityState !== "hidden") {
        unsubscribe = latest.current.subscribe?.(handleEvent) ?? null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        disconnect();
      } else {
        connect();
      }
    }

    // No live connection: ask every `pollMs`. The next wait starts after the answer.
    async function poll() {
      if (document.visibilityState !== "hidden") {
        await catchUp();
      }
      if (!controller.signal.aborted) {
        reconnectTimer = setTimeout(poll, pollMs);
      }
    }

    if (hasSubscribe) {
      connect();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    } else {
      reconnectTimer = setTimeout(poll, pollMs);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      disconnect();
      controller.abort();
    };
  }, [hasSubscribe, hasFetchNewer, isReady, pollMs]);
}
