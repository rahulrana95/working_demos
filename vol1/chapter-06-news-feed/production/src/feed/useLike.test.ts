/*
 * NOT PART OF THE INTERVIEW: production version.
 * The like button with its queue. The test answers each request by hand.
 */
import { act, renderHook } from "@testing-library/react";
import { createDeferred, flush, makePost } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import { LikeRejectedError } from "./types";
import type { FeedEvent, LikeState, SetLikeFn } from "./types";
import { getOptimisticLike, useLike } from "./useLike";

interface SentLike {
  postId: string;
  liked: boolean;
  signal: AbortSignal;
  key: string;
  answer: Deferred<LikeState>;
}

function renderLike() {
  const requests: SentLike[] = [];
  const setLike: SetLikeFn = vi.fn((postId, liked, signal, key) => {
    const answer = createDeferred<LikeState>();
    requests.push({ postId, liked, signal, key, answer });
    return answer.promise;
  });
  const updatePost = vi.fn();
  const events: FeedEvent[] = [];
  const hook = renderHook(() => useLike(setLike, updatePost, (event) => events.push(event)));
  /** A post with 5 likes that the user has not liked. */
  const post = makePost(1);
  const tap = () => act(() => hook.result.current.toggleLike(post));

  return { ...hook, requests, setLike, updatePost, events, post, tap };
}

async function succeed(request: SentLike, saved: LikeState): Promise<void> {
  request.answer.resolve(saved);
  await flush();
  await flush();
}

/** The request did not reach the server, or the server had a problem. */
async function failForNow(request: SentLike): Promise<void> {
  request.answer.reject(new Error("no network"));
  await flush();
  await flush();
}

/** The server said no for good, for example because the post was deleted. */
async function refuse(request: SentLike): Promise<void> {
  request.answer.reject(new LikeRejectedError());
  await flush();
  await flush();
}

const LIKED = { likeCount: 6, likedByMe: true };
const NOT_LIKED = { likeCount: 5, likedByMe: false };

describe("getOptimisticLike", () => {
  it("adds one like when the user likes the post", () => {
    expect(getOptimisticLike(NOT_LIKED, true)).toEqual(LIKED);
  });

  it("removes one like when the user takes the like back", () => {
    expect(getOptimisticLike(LIKED, false)).toEqual(NOT_LIKED);
  });

  it("changes nothing when the choice is what the server already holds", () => {
    expect(getOptimisticLike(NOT_LIKED, false)).toBe(NOT_LIKED);
  });
});

describe("useLike: a like that is saved", () => {
  it("shows the like at once, before the server answers", () => {
    const { tap, updatePost, requests } = renderLike();

    tap();

    expect(updatePost).toHaveBeenLastCalledWith("p1", LIKED);
    expect(requests[0]).toMatchObject({ postId: "p1", liked: true });
    expect(requests[0].key).toMatch(/\S{8,}/);
  });

  it("takes the numbers of the server when it answers", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();

    await succeed(requests[0], { likeCount: 9, likedByMe: true });

    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 9, likedByMe: true });
  });

  it("ends in the state the user chose last after a quick double tap", async () => {
    const { tap, updatePost, requests } = renderLike();

    tap();
    tap();
    expect(requests.map((request) => request.liked)).toEqual([true]);

    await succeed(requests[0], LIKED);
    expect(updatePost).toHaveBeenLastCalledWith("p1", NOT_LIKED);

    await succeed(requests[1], NOT_LIKED);
    expect(updatePost).toHaveBeenLastCalledWith("p1", NOT_LIKED);
  });
});

