/*
 * NOT PART OF THE INTERVIEW.
 * The races of the like button, forced by hand: the test decides which
 * answer of the server arrives first.
 */
import { act, renderHook } from "@testing-library/react";
import { createDeferred, flush, makePost } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import type { LikeState, SetLikeFn } from "./types";
import { getOptimisticLike, useLike } from "./useLike";

function renderLike() {
  const requests: { liked: boolean; signal: AbortSignal; answer: Deferred<LikeState> }[] = [];
  const setLike: SetLikeFn = vi.fn((_postId, liked, signal) => {
    const answer = createDeferred<LikeState>();
    requests.push({ liked, signal, answer });
    return answer.promise;
  });
  const updatePost = vi.fn();
  const hook = renderHook(() => useLike(setLike, updatePost));
  /** A post with 5 likes that the user has not liked. */
  const post = makePost(1);
  const tap = () => act(() => hook.result.current(post));

  return { ...hook, requests, setLike, updatePost, post, tap };
}

async function settle(run: () => void): Promise<void> {
  run();
  await flush();
}

describe("getOptimisticLike", () => {
  const confirmed = { likeCount: 5, likedByMe: false };

  it("adds one like when the user likes the post", () => {
    expect(getOptimisticLike(confirmed, true)).toEqual({ likeCount: 6, likedByMe: true });
  });

  it("removes one like when the user takes the like back", () => {
    expect(getOptimisticLike({ likeCount: 6, likedByMe: true }, false)).toEqual({
      likeCount: 5,
      likedByMe: false,
    });
  });

  it("changes nothing when the choice is what the server already holds", () => {
    expect(getOptimisticLike(confirmed, false)).toBe(confirmed);
  });
});

describe("useLike", () => {
  it("shows the like at once, before the server answers", () => {
    const { tap, updatePost, requests } = renderLike();

    tap();

    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 6, likedByMe: true });
    expect(requests).toHaveLength(1);
    expect(requests[0].liked).toBe(true);
  });

  it("takes the numbers of the server when it answers", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();

    await settle(() => requests[0].answer.resolve({ likeCount: 9, likedByMe: true }));

    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 9, likedByMe: true });
  });

  it("rolls back when the server fails", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();

    await settle(() => requests[0].answer.reject(new Error("failed")));

    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 5, likedByMe: false });
  });

  it("lets the user try again after a failure", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();
    await settle(() => requests[0].answer.reject(new Error("failed")));

    tap();
    await settle(() => requests[1].answer.resolve({ likeCount: 6, likedByMe: true }));

    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 6, likedByMe: true });
  });

  it("ends in the state the user chose last after a quick double tap", async () => {
    const { tap, updatePost, requests } = renderLike();

    tap();
    tap();

    expect(requests.map((request) => request.liked)).toEqual([true, false]);
    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 5, likedByMe: false });

    await settle(() => requests[0].answer.resolve({ likeCount: 6, likedByMe: true }));
    await settle(() => requests[1].answer.resolve({ likeCount: 5, likedByMe: false }));

    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 5, likedByMe: false });
  });

  it("ignores an old response that arrives after a newer one", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();
    tap();

    await settle(() => requests[1].answer.resolve({ likeCount: 5, likedByMe: false }));
    const callsAfterNewest = updatePost.mock.calls.length;
    await settle(() => requests[0].answer.resolve({ likeCount: 6, likedByMe: true }));

    expect(updatePost).toHaveBeenCalledTimes(callsAfterNewest);
    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 5, likedByMe: false });
  });

  it("does not change the screen when the answer to an older tap arrives first", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();
    tap();
    const callsBefore = updatePost.mock.calls.length;

    await settle(() => requests[0].answer.resolve({ likeCount: 6, likedByMe: true }));

    expect(updatePost).toHaveBeenCalledTimes(callsBefore);
  });

  it("ignores the failure of an older tap", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();
    tap();
    const callsBefore = updatePost.mock.calls.length;

    await settle(() => requests[0].answer.reject(new Error("failed")));

    expect(updatePost).toHaveBeenCalledTimes(callsBefore);
  });

  it("rolls back to what the server holds, not to what it held before the first tap", async () => {
    const { tap, updatePost, requests } = renderLike();
    tap();
    tap();

    // The like was saved. The unlike then fails. So the server holds a like.
    await settle(() => requests[0].answer.resolve({ likeCount: 6, likedByMe: true }));
    await settle(() => requests[1].answer.reject(new Error("failed")));

    expect(updatePost).toHaveBeenLastCalledWith("p1", { likeCount: 6, likedByMe: true });
  });

  it("aborts its requests and changes nothing after the feed is removed", async () => {
    const { tap, updatePost, requests, unmount } = renderLike();
    tap();
    const callsBefore = updatePost.mock.calls.length;

    unmount();
    await settle(() => requests[0].answer.resolve({ likeCount: 6, likedByMe: true }));

    expect(requests[0].signal.aborted).toBe(true);
    expect(updatePost).toHaveBeenCalledTimes(callsBefore);
  });

  it("does not roll back for a request that was aborted", async () => {
    const { tap, updatePost, requests, unmount } = renderLike();
    tap();
    const callsBefore = updatePost.mock.calls.length;

    unmount();
    await settle(() => requests[0].answer.reject(new DOMException("cancelled", "AbortError")));

    expect(updatePost).toHaveBeenCalledTimes(callsBefore);
  });

  it("keeps the likes of two posts apart", async () => {
    const { result, updatePost, requests } = renderLike();

    act(() => result.current(makePost(1)));
    act(() => result.current(makePost(2)));
    await settle(() => requests[0].answer.reject(new Error("failed")));
    await settle(() => requests[1].answer.resolve({ likeCount: 6, likedByMe: true }));

    expect(updatePost).toHaveBeenCalledWith("p1", { likeCount: 5, likedByMe: false });
    expect(updatePost).toHaveBeenLastCalledWith("p2", { likeCount: 6, likedByMe: true });
  });
});
