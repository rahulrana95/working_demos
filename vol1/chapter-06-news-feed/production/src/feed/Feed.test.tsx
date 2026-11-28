/*
 * NOT PART OF THE INTERVIEW: production version.
 * The feed as a whole, with a fake server that the test answers by hand.
 * The hooks and the plain modules have their own test files.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Feed } from "./Feed";
import type { FeedProps } from "./Feed";
import { createFeedSession } from "./feedSession";
import {
  FakeIntersectionObserver,
  FakeResizeObserver,
  createDeferred,
  flush,
  makePage,
  installFakeScroll,
  makePost,
  scrollPageTo,
} from "./testHelpers";
import type { Deferred } from "./testHelpers";
import { writeCachedPage } from "./pageCache";
import { LikeRejectedError } from "./types";
import type {
  FeedEvent,
  FeedPage,
  FeedStreamEvent,
  FetchNewerFn,
  FetchPageFn,
  LikeState,
  Post,
  SetLikeFn,
} from "./types";

const POLL_MS = 30_000;
/** The height the feed assumes for a post that was never measured. */
const ESTIMATE = 300;
/**
 * With this estimate the 768px screen of jsdom has room for 76 posts. The
 * tests that are not about the virtual list use it, so every post is drawn.
 */
const DRAW_ALL = { estimatedPostHeight: 10 };

/** A fake server. The test answers each request by hand. */
function renderFeed(extraProps: Partial<FeedProps> = {}) {
  const pages: Deferred<FeedPage>[] = [];
  const fetchPage: FetchPageFn = vi.fn(() => {
    const page = createDeferred<FeedPage>();
    pages.push(page);
    return page.promise;
  });

  const likes: Deferred<LikeState>[] = [];
  const setLike: SetLikeFn = vi.fn(() => {
    const like = createDeferred<LikeState>();
    likes.push(like);
    return like.promise;
  });

  const newer: Deferred<Post[]>[] = [];
  const fetchNewer: FetchNewerFn = vi.fn(() => {
    const posts = createDeferred<Post[]>();
    newer.push(posts);
    return posts.promise;
  });

  const view = render(
    <Feed
      label="News feed"
      fetchPage={fetchPage}
      setLike={setLike}
      fetchNewer={fetchNewer}
      pollMs={POLL_MS}
      estimatedPostHeight={ESTIMATE}
      {...extraProps}
    />,
  );
  return { ...view, pages, likes, newer, fetchPage, setLike, fetchNewer };
}

async function answer<T>(deferred: Deferred<T>, value: T): Promise<void> {
  deferred.resolve(value);
  await flush();
}

async function fail<T>(deferred: Deferred<T>): Promise<void> {
  deferred.reject(new Error("The server did not respond"));
  await flush();
  await flush();
}

/** The server says no for good. */
async function refuse<T>(deferred: Deferred<T>): Promise<void> {
  deferred.reject(new LikeRejectedError());
  await flush();
  await flush();
}

/** Renders the feed with the posts 1 to 10 on screen. */
async function renderWithFirstPage(
  page: FeedPage = makePage(1, 10),
  extraProps: Partial<FeedProps> = DRAW_ALL,
) {
  const view = renderFeed({ ...DRAW_ALL, ...extraProps });
  await answer(view.pages[0], page);
  return view;
}

function getFeed(): HTMLElement {
  return screen.getByRole("feed", { name: "News feed" });
}

function getPosts(): HTMLElement[] {
  return screen.queryAllByRole("article");
}

/** The element near the end of the list comes close to the screen. */
/** The observers that watch the end of the list. Impressions and videos have their own. */
function getSentinelObservers(): FakeIntersectionObserver[] {
  return FakeIntersectionObserver.live.filter(
    (observer) => observer.options.rootMargin !== undefined,
  );
}

function scrollNearTheEnd() {
  act(() => {
    for (const observer of getSentinelObservers()) {
      observer.trigger(true);
    }
  });
}

