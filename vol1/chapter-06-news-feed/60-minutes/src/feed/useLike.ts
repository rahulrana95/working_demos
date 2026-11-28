/*
 * PART OF THE INTERVIEW: yes (about 8 minutes).
 * Write it after `useFeed`. Say the race aloud before you type: the user taps
 * twice, two requests are in flight, and the answers can come back in any order.
 *
 * Why it holds at scale: the screen changes at once, before the server
 * answers. On a slow phone network the button still feels instant. Only the
 * answer to the last tap may change the screen, so a slow old answer can
 * never undo a newer choice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LikeState, Post, SetLikeFn } from "./types";

/** What we remember for a post while the server has not answered its last tap. */
interface PendingLike {
  /** The last state that we know the server holds. A failure goes back to it. */
  confirmed: LikeState;
  /** What the user chose last. */
  wanted: boolean;
  /** The number of the newest request. An answer with an older number is late. */
  latestRequest: number;
}

/** The like state to show before the server answers. */
export function getOptimisticLike(confirmed: LikeState, wanted: boolean): LikeState {
  if (wanted === confirmed.likedByMe) {
    return confirmed;
  }
  return { likedByMe: wanted, likeCount: confirmed.likeCount + (wanted ? 1 : -1) };
}

export function useLike(
  setLike: SetLikeFn,
  updatePost: (postId: string, changes: LikeState) => void,
): (post: Post) => void {
  // useState with a function creates the map once, on the first render.
  const [pendingByPost] = useState(() => new Map<string, PendingLike>());

  const setLikeRef = useRef(setLike);
  useEffect(() => {
    setLikeRef.current = setLike;
  }, [setLike]);

  // One signal for every like request. It is aborted when the feed is removed.
  const unmountRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    unmountRef.current = controller;
    return () => controller.abort();
  }, []);

  // useCallback: every post gets this function. A new one on each render
  // would draw every post again.
  return useCallback(
    (post: Post) => {
      const signal = unmountRef.current?.signal;
      if (signal === undefined) {
        return;
      }

      const pending = pendingByPost.get(post.id) ?? {
        confirmed: { likeCount: post.likeCount, likedByMe: post.likedByMe },
        wanted: post.likedByMe,
        latestRequest: 0,
      };
      pendingByPost.set(post.id, pending);

      pending.wanted = !pending.wanted;
      const thisRequest = ++pending.latestRequest;

      // Optimistic update: show the choice now, ask the server after.
      updatePost(post.id, getOptimisticLike(pending.confirmed, pending.wanted));

      setLikeRef.current(post.id, pending.wanted, signal).then(
        (saved) => {
          if (signal.aborted) {
            return;
          }
          // The server holds this state now, also when the answer is late.
          pending.confirmed = saved;
          // A late answer must not change the screen: the user chose again.
          if (thisRequest === pending.latestRequest) {
            pendingByPost.delete(post.id);
            updatePost(post.id, saved);
          }
        },
        () => {
          if (signal.aborted || thisRequest !== pending.latestRequest) {
            return;
          }
          // Roll back to what the server holds.
          pendingByPost.delete(post.id);
          updatePost(post.id, pending.confirmed);
        },
      );
    },
    [pendingByPost, updatePost],
  );
}
