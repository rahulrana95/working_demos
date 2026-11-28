/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through one or two.
 * Here they are written as tests, so you can see that the code handles them.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Feed } from "./Feed";
import { FakeIntersectionObserver, createDeferred, flush, makePage, makePost } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import type { FeedPage, FetchPageFn, LikeState, SetLikeFn } from "./types";

/** A fake server. The test answers each request by hand. */
function renderFeed() {
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

  const view = render(<Feed label="News feed" fetchPage={fetchPage} setLike={setLike} />);
  return { ...view, pages, likes, fetchPage, setLike };
}

async function answer<T>(deferred: Deferred<T>, value: T): Promise<void> {
  deferred.resolve(value);
  await flush();
}

async function fail<T>(deferred: Deferred<T>): Promise<void> {
  deferred.reject(new Error("The server did not respond"));
  await flush();
}

/** Renders the feed with the posts 1 to 10 on screen. */
async function renderWithFirstPage(page: FeedPage = makePage(1, 10)) {
  const view = renderFeed();
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
function scrollNearTheEnd() {
  act(() => {
    for (const observer of FakeIntersectionObserver.live) {
      observer.trigger(true);
    }
  });
}

beforeEach(() => {
  FakeIntersectionObserver.install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Feed: the first page", () => {
  it("marks the feed as busy and says so on the button while the first page loads", () => {
    renderFeed();

    expect(getFeed()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Loading posts…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(getPosts()).toHaveLength(0);
  });

  it("shows the posts when the page arrives", async () => {
    await renderWithFirstPage();

    expect(getPosts()).toHaveLength(10);
    expect(getFeed()).toHaveAttribute("aria-busy", "false");
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
    const { pages } = renderFeed();
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

    const [observer] = FakeIntersectionObserver.live;
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

    act(() => FakeIntersectionObserver.live[0].trigger(false));

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("sends one request when the end of the list is reported many times", async () => {
    const { fetchPage } = await renderWithFirstPage();
    const [observer] = FakeIntersectionObserver.live;

    act(() => {
      observer.trigger(true);
      observer.trigger(true);
      observer.trigger(true);
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("checks again after every page, so a page that does not fill the screen is followed by the next", async () => {
    const { pages } = await renderWithFirstPage();
    const [firstObserver] = FakeIntersectionObserver.live;

    scrollNearTheEnd();
    await answer(pages[1], makePage(11, 20));
    const [secondObserver] = FakeIntersectionObserver.live;

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

    expect(FakeIntersectionObserver.live).toHaveLength(0);
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
    expect(FakeIntersectionObserver.live).toHaveLength(0);
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
    expect(FakeIntersectionObserver.live).toHaveLength(0);
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
    expect(fireEvent.keyDown(posts[9], { key: "PageDown" })).toBe(true);
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
});

describe("Feed: the like button", () => {
  function getLikeButton(postIndex = 0): HTMLElement {
    return within(getPosts()[postIndex]).getByRole("button", { name: "Like" });
  }

  it("is a toggle button that is not pressed for a post the user has not liked", async () => {
    await renderWithFirstPage();

    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    expect(within(getPosts()[0]).getByText("Likes: 5")).toBeInTheDocument();
  });

  it("is pressed at once, before the server answers", async () => {
    const { setLike } = await renderWithFirstPage();

    fireEvent.click(getLikeButton());

    expect(getLikeButton()).toHaveAttribute("aria-pressed", "true");
    expect(within(getPosts()[0]).getByText("Likes: 6")).toBeInTheDocument();
    expect(setLike).toHaveBeenCalledWith("p1", true, expect.any(AbortSignal));
  });

  it("goes back when the like could not be saved", async () => {
    const { likes } = await renderWithFirstPage();
    fireEvent.click(getLikeButton());

    await fail(likes[0]);

    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    expect(within(getPosts()[0]).getByText("Likes: 5")).toBeInTheDocument();
  });

  it("ends not pressed after a quick double tap, whatever order the answers come in", async () => {
    const { likes, setLike } = await renderWithFirstPage();

    fireEvent.click(getLikeButton());
    fireEvent.click(getLikeButton());
    expect(setLike).toHaveBeenLastCalledWith("p1", false, expect.any(AbortSignal));

    // The answer to the second tap arrives first. The first one is late.
    await answer(likes[1], { likeCount: 5, likedByMe: false });
    await answer(likes[0], { likeCount: 6, likedByMe: true });

    expect(getLikeButton()).toHaveAttribute("aria-pressed", "false");
    expect(within(getPosts()[0]).getByText("Likes: 5")).toBeInTheDocument();
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
