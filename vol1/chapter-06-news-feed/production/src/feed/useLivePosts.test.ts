/*
 * NOT PART OF THE INTERVIEW: production version.
 * The live connection, with a fake stream and a fake clock.
 */
import { act, renderHook } from "@testing-library/react";
import { createDeferred, makePost } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import type { FeedStreamEvent, FetchNewerFn, Post, SubscribeFn } from "./types";
import { useLivePosts } from "./useLivePosts";
import type { UseLivePostsOptions } from "./useLivePosts";

/** A stream that the test drives: it records every connection and can send events. */
function createFakeStream() {
  const connections: { send: (event: FeedStreamEvent) => void; isClosed: boolean }[] = [];
  const subscribe: SubscribeFn = vi.fn((onEvent) => {
    const connection = { send: onEvent, isClosed: false };
    connections.push(connection);
    return () => {
      connection.isClosed = true;
    };
  });
  const open = () => connections.filter((connection) => !connection.isClosed);
  return { subscribe, connections, open };
}

function renderLive(extra: Partial<UseLivePostsOptions> = {}) {
  const stream = createFakeStream();
  const catchUps: { sinceId: string | null; signal: AbortSignal; answer: Deferred<Post[]> }[] = [];
  const fetchNewer: FetchNewerFn = vi.fn((sinceId, signal) => {
    const answer = createDeferred<Post[]>();
    catchUps.push({ sinceId, signal, answer });
    return answer.promise;
  });
  const onPosts = vi.fn();
  const onSuccess = vi.fn();
  const options: UseLivePostsOptions = {
    subscribe: stream.subscribe,
    fetchNewer,
    pollMs: 30_000,
    newestId: "p1",
    isReady: true,
    onPosts,
    onSuccess,
    ...extra,
  };
  const hook = renderHook((props: UseLivePostsOptions) => useLivePosts(props), {
    initialProps: options,
  });
  return { ...hook, ...stream, catchUps, fetchNewer, onPosts, onSuccess, options };
}

