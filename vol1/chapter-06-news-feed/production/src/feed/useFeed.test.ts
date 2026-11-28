/*
 * NOT PART OF THE INTERVIEW: production version.
 * The hook that loads pages. The state changes have their own tests in
 * `feedState.test.ts`. Here the test answers each request by hand.
 */
import { act, renderHook } from "@testing-library/react";
import { createFeedSession } from "./feedSession";
import type { FeedSession } from "./feedSession";
import { readCachedPage, writeCachedPage } from "./pageCache";
import { createDeferred, makePage, makePost } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import type { FeedEvent, FeedPage, FetchPageFn } from "./types";
import { useFeed } from "./useFeed";
import type { UseFeedOptions } from "./useFeed";

const TIMEOUT_MS = 10_000;
const CACHE_KEY = "feed:user-1";

/** Each test starts with a session that holds nothing. */
let session: FeedSession;

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

function renderFeedHook(extra: Partial<UseFeedOptions> = {}) {
  const manual = createManualFetch();
  const events: FeedEvent[] = [];
  const onSuccess = vi.fn();
  const hook = renderHook(() =>
    useFeed({
      fetchPage: manual.fetchPage,
      session,
      maxPosts: 500,
      timeoutMs: TIMEOUT_MS,
      onEvent: (event) => events.push(event),
      onSuccess,
      ...extra,
    }),
  );
  return { ...manual, ...hook, events, onSuccess };
}

/** Moves the fake clock forward and lets React finish its updates. */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function answer(deferred: Deferred<FeedPage>, page: FeedPage): Promise<void> {
  deferred.resolve(page);
  await wait(0);
}

async function fail(deferred: Deferred<FeedPage>): Promise<void> {
  deferred.reject(new Error("The server did not respond"));
  await wait(0);
}

/**
 * A feed with `pageCount` pages of 10 posts. The reader scrolls down as the
 * pages arrive: the first post on screen is always in the newest page.
 */
async function renderWithPages(pageCount: number, extra: Partial<UseFeedOptions> = {}) {
  const view = renderFeedHook(extra);
  await answer(view.requests[0].answer, makePage(1, 10));
  for (let page = 1; page < pageCount; page++) {
    session.anchor = { postId: `p${page * 10 - 5}`, offset: 0 };
    act(() => view.result.current.loadMore());
    await answer(view.requests[page].answer, makePage(page * 10 + 1, page * 10 + 10));
  }
  return view;
}

function setOnline(isOnline: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(isOnline);
}