describe("useLike: a like that the server refuses", () => {
  it("rolls back, names the post and does not send it again", async () => {
    const { tap, updatePost, requests, result } = renderLike();
    tap();

    await refuse(requests[0]);

    expect(updatePost).toHaveBeenLastCalledWith("p1", NOT_LIKED);
    expect(result.current.failedPostId).toBe("p1");
    expect(result.current.isWaitingForNetwork).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it("removes the failure mark when the user taps again", async () => {
    const { tap, requests, result } = renderLike();
    tap();
    await refuse(requests[0]);

    tap();

    expect(result.current.failedPostId).toBeNull();
  });

  it("rolls back to what the server holds, not to what it held before the first tap", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();
    tap();

    // The like was saved. The unlike is then refused. So the server holds a like.
    await succeed(requests[0], LIKED);
    await refuse(requests[1]);

    expect(updatePost).toHaveBeenLastCalledWith("p1", LIKED);
  });
});

describe("useLike: a like made with no network", () => {
  it("keeps the like on screen and says that likes wait", async () => {
    const { tap, updatePost, requests, result } = renderLike();
    tap();

    await failForNow(requests[0]);

    expect(updatePost).toHaveBeenLastCalledWith("p1", LIKED);
    expect(result.current.isWaitingForNetwork).toBe(true);
    expect(result.current.failedPostId).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it("sends the like again, with the same key, when another request has succeeded", async () => {
    const { tap, requests, result, updatePost } = renderLike();
    tap();
    await failForNow(requests[0]);

    act(() => result.current.resumeLikes());

    expect(requests).toHaveLength(2);
    expect(requests[1].key).toBe(requests[0].key);
    expect(result.current.isWaitingForNetwork).toBe(false);

    await succeed(requests[1], LIKED);
    expect(updatePost).toHaveBeenLastCalledWith("p1", LIKED);
  });

  it("tries again when the browser says it is back online", async () => {
    const { tap, requests } = renderLike();
    tap();
    await failForNow(requests[0]);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(requests).toHaveLength(2);
  });

  it("sends only the last choice for a post when the user changed it while offline", async () => {
    const { tap, requests, result, updatePost } = renderLike();
    tap();
    await failForNow(requests[0]);

    // Unlike, then like again. Each tap also tries the network once.
    tap();
    await failForNow(requests[1]);
    tap();
    await failForNow(requests[2]);
    act(() => result.current.resumeLikes());

    expect(requests[3].liked).toBe(true);
    await succeed(requests[3], LIKED);
    expect(requests).toHaveLength(4);
    expect(updatePost).toHaveBeenLastCalledWith("p1", LIKED);
  });

  it("does nothing on resume when no like waits", () => {
    const { result, requests } = renderLike();

    act(() => result.current.resumeLikes());

    expect(requests).toHaveLength(0);
  });
});

describe("useLike: events", () => {
  it("reports each tap with the id of the post and the choice", () => {
    const { tap, events } = renderLike();

    tap();
    tap();

    expect(events).toEqual([
      { type: "like_toggled", postId: "p1", liked: true },
      { type: "like_toggled", postId: "p1", liked: false },
    ]);
  });

  it("reports a like that was rolled back", async () => {
    const { tap, requests, events } = renderLike();
    tap();

    await refuse(requests[0]);

    expect(events[events.length - 1]).toEqual({ type: "like_failed", postId: "p1" });
  });

  it("does not report a failure while the like still waits for the network", async () => {
    const { tap, requests, events } = renderLike();
    tap();

    await failForNow(requests[0]);

    expect(events.some((event) => event.type === "like_failed")).toBe(false);
  });
});

describe("useLike: when the feed is removed", () => {
  it("aborts its request and changes nothing", async () => {
    const { tap, updatePost, requests, unmount } = renderLike();
    tap();
    const callsBefore = updatePost.mock.calls.length;

    unmount();
    await succeed(requests[0], LIKED);

    expect(requests[0].signal.aborted).toBe(true);
    expect(updatePost).toHaveBeenCalledTimes(callsBefore);
  });

  it("does not send again or report for a request that was aborted", async () => {
    const { tap, requests, events, unmount } = renderLike();
    tap();

    unmount();
    await failForNow(requests[0]);
    window.dispatchEvent(new Event("online"));

    expect(requests).toHaveLength(1);
    expect(events.some((event) => event.type === "like_failed")).toBe(false);
  });
});