beforeEach(() => {
  FakeIntersectionObserver.install();
  FakeResizeObserver.install();
  installFakeScroll();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("Feed: the first page", () => {
  it("marks the feed as busy and shows placeholders while the first page loads", () => {
    const { container } = renderFeed();

    expect(getFeed()).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".feed__skeleton-post")).toHaveLength(3);
    expect(getPosts()).toHaveLength(0);
  });

  it("shows the posts and removes the placeholders when the page arrives", async () => {
    const { container } = await renderWithFirstPage();

    expect(getPosts()).toHaveLength(10);
    expect(getFeed()).toHaveAttribute("aria-busy", "false");
    expect(container.querySelector(".feed__skeleton")).toBeNull();
  });

  it("says so when the feed has no posts", async () => {
    await renderWithFirstPage({ posts: [], nextCursor: null });

    expect(screen.getByText("No posts yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows an error and a button when the first page fails", async () => {
    const { pages } = renderFeed();

    await fail(pages[0]);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the posts.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("loads the first page again when the user presses Try again", async () => {
    const { pages } = renderFeed(DRAW_ALL);
    await fail(pages[0]);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await answer(pages[1], makePage(1, 10));

    expect(getPosts()).toHaveLength(10);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Feed: loading more", () => {
  it("watches an element after the last post, and starts 600px before it is on screen", async () => {
    await renderWithFirstPage();

    const [observer] = getSentinelObservers();
    const [sentinel] = [...observer.elements];

    expect(observer.options.rootMargin).toBe("600px 0px");
    expect(sentinel.previousElementSibling).toBe(getFeed());
  });

  it("loads the next page when the end of the list comes near the screen", async () => {
    const { pages } = await renderWithFirstPage();

    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 20));

    expect(getPosts()).toHaveLength(20);
  });

  it("does not load while the end of the list is far from the screen", async () => {
    const { fetchPage } = await renderWithFirstPage();

    act(() => getSentinelObservers()[0].trigger(false));

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("sends one request when the end of the list is reported many times", async () => {
    const { fetchPage } = await renderWithFirstPage();
    const [observer] = getSentinelObservers();

    act(() => {
      observer.trigger(true);
      observer.trigger(true);
      observer.trigger(true);
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("checks again after every page, so a page that does not fill the screen is followed by the next", async () => {
    const { pages } = await renderWithFirstPage();
    const [firstObserver] = getSentinelObservers();

    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 20));
    const [secondObserver] = getSentinelObservers();

    // A new observer reports at once whether its element is near the screen.
    expect(firstObserver.isDisconnected).toBe(true);
    expect(secondObserver).not.toBe(firstObserver);
    expect(secondObserver.elements.size).toBe(1);
  });

  it("loads the next page from the button, for keyboard users", async () => {
    const { pages } = await renderWithFirstPage();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await answer(pages[1], makePage(11, 20));

    expect(getPosts()).toHaveLength(20);
  });

  it("still loads from the button in a browser without IntersectionObserver", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { pages } = await renderWithFirstPage();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await answer(pages[1], makePage(11, 20));

    expect(getPosts()).toHaveLength(20);
  });

  it("keeps the same button on the page while a page loads, so the focus is not lost", async () => {
    const { pages, fetchPage } = await renderWithFirstPage();
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();

    fireEvent.click(button);

    expect(button).toHaveTextContent("Loading posts…");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(button);

    // A press while the page loads sends nothing.
    fireEvent.click(button);
    expect(fetchPage).toHaveBeenCalledTimes(2);

    await answer(pages[1], makePage(11, 20));
    expect(document.activeElement).toBe(button);
    expect(button).toHaveTextContent("Load more");
  });

  it("does not show a post twice when two pages overlap", async () => {
    const { pages } = await renderWithFirstPage();

    scrollNearTheEnd();
    await answer(pages[1], makePage(8, 17));

    const names = getPosts().map((post) => within(post).getByRole("heading").textContent);
    expect(names).toHaveLength(17);
    expect(new Set(names).size).toBe(17);
  });

  it("stops watching when the feed is removed", async () => {
    const { unmount } = await renderWithFirstPage();

    unmount();

    expect(getSentinelObservers()).toHaveLength(0);
  });
});

describe("Feed: when loading more fails", () => {
  async function renderWithFailedSecondPage() {
    const view = await renderWithFirstPage();
    scrollNearTheEnd();
    await fail(view.pages[1]);
    return view;
  }

  it("keeps the posts and shows an error under them", async () => {
    await renderWithFailedSecondPage();

    expect(getPosts()).toHaveLength(10);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load more posts.");
  });

  it("does not ask the server again by itself", async () => {
    const { fetchPage } = await renderWithFailedSecondPage();

    // Nothing watches the end of the list while the error is shown.
    expect(getSentinelObservers()).toHaveLength(0);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("loads the page when the user presses Try again", async () => {
    const { pages } = await renderWithFailedSecondPage();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await answer(pages[2], makePage(11, 20));

    expect(getPosts()).toHaveLength(20);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the focus on the button when the user retries with the keyboard", async () => {
    await renderWithFailedSecondPage();
    const button = screen.getByRole("button", { name: "Try again" });
    button.focus();

    fireEvent.click(button);

    expect(document.activeElement).toBe(button);
  });
});

describe("Feed: the end", () => {
  it("says that there are no more posts, and removes the button", async () => {
    const { pages } = await renderWithFirstPage();

    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 15, true));

    expect(screen.getByText("You have seen all the posts.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
    expect(getSentinelObservers()).toHaveLength(0);
  });

  it("moves the focus from the button to the closing message", async () => {
    const { pages } = await renderWithFirstPage();
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();

    fireEvent.click(button);
    await answer(pages[1], makePage(11, 15, true));

    expect(document.activeElement).toBe(screen.getByText("You have seen all the posts."));
  });

  it("leaves the focus alone when it was not on the button", async () => {
    const { pages } = await renderWithFirstPage();
    getPosts()[0].focus();

    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 15, true));

    expect(document.activeElement).toBe(getPosts()[0]);
  });
});

describe("Feed: screen readers and keyboards", () => {
  it("gives every post its place in the feed and the author as its name", async () => {
    await renderWithFirstPage();
    const third = getPosts()[2];

    expect(third).toHaveAttribute("aria-posinset", "3");
    expect(third).toHaveAccessibleName("Author 3");
    expect(third).toHaveAttribute("tabindex", "0");
  });

  it("says the size of the feed is unknown while more can be loaded", async () => {
    await renderWithFirstPage();

    expect(getPosts()[0]).toHaveAttribute("aria-setsize", "-1");
  });

  it("gives the real size after the last page", async () => {
    await renderWithFirstPage(makePage(1, 4, true));

    expect(getPosts()[0]).toHaveAttribute("aria-setsize", "4");
  });

  it("announces how many posts were loaded, after they are on the page", async () => {
    const { pages } = await renderWithFirstPage();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    scrollNearTheEnd();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await answer(pages[1], makePage(11, 20));
    expect(screen.getByRole("status")).toHaveTextContent("10 more posts loaded");
  });

  it("empties the message while the next page loads, so the same count is read out again", async () => {
    const { pages } = await renderWithFirstPage();
    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 20));

    scrollNearTheEnd();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await answer(pages[2], makePage(21, 30));
    expect(screen.getByRole("status")).toHaveTextContent("10 more posts loaded");
  });

  it("says “1 more post loaded” for a single post", async () => {
    const { pages } = await renderWithFirstPage();

    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 11));

    expect(screen.getByRole("status")).toHaveTextContent("1 more post loaded");
  });

  it("moves the focus to the next post on Page Down and to the one before on Page Up", async () => {
    await renderWithFirstPage();
    const posts = getPosts();
    posts[0].focus();

    fireEvent.keyDown(posts[0], { key: "PageDown" });
    expect(document.activeElement).toBe(posts[1]);

    fireEvent.keyDown(posts[1], { key: "PageDown" });
    expect(document.activeElement).toBe(posts[2]);

    fireEvent.keyDown(posts[2], { key: "PageUp" });
    expect(document.activeElement).toBe(posts[1]);
  });

  it("moves from a button inside a post to the next post on Page Down", async () => {
    await renderWithFirstPage();
    const posts = getPosts();
    const likeButton = within(posts[0]).getByRole("button", { name: "Like" });
    likeButton.focus();

    fireEvent.keyDown(likeButton, { key: "PageDown" });

    expect(document.activeElement).toBe(posts[1]);
  });

  it("stops the browser from scrolling a page when it moves the focus", async () => {
    await renderWithFirstPage();
    const posts = getPosts();

    const wasNotPrevented = fireEvent.keyDown(posts[0], { key: "PageDown" });

    expect(wasNotPrevented).toBe(false);
  });

  it("leaves Page Up on the first post and Page Down on the last post to the browser", async () => {
    await renderWithFirstPage();
    const posts = getPosts();
    posts[0].focus();

    expect(fireEvent.keyDown(posts[0], { key: "PageUp" })).toBe(true);
    expect(document.activeElement).toBe(posts[0]);
    const last = posts[posts.length - 1];
    expect(fireEvent.keyDown(last, { key: "PageDown" })).toBe(true);
  });

  it("leaves other keys alone", async () => {
    await renderWithFirstPage();
    const posts = getPosts();
    posts[0].focus();

    expect(fireEvent.keyDown(posts[0], { key: "ArrowDown" })).toBe(true);
    expect(document.activeElement).toBe(posts[0]);
  });
});

describe("Feed: one post", () => {
  it("keeps the shape of the image before it loads, and loads it only near the screen", async () => {
    const media = { url: "/wide.jpg", width: 1200, height: 800, alt: "A lake at sunrise" };
    await renderWithFirstPage({ posts: [makePost(1, { media })], nextCursor: null });

    const image = screen.getByRole("img", { name: "A lake at sunrise" });
    const box = image.parentElement as HTMLElement;

    expect(box.style.aspectRatio).toBe("1200 / 800");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("draws no image box for a post without media", async () => {
    const { container } = await renderWithFirstPage();

    expect(container.querySelector(".post__media")).toBeNull();
  });

  it("shows the text of a post as text, never as HTML", async () => {
    const text = '<img src="x" onerror="alert(1)"> <b>bold</b>';
    const { container } = await renderWithFirstPage({
      posts: [makePost(1, { text })],
      nextCursor: null,
    });

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector(".post__text img, .post__text b")).toBeNull();
  });

  it("uses the singular for one like and one comment", async () => {
    await renderWithFirstPage({
      posts: [makePost(1, { likeCount: 1, commentCount: 1 })],
      nextCursor: null,
    });

    expect(screen.getByText("1 like")).toBeInTheDocument();
    expect(screen.getByText("1 comment")).toBeInTheDocument();
  });
});

describe("Feed: the like button", () => {
  function getLikeButton(postIndex = 0): HTMLElement {
    return within(getPosts()[postIndex]).getByRole("button", { name: "Like" });
  }

  it("is a toggle button that is not pressed for a post the user has not liked", async () => {
    await renderWithFirstPage();

    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    expect(within(getPosts()[0]).getByText("5 likes")).toBeInTheDocument();
  });

  it("is pressed at once, before the server answers", async () => {
    const { setLike } = await renderWithFirstPage();

    fireEvent.click(getLikeButton());

    expect(getLikeButton()).toHaveAttribute("aria-pressed", "true");
    expect(within(getPosts()[0]).getByText("6 likes")).toBeInTheDocument();
    expect(setLike).toHaveBeenCalledWith("p1", true, expect.any(AbortSignal), expect.any(String));
  });

  it("goes back and tells the user when the server refuses the like", async () => {
    const { likes } = await renderWithFirstPage();
    fireEvent.click(getLikeButton());

    await refuse(likes[0]);

    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    expect(within(getPosts()[0]).getByText("5 likes")).toBeInTheDocument();
    expect(within(getPosts()[0]).getByRole("alert")).toHaveTextContent("Could not save your like.");
    expect(within(getPosts()[1]).queryByRole("alert")).toBeNull();
  });

  it("keeps a like made with no network on screen, says that it waits, and sends it later", async () => {
    const { likes, pages, setLike } = await renderWithFirstPage();
    fireEvent.click(getLikeButton());

    await fail(likes[0]);
    expect(getLikeButton()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/We will send them when the connection is back/)).toBeInTheDocument();

    // Another request succeeds: the network is back. The like is sent again.
    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 20));
    expect(setLike).toHaveBeenCalledTimes(2);

    await answer(likes[1], { likeCount: 6, likedByMe: true });
    await flush();
    expect(screen.queryByText(/We will send them/)).toBeNull();
    expect(getLikeButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the offline wording when the browser says it is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { likes } = await renderWithFirstPage();
    fireEvent.click(getLikeButton());

    await fail(likes[0]);

    expect(screen.getByText(/You are offline. We will send your likes/)).toBeInTheDocument();
  });

  it("ends not pressed after a quick double tap, and sends the two choices in order", async () => {
    const { likes, setLike } = await renderWithFirstPage();

    fireEvent.click(getLikeButton());
    fireEvent.click(getLikeButton());
    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    // The unlike waits for the answer to the like.
    expect(setLike).toHaveBeenCalledTimes(1);

    await answer(likes[0], { likeCount: 6, likedByMe: true });
    await flush();
    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    expect(setLike).toHaveBeenLastCalledWith(
      "p1",
      false,
      expect.any(AbortSignal),
      expect.any(String),
    );

    await answer(likes[1], { likeCount: 5, likedByMe: false });
    await flush();
    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    expect(within(getPosts()[0]).getByText("5 likes")).toBeInTheDocument();
  });

  it("draws only the liked post again, not the other posts", async () => {
    let textReads = 0;
    // Counts how often a post that is not liked is drawn: each draw reads its text.
    const watched = makePost(2);
    Object.defineProperty(watched, "text", {
      get() {
        textReads += 1;
        return "Text of post 2";
      },
    });
    await renderWithFirstPage({ posts: [makePost(1), watched, makePost(3)], nextCursor: null });
    const readsBefore = textReads;

    fireEvent.click(getLikeButton(0));

    expect(getLikeButton(0)).toHaveAttribute("aria-pressed", "true");
    expect(textReads).toBe(readsBefore);
  });
});

describe("Feed: the virtual list", () => {
  /** Loads `count` posts in pages of 100, through the button. */
  async function renderWithManyPosts(count: number, extraProps: Partial<FeedProps> = {}) {
    const view = renderFeed(extraProps);
    await answer(view.pages[0], makePage(1, 100));
    for (let from = 101; from <= count; from += 100) {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await answer(view.pages[view.pages.length - 1], makePage(from, from + 99));
    }
    return view;
  }

  function getDrawnPositions(): number[] {
    return getPosts().map((post) => Number(post.getAttribute("aria-posinset")));
  }

  it("keeps a bounded number of posts in the DOM after loading 1,000", async () => {
    await renderWithManyPosts(1000);

    // The jsdom screen is 768px tall: 3 posts of 300px, plus 3 more below.
    expect(getPosts().length).toBeGreaterThan(0);
    expect(getPosts().length).toBeLessThanOrEqual(10);
  });

  it("still holds a bounded number of posts after scrolling to the middle and to the end", async () => {
    await renderWithManyPosts(1000);

    scrollPageTo(500 * ESTIMATE);
    expect(getPosts().length).toBeLessThanOrEqual(10);

    scrollPageTo(1000 * ESTIMATE);
    expect(getPosts().length).toBeLessThanOrEqual(10);
    expect(getPosts().length).toBeGreaterThan(0);
  });

  it("draws the posts at the scroll position, with three more above and below", async () => {
    await renderWithManyPosts(200);

    scrollPageTo(100 * ESTIMATE);

    // Posts 101, 102 and 103 are on the 768px screen.
    expect(getDrawnPositions()).toEqual([98, 99, 100, 101, 102, 103, 104, 105, 106]);
    expect(getPosts()[0]).toHaveAccessibleName("Author 98");
  });

  it("fills the room of the posts that are not drawn with empty space", async () => {
    await renderWithManyPosts(200);

    scrollPageTo(100 * ESTIMATE);

    expect(getFeed().style.paddingBlockStart).toBe(`${97 * ESTIMATE}px`);
    expect(getFeed().style.paddingBlockEnd).toBe(`${94 * ESTIMATE}px`);
  });

  it("uses the measured height of a post, not the estimate", async () => {
    await renderWithManyPosts(100);

    // Every post that is drawn turns out to be 500px tall.
    act(() => FakeResizeObserver.resize(() => ({ height: 500 })));
    scrollPageTo(2 * 500);

    // Posts 3 and 4 are on screen now (1000px to 1768px).
    expect(getDrawnPositions()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("scrolls by the difference when a post above the screen is not as tall as planned", async () => {
    await renderWithManyPosts(100);
    scrollPageTo(50 * ESTIMATE);

    // The first drawn post is above the screen and is 120px taller than the estimate.
    const [firstRow] = getPosts();
    act(() =>
      FakeResizeObserver.resize((row) =>
        row === firstRow ? { height: ESTIMATE + 120, top: -900 } : { height: ESTIMATE, top: 10 },
      ),
    );

    expect(window.scrollBy).toHaveBeenCalledTimes(1);
    expect(window.scrollBy).toHaveBeenCalledWith(0, 120);
  });

  it("does not scroll when a post on the screen changes its height", async () => {
    await renderWithManyPosts(100);

    act(() => FakeResizeObserver.resize(() => ({ height: 450, top: 10 })));

    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it("does not scroll for a post that is only partly above the screen", async () => {
    await renderWithManyPosts(100);

    act(() => FakeResizeObserver.resize(() => ({ height: 450, top: -200 })));

    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it("measures only the posts that are in the DOM", async () => {
    await renderWithManyPosts(200);

    scrollPageTo(100 * ESTIMATE);

    expect(new Set(FakeResizeObserver.watched)).toEqual(new Set(getPosts()));
  });

  it("draws nothing again for a scroll that shows the same posts", async () => {
    const renderPost = vi.fn((post: Post) => <p>{post.text}</p>);
    await renderWithManyPosts(100, { renderPost });
    scrollPageTo(50 * ESTIMATE);
    const drawsBefore = renderPost.mock.calls.length;

    scrollPageTo(50 * ESTIMATE + 40);

    expect(renderPost).toHaveBeenCalledTimes(drawsBefore);
  });

  it("draws only the post that enters when a scroll moves by one post", async () => {
    const renderPost = vi.fn((post: Post) => <p>{post.text}</p>);
    await renderWithManyPosts(100, { renderPost });
    scrollPageTo(50 * ESTIMATE);
    renderPost.mockClear();

    scrollPageTo(51 * ESTIMATE);

    expect(renderPost.mock.calls.map(([post]) => post.id)).toEqual(["p57"]);
  });

  it("uses the estimate and the overscan that the page passes", async () => {
    await renderWithManyPosts(100, { estimatedPostHeight: 768, overscan: 1 });

    // One post fills the screen. One more is drawn below it.
    expect(getDrawnPositions()).toEqual([1, 2]);
  });

  it("works in a browser without ResizeObserver, with the estimate for every post", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    await renderWithManyPosts(100);

    scrollPageTo(10 * ESTIMATE);

    expect(getDrawnPositions()[0]).toBe(8);
  });

  it("stops listening and measuring when the feed is removed", async () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = await renderWithManyPosts(100);

    unmount();

    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(FakeResizeObserver.watched).toHaveLength(0);
  });

  it("moves the focus with Page Down to a post that the overscan keeps ready", async () => {
    await renderWithManyPosts(100);
    scrollPageTo(50 * ESTIMATE);
    const posts = getPosts();
    const lastOnScreen = posts[5];
    lastOnScreen.focus();

    fireEvent.keyDown(lastOnScreen, { key: "PageDown" });

    expect(document.activeElement).toBe(posts[6]);
    expect(posts[6]).toHaveAttribute("aria-posinset", "54");
  });
});

describe("Feed: coming back to the feed", () => {
  /** Shows the feed, scrolls to post 14, and removes the feed, like a route change does. */
  async function renderScrollAndLeave(focusPost?: number) {
    const session = createFeedSession();
    const first = renderFeed({ session });
    await answer(first.pages[0], makePage(1, 100));

    // 4000px is 100px below the top of post 14 (13 posts of 300px).
    scrollPageTo(4000);
    if (focusPost !== undefined) {
      screen.getByRole("article", { name: `Author ${focusPost}` }).focus();
    }
    first.unmount();
    return session;
  }

  it("remembers the first post on screen and how far it was scrolled", async () => {
    const session = await renderScrollAndLeave();

    expect(session.anchor).toEqual({ postId: "p14", offset: 100 });
  });

  it("shows the same posts again without a request", async () => {
    const session = await renderScrollAndLeave();

    const { fetchPage } = renderFeed({ session });

    expect(fetchPage).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "Author 14" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Author 1" })).toBeNull();
    expect(getFeed()).toHaveAttribute("aria-busy", "false");
  });

  it("scrolls back to the same post at the same place", async () => {
    const session = await renderScrollAndLeave();
    // The page of the post is short, so the browser is back at the top.
    scrollPageTo(0);

    renderFeed({ session });

    // The fake page has the list at its top, so this is 13 × 300 + 100.
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 4000);
  });

  it("uses the measured heights to find the place again", async () => {
    const session = createFeedSession();
    const first = renderFeed({ session });
    await answer(first.pages[0], makePage(1, 100));
    act(() => FakeResizeObserver.resize(() => ({ height: 500 })));
    // 1200px is 200px below the top of post 3 (2 posts of 500px).
    scrollPageTo(1200);
    first.unmount();

    renderFeed({ session });

    expect(session.anchor).toEqual({ postId: "p3", offset: 200 });
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 1200);
  });

  it("does not scroll a feed that is shown for the first time", async () => {
    await renderWithFirstPage();

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll when the saved post is not in the feed any more", async () => {
    const session = await renderScrollAndLeave();
    scrollPageTo(0);
    vi.mocked(window.scrollTo).mockClear();
    session.anchor = { postId: "gone", offset: 100 };

    renderFeed({ session });

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "Author 1" })).toBeInTheDocument();
  });

  it("gives the keyboard focus back to the post that had it", async () => {
    const session = await renderScrollAndLeave(15);
    expect(session.focusedPostId).toBe("p15");

    renderFeed({ session });

    expect(document.activeElement).toBe(screen.getByRole("article", { name: "Author 15" }));
  });

  it("remembers the post when the focus was on a button inside it", async () => {
    const session = createFeedSession();
    await renderWithFirstPage(makePage(1, 10), { session });

    within(getPosts()[1]).getByRole("button", { name: "Like" }).focus();

    expect(session.focusedPostId).toBe("p2");
  });

  it("takes no focus when no post had it", async () => {
    const session = await renderScrollAndLeave();

    renderFeed({ session });

    expect(document.activeElement).toBe(document.body);
  });

  it("forgets the post when the focus leaves the feed", async () => {
    const session = createFeedSession();
    await renderWithFirstPage(makePage(1, 10), { session });
    getPosts()[0].focus();

    screen.getByRole("button", { name: "Load more" }).focus();

    expect(session.focusedPostId).toBeNull();
  });

  it("does not take the focus later, when the saved post was not near the saved place", async () => {
    const session = await renderScrollAndLeave();
    // The focus was on post 1, far above the place the user scrolled to.
    session.focusedPostId = "p1";
    renderFeed({ session });

    scrollPageTo(0);

    expect(screen.getByRole("article", { name: "Author 1" })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("Feed: new posts", () => {
  /** Shows the first page, then lets one poll bring `posts`. */
  async function renderWithNewPosts(posts: Post[]) {
    vi.useFakeTimers();
    const view = renderFeed();
    await act(async () => {
      view.pages[0].resolve(makePage(1, 10));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    await act(async () => {
      view.newer[0].resolve(posts);
      await vi.advanceTimersByTimeAsync(0);
    });
    return view;
  }

  it("shows no pill while there is nothing new", async () => {
    await renderWithNewPosts([]);

    expect(screen.queryByRole("button", { name: /new post/ })).toBeNull();
  });

  it("asks for posts newer than the first post of the feed", async () => {
    const { fetchNewer } = await renderWithNewPosts([]);

    expect(fetchNewer).toHaveBeenCalledWith("p1", expect.any(AbortSignal));
  });

  it("offers new posts in a pill and does not put them on the page by itself", async () => {
    await renderWithNewPosts([makePost(23), makePost(22), makePost(21)]);

    expect(screen.getByRole("button", { name: "3 new posts" })).toBeInTheDocument();
    expect(getPosts()[0]).toHaveAccessibleName("Author 1");
    expect(screen.queryByRole("article", { name: "Author 23" })).toBeNull();
  });

  it("says “1 new post” for a single post", async () => {
    await renderWithNewPosts([makePost(21)]);

    expect(screen.getByRole("button", { name: "1 new post" })).toBeInTheDocument();
  });

  it("puts the new posts at the top when the user presses the pill", async () => {
    await renderWithNewPosts([makePost(22), makePost(21)]);

    fireEvent.click(screen.getByRole("button", { name: "2 new posts" }));

    const names = getPosts().map((post) => within(post).getByRole("heading").textContent);
    expect(names.slice(0, 3)).toEqual(["Author 22", "Author 21", "Author 1"]);
    expect(getPosts()[0]).toHaveAttribute("aria-posinset", "1");
    expect(screen.queryByRole("button", { name: /new post/ })).toBeNull();
  });

  it("scrolls to the top of the feed and moves the focus to the first new post", async () => {
    await renderWithNewPosts([makePost(22), makePost(21)]);
    const pill = screen.getByRole("button", { name: "2 new posts" });
    pill.focus();

    fireEvent.click(pill);

    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(getFeed().parentElement);
    expect(document.activeElement).toBe(screen.getByRole("article", { name: "Author 22" }));
  });

  it("moves the focus to the first new post also when the user was far down the feed", async () => {
    await renderWithNewPosts([makePost(22), makePost(21)]);
    scrollPageTo(6 * ESTIMATE);
    expect(screen.queryByRole("article", { name: "Author 1" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "2 new posts" }));

    expect(document.activeElement).toBe(screen.getByRole("article", { name: "Author 22" }));
  });

  it("does not poll when the page passes no fetchNewer", async () => {
    vi.useFakeTimers();
    const view = renderFeed({ fetchNewer: undefined });
    await act(async () => {
      view.pages[0].resolve(makePage(1, 10));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });

    expect(view.fetchNewer).not.toHaveBeenCalled();
  });
});

describe("Feed: reuse by other teams", () => {
  it("uses the translated messages, and keeps the English text for the others", async () => {
    await renderWithFirstPage(makePage(1, 10), {
      messages: { like: "पसंद", loadMore: "और दिखाएँ" },
    });

    expect(within(getPosts()[0]).getByRole("button", { name: "पसंद" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "और दिखाएँ" })).toBeInTheDocument();
    expect(within(getPosts()[0]).getByText("5 likes")).toBeInTheDocument();
  });

  it("translates the message for screen readers too", async () => {
    const { pages } = await renderWithFirstPage(makePage(1, 10), {
      messages: { morePostsLoaded: (count) => `${count} और पोस्ट आ गईं` },
    });

    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 20));

    expect(screen.getByRole("status")).toHaveTextContent("10 और पोस्ट आ गईं");
  });

  it("shows the date through formatDate", async () => {
    await renderWithFirstPage(makePage(1, 1, true), { messages: { formatDate: () => "आज" } });

    expect(screen.getByText("आज")).toHaveAttribute("datetime", "2026-11-28T09:30:00.000Z");
  });

  it("draws a custom post inside the article, which keeps its place and its name", async () => {
    await renderWithFirstPage(makePage(1, 3), {
      renderPost: (post, { labelId }) => (
        <h3 id={labelId} data-testid="custom">
          Custom {post.id}
        </h3>
      ),
    });

    const second = getPosts()[1];
    expect(within(second).getByTestId("custom")).toHaveTextContent("Custom p2");
    expect(second).toHaveAccessibleName("Custom p2");
    expect(second).toHaveAttribute("aria-posinset", "2");
    expect(within(second).queryByRole("button", { name: "Like" })).toBeNull();
  });

  it("gives a custom post the like action and the failure mark", async () => {
    const { likes } = await renderWithFirstPage(makePage(1, 3), {
      renderPost: (post, { toggleLike, likeFailed }) => (
        <button type="button" onClick={toggleLike}>
          {post.likedByMe ? "Liked" : "Not liked"} {likeFailed ? "(failed)" : ""}
        </button>
      ),
    });
    const getButton = () => within(getPosts()[0]).getByRole("button");

    fireEvent.click(getButton());
    expect(getButton()).toHaveTextContent("Liked");

    await refuse(likes[0]);
    expect(getButton()).toHaveTextContent("Not liked (failed)");
  });

  it("makes the date a link to the page of the post when the page passes postHref", async () => {
    await renderWithFirstPage(makePage(1, 3), { postHref: (post) => `/posts/${post.id}` });

    const link = within(getPosts()[1]).getByRole("link");
    expect(link).toHaveAttribute("href", "/posts/p2");
    expect(link.querySelector("time")).not.toBeNull();
  });

  it("has no link without postHref", async () => {
    await renderWithFirstPage();

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("adds the class name of the page to the root element", async () => {
    const { container } = await renderWithFirstPage(makePage(1, 3), { className: "home-feed" });

    expect(container.firstElementChild).toHaveClass("feed", "home-feed");
  });
});

describe("Feed: the first page, production", () => {
  it("shows placeholders while the first page loads", () => {
    const { container } = renderFeed();

    expect(container.querySelectorAll(".feed__skeleton-post")).toHaveLength(3);
  });

  it("shows the saved first page at once, marked as busy, while the real one loads", () => {
    writeCachedPage("feed:user-1", makePage(1, 10));

    const { container } = renderFeed({ ...DRAW_ALL, cacheKey: "feed:user-1" });

    expect(getPosts()).toHaveLength(10);
    expect(getFeed()).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".feed__skeleton")).toBeNull();
    // No loading from a saved cursor: nothing watches the end of the list yet.
    expect(getSentinelObservers()).toHaveLength(0);
  });

  it("keeps the saved posts where they are and offers the newer ones in the pill", async () => {
    writeCachedPage("feed:user-1", makePage(1, 10));
    const { pages } = renderFeed({ ...DRAW_ALL, cacheKey: "feed:user-1" });
    getPosts()[2].focus();

    await answer(pages[0], { posts: [makePost(21), ...makePage(1, 9).posts], nextCursor: "p9" });

    expect(getPosts()[0]).toHaveAccessibleName("Author 1");
    expect(document.activeElement).toBe(getPosts()[2]);
    expect(screen.getByRole("button", { name: "1 new post" })).toBeInTheDocument();
  });

  it("says “You are offline.” when a page fails while the browser says it is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { pages } = renderFeed();

    await fail(pages[0]);

    expect(screen.getByRole("alert")).toHaveTextContent("You are offline.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says that the posts took too long after the timeout", async () => {
    vi.useFakeTimers();
    renderFeed({ timeoutMs: 2000 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("The posts took too long to load.");
  });
});

describe("Feed: the memory limit", () => {
  /** Loads `count` posts in pages of 10 while the reader scrolls down with them. */
  async function renderAndScrollDown(count: number, extraProps: Partial<FeedProps> = {}) {
    const view = renderFeed({ maxPosts: 30, ...extraProps });
    await answer(view.pages[0], makePage(1, 10));
    for (let from = 11; from <= count; from += 10) {
      scrollPageTo((from - 5) * ESTIMATE);
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await answer(view.pages[view.pages.length - 1], makePage(from, from + 9));
    }
    return view;
  }

  it("keeps the height of the feed when the data of far posts is dropped", async () => {
    await renderAndScrollDown(60);

    const { paddingBlockStart, paddingBlockEnd } = getFeed().style;
    const drawn = getPosts().length;

    // 60 posts of 300px, whatever is in memory.
    expect(parseFloat(paddingBlockStart) + parseFloat(paddingBlockEnd) + drawn * ESTIMATE).toBe(
      60 * ESTIMATE,
    );
  });

  it("shows a placeholder with the height of the post, and fetches its page again", async () => {
    const { fetchPage } = await renderAndScrollDown(60);
    const requestsBefore = vi.mocked(fetchPage).mock.calls.length;

    scrollPageTo(14 * ESTIMATE);

    const placeholder = getPosts().find((post) => post.getAttribute("aria-busy") === "true");
    expect(placeholder).toHaveAccessibleName("Loading this post…");
    expect(placeholder?.style.blockSize).toBe(`${ESTIMATE}px`);
    expect(placeholder).toHaveAttribute("aria-posinset");
    expect(fetchPage).toHaveBeenCalledTimes(requestsBefore + 1);
    expect(fetchPage).toHaveBeenLastCalledWith("p10", expect.any(AbortSignal));
  });

  it("draws the post again at the same place when its page arrives", async () => {
    const { pages } = await renderAndScrollDown(60);
    scrollPageTo(14 * ESTIMATE);

    await answer(pages[pages.length - 1], makePage(11, 20));

    const post = screen.getByRole("article", { name: "Author 15" });
    expect(post).toHaveAttribute("aria-posinset", "15");
    expect(within(post).getByText("Text of post 15")).toBeInTheDocument();
  });

  it("shows an error with Try again in the placeholder when its page cannot be fetched", async () => {
    const { pages, fetchPage } = await renderAndScrollDown(60);
    scrollPageTo(14 * ESTIMATE);
    await fail(pages[pages.length - 1]);
    const requestsAfterFailure = vi.mocked(fetchPage).mock.calls.length;

    const [retryButton] = screen.getAllByRole("button", { name: "Try again" });
    // No request by itself after the failure.
    scrollPageTo(14 * ESTIMATE + 10);
    expect(fetchPage).toHaveBeenCalledTimes(requestsAfterFailure);

    fireEvent.click(retryButton);
    expect(fetchPage).toHaveBeenCalledTimes(requestsAfterFailure + 1);

    await answer(pages[pages.length - 1], makePage(11, 20));
    expect(screen.getByRole("article", { name: "Author 15" })).toBeInTheDocument();
  });
});

describe("Feed: the live connection", () => {
  function renderWithStream() {
    let send: (event: FeedStreamEvent) => void = () => {};
    const subscribe = vi.fn((onEvent: (event: FeedStreamEvent) => void) => {
      send = onEvent;
      return () => {};
    });
    return { subscribe, send: (event: FeedStreamEvent) => act(() => send(event)) };
  }

  it("offers a post from the stream in the pill, and does not put it on the page", async () => {
    const stream = renderWithStream();
    await renderWithFirstPage(makePage(1, 10), { subscribe: stream.subscribe });

    stream.send({ type: "post", post: makePost(21) });

    expect(screen.getByRole("button", { name: "1 new post" })).toBeInTheDocument();
    expect(getPosts()[0]).toHaveAccessibleName("Author 1");
  });

  it("catches up with fetchNewer when the connection opens", async () => {
    const stream = renderWithStream();
    const { fetchNewer, newer } = await renderWithFirstPage(makePage(1, 10), {
      subscribe: stream.subscribe,
    });

    stream.send({ type: "open" });
    expect(fetchNewer).toHaveBeenCalledWith("p1", expect.any(AbortSignal));

    await answer(newer[0], [makePost(22), makePost(21)]);
    expect(screen.getByRole("button", { name: "2 new posts" })).toBeInTheDocument();
  });

  it("does not subscribe before the first page is there", () => {
    const stream = renderWithStream();

    renderFeed({ subscribe: stream.subscribe });

    expect(stream.subscribe).not.toHaveBeenCalled();
  });
});

describe("Feed: one broken post", () => {
  /** The server sends post 2 with no author. Drawing it throws. */
  function pageWithBrokenPost(): FeedPage {
    const page = makePage(1, 3, true);
    page.posts[1] = { ...page.posts[1], author: null as unknown as Post["author"] };
    return page;
  }

  beforeEach(() => {
    // React logs every error that a boundary catches. That is expected here.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows a message in place of the broken post and still draws the others", async () => {
    await renderWithFirstPage(pageWithBrokenPost());

    const posts = getPosts();
    expect(posts).toHaveLength(3);
    expect(posts[1]).toHaveTextContent("This post cannot be shown.");
    expect(posts[1]).toHaveAccessibleName("This post cannot be shown.");
    expect(posts[0]).toHaveTextContent("Text of post 1");
    expect(posts[2]).toHaveTextContent("Text of post 3");
  });

  it("reports the id of the broken post", async () => {
    const onEvent = vi.fn();

    await renderWithFirstPage(pageWithBrokenPost(), { onEvent });

    expect(onEvent).toHaveBeenCalledWith({ type: "post_render_failed", postId: "p2" });
  });

  it("catches an error from the page's own renderPost too", async () => {
    await renderWithFirstPage(makePage(1, 3, true), {
      renderPost: (post) => {
        if (post.id === "p2") {
          throw new Error("custom post failed");
        }
        return <p>{post.text}</p>;
      },
    });

    expect(getPosts()[1]).toHaveTextContent("This post cannot be shown.");
    expect(getPosts()[2]).toHaveTextContent("Text of post 3");
  });
});

describe("Feed: events", () => {
  /** The observer that counts impressions reports at half of a post. */
  function getImpressionObserver(): FakeIntersectionObserver {
    const observer = FakeIntersectionObserver.live.find(
      (candidate) => candidate.options.threshold === 0.5 && candidate.elements.size > 1,
    );
    if (observer === undefined) {
      throw new Error("No impression observer");
    }
    return observer;
  }

  it("reports the posts that were half on screen for one second, in one batch", async () => {
    vi.useFakeTimers();
    const events: FeedEvent[] = [];
    const view = renderFeed({ ...DRAW_ALL, onEvent: (event) => events.push(event) });
    await act(async () => {
      view.pages[0].resolve(makePage(1, 10));
      await vi.advanceTimersByTimeAsync(0);
    });
    const [first, second] = getPosts();

    act(() => {
      getImpressionObserver().triggerFor(first, 1);
      getImpressionObserver().triggerFor(second, 0.6);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000 + 5000);
    });

    expect(events).toContainEqual({ type: "post_impression", postIds: ["p1", "p2"] });
  });

  it("sends the impressions that wait when the feed is removed", async () => {
    vi.useFakeTimers();
    const events: FeedEvent[] = [];
    const view = renderFeed({ ...DRAW_ALL, onEvent: (event) => events.push(event) });
    await act(async () => {
      view.pages[0].resolve(makePage(1, 10));
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => getImpressionObserver().triggerFor(getPosts()[0], 1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    view.unmount();

    expect(events).toContainEqual({ type: "post_impression", postIds: ["p1"] });
  });

  it("never puts the text of a post or the name of an author in an event", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const events: FeedEvent[] = [];
    const secretPosts = makePage(1, 10).posts.map((post) => ({
      ...post,
      text: `SECRET-TEXT ${post.id}`,
      author: { ...post.author, name: "SECRET-NAME" },
      media: { url: "/secret-url.jpg", width: 4, height: 3, alt: "SECRET-ALT" },
    }));
    // One post is broken, so the error event is sent too.
    secretPosts[9] = { ...secretPosts[9], author: null as unknown as Post["author"] };
    const view = renderFeed({ ...DRAW_ALL, onEvent: (event) => events.push(event) });
    await act(async () => {
      view.pages[0].resolve({ posts: secretPosts, nextCursor: "p10" });
      await vi.advanceTimersByTimeAsync(0);
    });

    // Every kind of event: impression, like, refused like, failed page.
    act(() => getImpressionObserver().triggerFor(getPosts()[0], 1));
    fireEvent.click(within(getPosts()[0]).getByRole("button", { name: "Like" }));
    await act(async () => {
      view.likes[0].reject(new LikeRejectedError());
      await vi.advanceTimersByTimeAsync(6000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await act(async () => {
      view.pages[1].reject(new Error("failed"));
      await vi.advanceTimersByTimeAsync(0);
    });

    const types = new Set(events.map((event) => event.type));
    expect(types).toEqual(
      new Set([
        "feed_loaded",
        "page_loaded",
        "load_failed",
        "post_impression",
        "like_toggled",
        "like_failed",
        "post_render_failed",
      ]),
    );
    expect(JSON.stringify(events)).not.toMatch(/SECRET|secret-url/);
  });
});
