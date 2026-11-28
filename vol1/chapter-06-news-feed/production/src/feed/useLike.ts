/*
 * NOT PART OF THE INTERVIEW: production version.
 * The queue decides what is sent and when. This hook keeps the screen right:
 * it shows the choice at once, and rolls back, with a message, when the
 * server refused it. The production version adds the likes that wait for the
 * network, and events.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LikeQueue } from "./likeQueue";
import type { LikeIntent } from "./likeQueue";
import type { FeedEvent, LikeState, Post, SetLikeFn } from "./types";

/** What we remember for a post while its last choice is not saved yet. */
interface PendingLike {
  /** The last state that we know the server holds. A failure goes back to it. */
  confirmed: LikeState;
  /** What the user chose last. */
  wanted: boolean;
}

/** The like state to show before the server answers. */
export function getOptimisticLike(confirmed: LikeState, wanted: boolean): LikeState {
  if (wanted === confirmed.likedByMe) {
    return confirmed;
  }
  return { likedByMe: wanted, likeCount: confirmed.likeCount + (wanted ? 1 : -1) };
}

export interface UseLikeReturn {
  toggleLike: (post: Post) => void;
  /** The post whose last like could not be saved, or `null`. */
  failedPostId: string | null;
  /** True while likes wait for the network. They are on screen, but not saved yet. */
  isWaitingForNetwork: boolean;
  /** Sends the waiting likes. Call it when any request has succeeded again. */
  resumeLikes: () => void;
}

export function useLike(
  setLike: SetLikeFn,
  updatePost: (postId: string, changes: LikeState) => void,
  onEvent?: (event: FeedEvent) => void,
): UseLikeReturn {
  const [failedPostId, setFailedPostId] = useState<string | null>(null);
  const [isWaitingForNetwork, setIsWaitingForNetwork] = useState(false);
  // useState with a function creates the map once, on the first render.
  const [pendingByPost] = useState(() => new Map<string, PendingLike>());

  const latest = useRef({ setLike, onEvent });
  useEffect(() => {
    latest.current = { setLike, onEvent };
  }, [setLike, onEvent]);

  // The queue lives as long as the feed is on the page. When the feed is
  // removed, the request in flight is aborted and the rest is dropped.
  const queueRef = useRef<LikeQueue | null>(null);
  useEffect(() => {
    const controller = new AbortController();

    const send = (intent: LikeIntent) =>
      latest.current.setLike(intent.postId, intent.liked, controller.signal, intent.idempotencyKey);

    const onSettled = (intent: LikeIntent, saved: LikeState | null, isLatest: boolean) => {
      const pending = pendingByPost.get(intent.postId);
      if (pending === undefined) {
        return;
      }
      // The server holds this state now, also when a newer choice waits.
      pending.confirmed = saved ?? pending.confirmed;
      // A newer choice is in the queue. Its answer will settle the screen.
      if (!isLatest) {
        return;
      }

      pendingByPost.delete(intent.postId);
      // After a failure this rolls back to what the server holds.
      updatePost(intent.postId, pending.confirmed);
      if (saved === null) {
        setFailedPostId(intent.postId);
        latest.current.onEvent?.({ type: "like_failed", postId: intent.postId });
      }
    };

    const queue = new LikeQueue(send, { onSettled, onPausedChange: setIsWaitingForNetwork });
    queueRef.current = queue;

    // The "online" event is a hint that the network is back. We try.
    const handleOnline = () => queue.resume();
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      queue.stop();
      controller.abort();
    };
  }, [pendingByPost, updatePost]);

  // useCallback: every post gets this function. A new one on each render
  // would draw every post again.
  const toggleLike = useCallback(
    (post: Post) => {
      const pending = pendingByPost.get(post.id) ?? {
        confirmed: { likeCount: post.likeCount, likedByMe: post.likedByMe },
        wanted: post.likedByMe,
      };
      pendingByPost.set(post.id, pending);
      pending.wanted = !pending.wanted;

      // Optimistic update: show the choice now, ask the server after.
      updatePost(post.id, getOptimisticLike(pending.confirmed, pending.wanted));
      setFailedPostId((current) => (current === post.id ? null : current));
      latest.current.onEvent?.({ type: "like_toggled", postId: post.id, liked: pending.wanted });
      queueRef.current?.add(post.id, pending.wanted);
    },
    [pendingByPost, updatePost],
  );

  // useCallback: `useFeed` keeps this function for its `onSuccess`.
  const resumeLikes = useCallback(() => queueRef.current?.resume(), []);

  return { toggleLike, failedPostId, isWaitingForNetwork, resumeLikes };
}