beforeEach(() => {
  vi.useFakeTimers();
  session = createFeedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("useFeed: loading pages", () => {
  it("asks for the first page with no cursor as soon as it is used", () => {
    const { requests, result } = renderFeedHook();

    expect(requests).toHaveLength(1);
    expect(requests[0].cursor).toBeNull();
    expect(result.current.status).toBe("loading");
  });

  it("holds the posts by id and in order when the page arrives", async () => {
    const { result } = await renderWithPages(1);

    expect(result.current.status).toBe("success");
    expect(result.current.order).toHaveLength(10);
    expect(result.current.postsById.p3.text).toBe("Text of post 3");
  });

  it("asks for the next page with the cursor of the page before", async () => {
    const { result, requests } = await renderWithPages(1);

    act(() => result.current.loadMore());

    expect(requests[1].cursor).toBe("p10");
    expect(result.current.status).toBe("loadingMore");
  });

  it("ignores a second loadMore while a page is loading", async () => {
    const { result, requests } = await renderWithPages(1);

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(requests).toHaveLength(2);
  });

  it("does not show a post twice when two pages overlap", async () => {
    const { result, requests } = await renderWithPages(1);

    act(() => result.current.loadMore());
    await answer(requests[1].answer, makePage(8, 17));

    expect(result.current.order).toHaveLength(17);
    expect(new Set(result.current.order).size).toBe(17);
  });

  it("stops asking after the last page", async () => {
    const { result, requests } = await renderWithPages(1);
    act(() => result.current.loadMore());
    await answer(requests[1].answer, makePage(11, 15, true));

    act(() => result.current.loadMore());

    expect(result.current.hasMore).toBe(false);
    expect(requests).toHaveLength(2);
  });

  it("tells the caller that the network works after every page", async () => {
    const { onSuccess } = await renderWithPages(2);

    expect(onSuccess).toHaveBeenCalledTimes(2);
  });

  it("uses the newest fetch function without asking for the first page again", async () => {
    const first = createManualFetch();
    const second = createManualFetch();
    const options = { session, maxPosts: 500, timeoutMs: TIMEOUT_MS };
    const { result, rerender } = renderHook(({ fetchPage }) => useFeed({ ...options, fetchPage }), {
      initialProps: { fetchPage: first.fetchPage },
    });
    await answer(first.requests[0].answer, makePage(1, 10));

    rerender({ fetchPage: second.fetchPage });
    act(() => result.current.loadMore());

    expect(second.requests).toHaveLength(1);
    expect(second.requests[0].cursor).toBe("p10");
  });
});

describe("useFeed: failures", () => {
  it("keeps the posts on screen when loading more fails", async () => {
    const { result, requests } = await renderWithPages(1);

    act(() => result.current.loadMore());
    await fail(requests[1].answer);

    expect(result.current.status).toBe("error");
    expect(result.current.errorReason).toBe("failed");
    expect(result.current.order).toHaveLength(10);
  });

  it("does not load again by itself after an error, so a broken server is not asked in a loop", async () => {
    const { result, requests } = await renderWithPages(1);
    act(() => result.current.loadMore());
    await fail(requests[1].answer);

    act(() => result.current.loadMore());
    await wait(60_000);

    expect(requests).toHaveLength(2);
  });

  it("asks for the same page again on retry, and removes the error when it arrives", async () => {
    const { result, requests } = await renderWithPages(1);
    act(() => result.current.loadMore());
    await fail(requests[1].answer);

    act(() => result.current.retry());
    expect(requests[2].cursor).toBe("p10");

    await answer(requests[2].answer, makePage(11, 20));
    expect(result.current.status).toBe("success");
    expect(result.current.errorReason).toBeNull();
  });

  it("ignores retry when nothing has failed", async () => {
    const { result, requests } = await renderWithPages(1);

    act(() => result.current.retry());

    expect(requests).toHaveLength(1);
  });

  it("sends the request when the browser says it is offline, because that is only a hint", () => {
    setOnline(false);

    const { requests } = renderFeedHook();

    expect(requests).toHaveLength(1);
  });

  it("gives the reason “offline” when a request fails while the browser says it is offline", async () => {
    setOnline(false);
    const { requests, result } = renderFeedHook();

    await fail(requests[0].answer);

    expect(result.current.errorReason).toBe("offline");
  });

  it("treats a fetch function that throws at once like a failed request", async () => {
    const fetchPage: FetchPageFn = () => {
      throw new Error("broken before it started");
    };
    const { result } = renderFeedHook({ fetchPage });

    await wait(0);

    expect(result.current.status).toBe("error");
  });
});

describe("useFeed: the timeout", () => {
  it("fails with the reason “timeout” and aborts the request after ten seconds", async () => {
    const { requests, result } = renderFeedHook();

    await wait(TIMEOUT_MS - 1);
    expect(result.current.status).toBe("loading");

    await wait(1);
    expect(result.current.status).toBe("error");
    expect(result.current.errorReason).toBe("timeout");
    expect(requests[0].signal.aborted).toBe(true);
  });

  it("does not wait for a fetch function that ignores the abort signal", async () => {
    const { result } = renderFeedHook({ fetchPage: () => new Promise<FeedPage>(() => {}) });

    await wait(TIMEOUT_MS);

    expect(result.current.status).toBe("error");
  });

  it("ignores an answer that arrives after the timeout", async () => {
    const { requests, result } = renderFeedHook();
    await wait(TIMEOUT_MS);

    await answer(requests[0].answer, makePage(1, 10));

    expect(result.current.order).toEqual([]);
    expect(result.current.status).toBe("error");
  });

  it("lets the user retry after a timeout", async () => {
    const { requests, result } = renderFeedHook();
    await wait(TIMEOUT_MS);

    act(() => result.current.retry());
    await answer(requests[1].answer, makePage(1, 10));

    expect(result.current.status).toBe("success");
  });

  it("stops the timer when the answer arrives in time", async () => {
    const { result } = await renderWithPages(1);

    await wait(TIMEOUT_MS * 2);

    expect(result.current.status).toBe("success");
  });
});

describe("useFeed: when the feed is removed", () => {
  it("aborts the request in flight and stops its timer", async () => {
    const { requests, unmount, events } = renderFeedHook();

    unmount();
    await wait(TIMEOUT_MS * 2);

    expect(requests[0].signal.aborted).toBe(true);
    expect(events).toEqual([]);
  });

  it("ignores an answer or a failure that arrives after it was removed", async () => {
    const { requests, result, unmount, events } = renderFeedHook();
    unmount();

    requests[0].answer.reject(new DOMException("The request was cancelled", "AbortError"));
    await wait(0);

    expect(result.current.status).toBe("loading");
    expect(events).toEqual([]);
  });
});

describe("useFeed: the memory limit", () => {
  it("keeps the data of at most maxPosts posts, and every id", async () => {
    const { result } = await renderWithPages(6, { maxPosts: 30 });

    expect(Object.keys(result.current.postsById).length).toBeLessThanOrEqual(30);
    expect(result.current.order).toHaveLength(60);
  });

  it("drops the pages farthest from the post the reader is at", async () => {
    const { result } = await renderWithPages(6, { maxPosts: 30 });

    // The reader is at post 45. That page and the newest one stay, and the
    // first page always stays.
    expect(result.current.postsById.p55).toBeDefined();
    expect(result.current.postsById.p45).toBeDefined();
    expect(result.current.postsById.p5).toBeDefined();
    expect(result.current.postsById.p15).toBeUndefined();
    expect(result.current.postsById.p25).toBeUndefined();
  });

  it("fetches a dropped page again by its cursor when the reader scrolls back", async () => {
    const { result, requests } = await renderWithPages(6, { maxPosts: 30 });

    session.anchor = { postId: "p15", offset: 0 };
    act(() => result.current.restorePage("p15"));
    expect(requests[6].cursor).toBe("p10");

    await answer(requests[6].answer, makePage(11, 20));
    expect(result.current.postsById.p15.text).toBe("Text of post 15");
    expect(result.current.order).toHaveLength(60);
  });

  it("drops pages at the other end when a page comes back, so the limit still holds", async () => {
    const { result, requests } = await renderWithPages(6, { maxPosts: 30 });

    session.anchor = { postId: "p15", offset: 0 };
    act(() => result.current.restorePage("p15"));
    await answer(requests[6].answer, makePage(11, 20));

    expect(Object.keys(result.current.postsById).length).toBeLessThanOrEqual(30);
    expect(result.current.postsById.p55).toBeUndefined();
  });

  it("does not move the cursor of the feed when a page comes back", async () => {
    const { result, requests } = await renderWithPages(6, { maxPosts: 30 });
    act(() => result.current.restorePage("p15"));
    await answer(requests[6].answer, makePage(11, 20));

    act(() => result.current.loadMore());

    expect(requests[7].cursor).toBe("p60");
  });

  it("does nothing for a post whose data is in memory, or that is unknown", async () => {
    const { result, requests } = await renderWithPages(2);

    act(() => result.current.restorePage("p5"));
    act(() => result.current.restorePage("unknown"));

    expect(requests).toHaveLength(2);
  });

  it("sends one request when the same page is asked for many times", async () => {
    const { result, requests } = await renderWithPages(6, { maxPosts: 30 });

    act(() => {
      result.current.restorePage("p15");
      result.current.restorePage("p16");
      result.current.restorePage("p25");
    });

    expect(requests).toHaveLength(7);
  });

  it("marks the failure when a dropped page cannot be fetched, and does not ask again by itself", async () => {
    const { result, requests } = await renderWithPages(6, { maxPosts: 30 });
    act(() => result.current.restorePage("p15"));
    await fail(requests[6].answer);
    expect(result.current.restoreFailed).toBe(true);
    // The feed itself is fine: its posts and its status stay.
    expect(result.current.status).toBe("success");

    act(() => result.current.restorePage("p15"));
    expect(requests).toHaveLength(7);

    act(() => result.current.restorePage("p15", true));
    expect(requests).toHaveLength(8);
    expect(result.current.restoreFailed).toBe(false);
  });

  it("ignores a change to a post whose data was dropped", async () => {
    const { result } = await renderWithPages(6, { maxPosts: 30 });
    const before = result.current.postsById;

    act(() => result.current.updatePost("p15", { likedByMe: true }));

    expect(result.current.postsById).toBe(before);
  });
});

describe("useFeed: the saved first page", () => {
  it("saves the first page under the cache key", async () => {
    await renderWithPages(1, { cacheKey: CACHE_KEY });

    expect(readCachedPage(CACHE_KEY)?.posts).toHaveLength(10);
  });

  it("does not save later pages, and saves nothing without a cache key", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await renderWithPages(2, { cacheKey: CACHE_KEY });
    expect(setItem).toHaveBeenCalledTimes(1);

    session = createFeedSession();
    await renderWithPages(2);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("shows the saved posts at once, and still asks for the real first page", () => {
    writeCachedPage(CACHE_KEY, makePage(1, 10));

    const { result, requests } = renderFeedHook({ cacheKey: CACHE_KEY });

    expect(result.current.order).toHaveLength(10);
    expect(result.current.isFromCache).toBe(true);
    expect(result.current.status).toBe("loading");
    expect(requests).toHaveLength(1);
    expect(requests[0].cursor).toBeNull();
  });

  it("puts posts that are new since the save behind the pill, and updates the others in place", async () => {
    writeCachedPage(CACHE_KEY, makePage(1, 10));
    const { result, requests } = renderFeedHook({ cacheKey: CACHE_KEY });

    await answer(requests[0].answer, {
      posts: [makePost(21), makePost(1, { likeCount: 99 }), makePost(2)],
      nextCursor: "p2",
    });

    expect(result.current.order[0]).toBe("p1");
    expect(result.current.postsById.p1.likeCount).toBe(99);
    expect(result.current.waiting.map((post) => post.id)).toEqual(["p21"]);
    expect(result.current.isFromCache).toBe(false);
    expect(result.current.status).toBe("success");
  });

  it("goes on from the cursor of the real page, not of the saved one", async () => {
    writeCachedPage(CACHE_KEY, makePage(1, 10));
    const { result, requests } = renderFeedHook({ cacheKey: CACHE_KEY });
    await answer(requests[0].answer, makePage(1, 5));

    act(() => result.current.loadMore());

    expect(requests[1].cursor).toBe("p5");
  });

  it("does not load more from the saved page while the real one loads", () => {
    writeCachedPage(CACHE_KEY, makePage(1, 10));
    const { result, requests } = renderFeedHook({ cacheKey: CACHE_KEY });

    act(() => result.current.loadMore());

    expect(requests).toHaveLength(1);
  });

  it("keeps the saved posts on screen, with an error, when the real page fails", async () => {
    setOnline(false);
    writeCachedPage(CACHE_KEY, makePage(1, 10));
    const { result, requests } = renderFeedHook({ cacheKey: CACHE_KEY });

    await fail(requests[0].answer);

    expect(result.current.order).toHaveLength(10);
    expect(result.current.status).toBe("error");
    expect(result.current.errorReason).toBe("offline");

    act(() => result.current.retry());
    expect(requests[1].cursor).toBeNull();
  });

  it("prefers the session over the saved page when the feed comes back", async () => {
    writeCachedPage(CACHE_KEY, makePage(90, 99));
    const first = await renderWithPages(2, { cacheKey: CACHE_KEY });
    first.unmount();

    const { result, requests } = renderFeedHook({ cacheKey: CACHE_KEY });

    expect(result.current.order).toHaveLength(20);
    expect(result.current.isFromCache).toBe(false);
    expect(requests).toHaveLength(0);
  });
});

describe("useFeed: the session", () => {
  it("comes back with the same posts and sends no request", async () => {
    const first = await renderWithPages(2);
    first.unmount();

    const { result, requests } = renderFeedHook();

    expect(result.current.order).toHaveLength(20);
    expect(result.current.status).toBe("success");
    expect(requests).toHaveLength(0);
  });

  it("goes on from the saved cursor after it came back", async () => {
    const first = await renderWithPages(2);
    first.unmount();
    const { result, requests } = renderFeedHook();

    act(() => result.current.loadMore());

    expect(requests[0].cursor).toBe("p20");
  });

  it("comes back with the error and retries the same page", async () => {
    const first = await renderWithPages(1);
    act(() => first.result.current.loadMore());
    await fail(first.requests[1].answer);
    first.unmount();

    const { result, requests } = renderFeedHook();
    act(() => result.current.loadMore());
    expect(requests).toHaveLength(0);

    act(() => result.current.retry());
    expect(requests[0].cursor).toBe("p10");
  });
});

describe("useFeed: new posts", () => {
  it("holds new posts behind the pill and shows them when asked", async () => {
    const { result } = await renderWithPages(1);

    act(() => result.current.holdNew([makePost(22), makePost(21)]));
    expect(result.current.waiting).toHaveLength(2);
    expect(result.current.order[0]).toBe("p1");

    act(() => result.current.showWaiting());
    expect(result.current.order.slice(0, 3)).toEqual(["p22", "p21", "p1"]);
    expect(result.current.waiting).toEqual([]);
  });
});

describe("useFeed: new posts and the memory limit", () => {
  it("drops a far page when new posts from the pill would go over the limit", async () => {
    const { result } = await renderWithPages(4, { maxPosts: 30 });
    expect(Object.keys(result.current.postsById)).toHaveLength(30);
    session.anchor = { postId: "p1", offset: 0 };

    act(() => result.current.holdNew([makePost(99)]));
    act(() => result.current.showWaiting());

    expect(result.current.postsById.p99).toBeDefined();
    expect(Object.keys(result.current.postsById).length).toBeLessThanOrEqual(30);
  });
});

describe("useFeed: events", () => {
  it("reports the first load with its time and its size, then the page", async () => {
    const { events } = await renderWithPages(1);

    expect(events).toEqual([
      { type: "feed_loaded", durationMs: expect.any(Number), postCount: 10, fromCache: false },
      { type: "page_loaded", durationMs: expect.any(Number), postCount: 10, postsInMemory: 10 },
    ]);
  });

  it("measures the time of a page from the request to the answer", async () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { requests, events } = renderFeedHook();

    now += 350;
    await answer(requests[0].answer, makePage(1, 10));

    const pageLoaded = events.find((event) => event.type === "page_loaded");
    expect(pageLoaded).toMatchObject({ durationMs: 350 });
  });

  it("reports every later page with the number of posts in memory", async () => {
    const { events } = await renderWithPages(4, { maxPosts: 30 });

    const pages = events.filter((event) => event.type === "page_loaded");
    expect(pages).toHaveLength(4);
    expect(pages[3]).toMatchObject({ postCount: 10, postsInMemory: 30 });
    expect(events.filter((event) => event.type === "feed_loaded")).toHaveLength(1);
  });

  it("reports a feed that starts from the saved page as loaded from the cache", () => {
    writeCachedPage(CACHE_KEY, makePage(1, 10));

    const { events } = renderFeedHook({ cacheKey: CACHE_KEY });

    expect(events).toEqual([
      { type: "feed_loaded", durationMs: expect.any(Number), postCount: 10, fromCache: true },
    ]);
  });

  it("reports a failed page with its reason and whether it was the first page", async () => {
    const { result, requests, events } = await renderWithPages(1);
    act(() => result.current.loadMore());
    await fail(requests[1].answer);

    expect(events[events.length - 1]).toEqual({
      type: "load_failed",
      reason: "failed",
      isFirstPage: false,
    });
  });

  it("reports a timeout of the first page", async () => {
    const { events } = renderFeedHook();

    await wait(TIMEOUT_MS);

    expect(events).toEqual([{ type: "load_failed", reason: "timeout", isFirstPage: true }]);
  });

  it("does not report the feed as loaded again when it comes back from the session", async () => {
    const first = await renderWithPages(1);
    first.unmount();

    const { events } = renderFeedHook();

    expect(events).toEqual([]);
  });
});
