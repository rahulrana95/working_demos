/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, renderHook } from "@testing-library/react";
import { createDeferred, flush, makePage, makePost } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import type { FeedPage, FetchPageFn } from "./types";
import { EMPTY_FEED, addPage, useFeed } from "./useFeed";

/** A fetch function whose answers the test gives by hand, one per request. */
function createManualFetch() {
  const requests: { cursor: string | null; signal: AbortSignal; answer: Deferred<FeedPage> }[] = [];
  const fetchPage: FetchPageFn = vi.fn((cursor, signal) => {
    const answer = createDeferred<FeedPage>();
    requests.push({ cursor, signal, answer });
    return answer.promise;
  });
  return { fetchPage, requests };
}

async function answer(deferred: Deferred<FeedPage>, page: FeedPage): Promise<void> {
  deferred.resolve(page);
  await flush();
}

async function fail(deferred: Deferred<FeedPage>): Promise<void> {
  deferred.reject(new Error("The server did not respond"));
  await flush();
}

describe("addPage", () => {
  it("adds the posts in the order the server sent them", () => {
    const state = addPage(EMPTY_FEED, makePage(1, 3));

    expect(state.order).toEqual(["p1", "p2", "p3"]);
    expect(state.postsById.p2.text).toBe("Text of post 2");
    expect(state.status).toBe("success");
  });

  it("skips a post that the feed already holds", () => {
    const first = addPage(EMPTY_FEED, makePage(1, 3));

    const second = addPage(first, makePage(3, 5));

    expect(second.order).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("keeps our copy of a known post, because it may hold a like that is not saved yet", () => {
    const first = addPage(EMPTY_FEED, {
      posts: [makePost(1, { likedByMe: true })],
      nextCursor: "p1",
    });

    const second = addPage(first, { posts: [makePost(1, { likedByMe: false })], nextCursor: "p1" });

    expect(second.postsById.p1.likedByMe).toBe(true);
  });

  it("says there is more while the server sends a next cursor", () => {
    expect(addPage(EMPTY_FEED, makePage(1, 3)).hasMore).toBe(true);
    expect(addPage(EMPTY_FEED, makePage(1, 3, true)).hasMore).toBe(false);
  });

  it("counts the posts of a later page, but not of the first page", () => {
    const first = addPage(EMPTY_FEED, makePage(1, 3));
    const second = addPage(first, makePage(3, 6));

    expect(first.lastAdded).toBe(0);
    // Post 3 was already there, so three posts are new.
    expect(second.lastAdded).toBe(3);
  });

  it("does not change the state it was given", () => {
    const first = addPage(EMPTY_FEED, makePage(1, 2));

    addPage(first, makePage(3, 4));

    expect(first.order).toEqual(["p1", "p2"]);
    expect(EMPTY_FEED.order).toEqual([]);
  });
});

describe("useFeed: the first page", () => {
  it("asks for the first page with no cursor as soon as it is used", () => {
    const { fetchPage, requests } = createManualFetch();

    const { result } = renderHook(() => useFeed(fetchPage));

    expect(requests).toHaveLength(1);
    expect(requests[0].cursor).toBeNull();
    expect(result.current.status).toBe("loading");
    expect(result.current.hasMore).toBe(true);
  });

  it("holds the posts by id and in order when the page arrives", async () => {
    const { fetchPage, requests } = createManualFetch();
    const { result } = renderHook(() => useFeed(fetchPage));

    await answer(requests[0].answer, makePage(1, 3));

    expect(result.current.status).toBe("success");
    expect(result.current.order).toEqual(["p1", "p2", "p3"]);
    expect(Object.keys(result.current.postsById)).toEqual(["p1", "p2", "p3"]);
  });

  it("reports an error with no posts when the first page fails", async () => {
    const { fetchPage, requests } = createManualFetch();
    const { result } = renderHook(() => useFeed(fetchPage));

    await fail(requests[0].answer);

    expect(result.current.status).toBe("error");
    expect(result.current.order).toEqual([]);
  });

  it("asks for the first page again on retry", async () => {
    const { fetchPage, requests } = createManualFetch();
    const { result } = renderHook(() => useFeed(fetchPage));
    await fail(requests[0].answer);

    act(() => result.current.retry());

    expect(requests).toHaveLength(2);
    expect(requests[1].cursor).toBeNull();
    expect(result.current.status).toBe("loading");

    await answer(requests[1].answer, makePage(1, 3));
    expect(result.current.order).toEqual(["p1", "p2", "p3"]);
  });
});

describe("useFeed: more pages", () => {
  async function renderWithFirstPage() {
    const manual = createManualFetch();
    const hook = renderHook(() => useFeed(manual.fetchPage));
    await answer(manual.requests[0].answer, makePage(1, 3));
    return { ...manual, ...hook };
  }

  it("asks for the next page with the cursor of the page before", async () => {
    const { result, requests } = await renderWithFirstPage();

    act(() => result.current.loadMore());

    expect(requests[1].cursor).toBe("p3");
    expect(result.current.status).toBe("loadingMore");

    await answer(requests[1].answer, makePage(4, 6));
    expect(result.current.order).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(result.current.lastAdded).toBe(3);
  });

  it("ignores a second loadMore while a page is loading", async () => {
    const { result, requests } = await renderWithFirstPage();

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(requests).toHaveLength(2);
  });

  it("ignores loadMore while the first page is still loading", () => {
    const { fetchPage, requests } = createManualFetch();
    const { result } = renderHook(() => useFeed(fetchPage));

    act(() => result.current.loadMore());

    expect(requests).toHaveLength(1);
  });

  it("does not show a post twice when two pages overlap", async () => {
    const { result, requests } = await renderWithFirstPage();

    act(() => result.current.loadMore());
    await answer(requests[1].answer, makePage(2, 5));

    expect(result.current.order).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("keeps the posts on screen when loading more fails", async () => {
    const { result, requests } = await renderWithFirstPage();

    act(() => result.current.loadMore());
    await fail(requests[1].answer);

    expect(result.current.status).toBe("error");
    expect(result.current.order).toEqual(["p1", "p2", "p3"]);
    expect(result.current.hasMore).toBe(true);
  });

  it("does not load again by itself after an error, so a broken server is not asked in a loop", async () => {
    const { result, requests } = await renderWithFirstPage();
    act(() => result.current.loadMore());
    await fail(requests[1].answer);

    act(() => result.current.loadMore());

    expect(requests).toHaveLength(2);
  });

  it("asks for the same page again on retry", async () => {
    const { result, requests } = await renderWithFirstPage();
    act(() => result.current.loadMore());
    await fail(requests[1].answer);

    act(() => result.current.retry());

    expect(requests[2].cursor).toBe("p3");
    await answer(requests[2].answer, makePage(4, 6));
    expect(result.current.status).toBe("success");
    expect(result.current.order).toHaveLength(6);
  });

  it("ignores retry when nothing has failed", async () => {
    const { result, requests } = await renderWithFirstPage();

    act(() => result.current.retry());

    expect(requests).toHaveLength(1);
  });

  it("stops asking after the last page", async () => {
    const { result, requests } = await renderWithFirstPage();
    act(() => result.current.loadMore());
    await answer(requests[1].answer, makePage(4, 6, true));

    act(() => result.current.loadMore());

    expect(result.current.hasMore).toBe(false);
    expect(requests).toHaveLength(2);
  });

  it("uses the newest fetch function without asking for the first page again", async () => {
    const first = createManualFetch();
    const second = createManualFetch();
    const { result, rerender } = renderHook(({ fetchPage }) => useFeed(fetchPage), {
      initialProps: { fetchPage: first.fetchPage },
    });
    await answer(first.requests[0].answer, makePage(1, 3));

    rerender({ fetchPage: second.fetchPage });
    expect(second.requests).toHaveLength(0);

    act(() => result.current.loadMore());
    expect(second.requests[0].cursor).toBe("p3");
  });
});

describe("useFeed: when the feed is removed", () => {
  it("aborts the request in flight", () => {
    const { fetchPage, requests } = createManualFetch();
    const { unmount } = renderHook(() => useFeed(fetchPage));

    unmount();

    expect(requests[0].signal.aborted).toBe(true);
  });

  it("ignores an answer that arrives after it was removed", async () => {
    const { fetchPage, requests } = createManualFetch();
    const { result, unmount } = renderHook(() => useFeed(fetchPage));
    unmount();

    await answer(requests[0].answer, makePage(1, 3));

    expect(result.current.order).toEqual([]);
    expect(result.current.status).toBe("loading");
  });

  it("does not report an error for a request that was aborted", async () => {
    const { fetchPage, requests } = createManualFetch();
    const { result, unmount } = renderHook(() => useFeed(fetchPage));
    unmount();

    requests[0].answer.reject(new DOMException("The request was cancelled", "AbortError"));
    await flush();

    expect(result.current.status).toBe("loading");
  });
});

describe("useFeed: updatePost", () => {
  it("changes one post and leaves the other post objects as they are", async () => {
    const { fetchPage, requests } = createManualFetch();
    const { result } = renderHook(() => useFeed(fetchPage));
    await answer(requests[0].answer, makePage(1, 3));
    const before = result.current.postsById;

    act(() => result.current.updatePost("p2", { likedByMe: true, likeCount: 6 }));

    expect(result.current.postsById.p2).toMatchObject({ likedByMe: true, likeCount: 6 });
    expect(result.current.postsById.p1).toBe(before.p1);
    expect(result.current.postsById.p3).toBe(before.p3);
    expect(result.current.order).toEqual(["p1", "p2", "p3"]);
  });
});