function setTabHidden(isHidden: boolean) {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(isHidden ? "hidden" : "visible");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // No jitter: the wait is the full wait.
  vi.spyOn(Math, "random").mockReturnValue(1);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useLivePosts: the connection", () => {
  it("subscribes once the first page is there", () => {
    const { subscribe } = renderLive();

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe before the first page is there", () => {
    const { subscribe } = renderLive({ isReady: false });

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("does nothing when the page passes no subscribe and no fetchNewer", async () => {
    const { onPosts } = renderLive({ subscribe: undefined, fetchNewer: undefined });

    await wait(120_000);

    expect(onPosts).not.toHaveBeenCalled();
  });

  it("hands a post from the stream to the feed", () => {
    const { connections, onPosts } = renderLive();

    act(() => connections[0].send({ type: "post", post: makePost(21) }));

    expect(onPosts).toHaveBeenCalledWith([makePost(21)]);
  });

  it("keeps one connection when the parent passes new functions or a new post arrives", () => {
    const { subscribe, rerender, options, open } = renderLive();

    rerender({ ...options, onPosts: vi.fn(), newestId: "p21", subscribe: vi.fn() });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(open()).toHaveLength(1);
  });

  it("closes the connection when the feed is removed", () => {
    const { unmount, open } = renderLive();

    unmount();

    expect(open()).toHaveLength(0);
  });
});

describe("useLivePosts: catching up", () => {
  it("asks for the posts it missed when the connection opens", () => {
    const { connections, catchUps } = renderLive();

    act(() => connections[0].send({ type: "open" }));

    expect(catchUps).toHaveLength(1);
    expect(catchUps[0].sinceId).toBe("p1");
  });

  it("hands the missed posts to the feed and reports that the network works", async () => {
    const { connections, catchUps, onPosts, onSuccess } = renderLive();
    act(() => connections[0].send({ type: "open" }));

    catchUps[0].answer.resolve([makePost(22), makePost(21)]);
    await wait(0);

    expect(onPosts).toHaveBeenCalledWith([makePost(22), makePost(21)]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("asks from the newest post the feed knows at that moment", () => {
    const { connections, catchUps, rerender, options } = renderLive();
    rerender({ ...options, newestId: "p30" });

    act(() => connections[0].send({ type: "open" }));

    expect(catchUps[0].sinceId).toBe("p30");
  });

  it("shows nothing and reports nothing when the catch-up fails", async () => {
    const { connections, catchUps, onPosts, onSuccess } = renderLive();
    act(() => connections[0].send({ type: "open" }));

    catchUps[0].answer.reject(new Error("failed"));
    await wait(0);

    expect(onPosts).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("aborts the catch-up and ignores its answer after the feed is removed", async () => {
    const { connections, catchUps, onPosts, unmount } = renderLive();
    act(() => connections[0].send({ type: "open" }));

    unmount();
    catchUps[0].answer.resolve([makePost(21)]);
    await wait(0);

    expect(catchUps[0].signal.aborted).toBe(true);
    expect(onPosts).not.toHaveBeenCalled();
  });

  it("opens a connection without catching up when the page passes no fetchNewer", () => {
    const { connections, subscribe } = renderLive({ fetchNewer: undefined });

    expect(() => act(() => connections[0].send({ type: "open" }))).not.toThrow();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useLivePosts: reconnecting", () => {
  it("waits one second before it subscribes again after the connection dropped", async () => {
    const { connections, subscribe } = renderLive();

    act(() => connections[0].send({ type: "closed" }));
    expect(connections[0].isClosed).toBe(true);

    await wait(999);
    expect(subscribe).toHaveBeenCalledTimes(1);

    await wait(1);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("doubles the wait with every try that fails: 1, 2, 4 and 8 seconds", async () => {
    const { connections, subscribe } = renderLive();

    for (const [attempt, waitMs] of [1000, 2000, 4000, 8000].entries()) {
      act(() => connections[attempt].send({ type: "closed" }));

      await wait(waitMs - 1);
      expect(subscribe).toHaveBeenCalledTimes(attempt + 1);

      await wait(1);
      expect(subscribe).toHaveBeenCalledTimes(attempt + 2);
    }
  });

  it("never waits longer than 30 seconds", async () => {
    const { connections, subscribe } = renderLive();

    for (let attempt = 0; attempt < 12; attempt++) {
      act(() => connections[attempt].send({ type: "closed" }));
      await wait(30_000);
    }

    expect(subscribe).toHaveBeenCalledTimes(13);
  });

  it("takes away a random part of the wait, so feeds do not reconnect in the same instant", async () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const { connections, subscribe } = renderLive();

    act(() => connections[0].send({ type: "closed" }));
    await wait(500);

    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("starts with the short wait again after a connection opened", async () => {
    const { connections, subscribe } = renderLive();
    act(() => connections[0].send({ type: "closed" }));
    await wait(1000);
    act(() => connections[1].send({ type: "closed" }));
    await wait(2000);

    act(() => connections[2].send({ type: "open" }));
    act(() => connections[2].send({ type: "closed" }));
    await wait(1000);

    expect(subscribe).toHaveBeenCalledTimes(4);
  });

  it("catches up after it has reconnected", async () => {
    const { connections, catchUps } = renderLive();
    act(() => connections[0].send({ type: "closed" }));
    await wait(1000);

    act(() => connections[1].send({ type: "open" }));

    expect(catchUps).toHaveLength(1);
  });

  it("does not reconnect after the feed is removed", async () => {
    const { connections, subscribe, unmount } = renderLive();
    act(() => connections[0].send({ type: "closed" }));

    unmount();
    await wait(60_000);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useLivePosts: a hidden tab", () => {
  it("closes the connection when the tab is hidden", () => {
    const { open } = renderLive();

    setTabHidden(true);

    expect(open()).toHaveLength(0);
  });

  it("subscribes again and catches up when the tab is shown again", () => {
    const { connections, subscribe, catchUps, open } = renderLive();
    setTabHidden(true);

    setTabHidden(false);
    act(() => connections[1].send({ type: "open" }));

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(open()).toHaveLength(1);
    expect(catchUps).toHaveLength(1);
  });

  it("does not reconnect while the tab is hidden", async () => {
    const { connections, subscribe } = renderLive();
    act(() => connections[0].send({ type: "closed" }));

    setTabHidden(true);
    await wait(60_000);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when the feed appears in a hidden tab, and does when the tab is shown", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { subscribe } = renderLive();
    expect(subscribe).not.toHaveBeenCalled();

    setTabHidden(false);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useLivePosts: the poll, when there is no live connection", () => {
  it("asks for newer posts every 30 seconds", async () => {
    const { catchUps } = renderLive({ subscribe: undefined });

    await wait(29_999);
    expect(catchUps).toHaveLength(0);

    await wait(1);
    expect(catchUps).toHaveLength(1);
    expect(catchUps[0].sinceId).toBe("p1");
  });

  it("hands the posts to the feed", async () => {
    const { catchUps, onPosts } = renderLive({ subscribe: undefined });
    await wait(30_000);

    catchUps[0].answer.resolve([makePost(21)]);
    await wait(0);

    expect(onPosts).toHaveBeenCalledWith([makePost(21)]);
  });

  it("starts the next wait only after the last poll has answered", async () => {
    const { catchUps } = renderLive({ subscribe: undefined });
    await wait(30_000);

    // The server is slow: three poll times pass with no answer.
    await wait(90_000);
    expect(catchUps).toHaveLength(1);

    catchUps[0].answer.resolve([]);
    await wait(30_000);
    expect(catchUps).toHaveLength(2);
  });

  it("tries again at the next poll time after a failed poll", async () => {
    const { catchUps, onPosts } = renderLive({ subscribe: undefined });
    await wait(30_000);

    catchUps[0].answer.reject(new Error("failed"));
    await wait(30_000);

    expect(catchUps).toHaveLength(2);
    expect(onPosts).not.toHaveBeenCalled();
  });

  it("does not poll while the tab is hidden", async () => {
    const { catchUps } = renderLive({ subscribe: undefined });

    setTabHidden(true);
    await wait(120_000);
    expect(catchUps).toHaveLength(0);

    setTabHidden(false);
    await wait(30_000);
    expect(catchUps).toHaveLength(1);
  });

  it("does not poll before the first page is there", async () => {
    const { catchUps } = renderLive({ subscribe: undefined, isReady: false });

    await wait(120_000);

    expect(catchUps).toHaveLength(0);
  });

  it("does not poll when there is a live connection", async () => {
    const { catchUps } = renderLive();

    await wait(120_000);

    expect(catchUps).toHaveLength(0);
  });

  it("stops the poll and aborts it when the feed is removed", async () => {
    const { catchUps, unmount } = renderLive({ subscribe: undefined });
    await wait(30_000);

    unmount();
    await wait(120_000);

    expect(catchUps[0].signal.aborted).toBe(true);
    expect(catchUps).toHaveLength(1);
  });
});
