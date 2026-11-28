/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every change to the state of the feed, tested with plain objects.
 */
import {
  EMPTY_FEED,
  addPage,
  dropFarPages,
  findDroppedPage,
  holdNewPosts,
  mergeFirstPage,
  mergeRestoredPage,
  restoreFeed,
  showWaitingPosts,
  startFromCache,
} from "./feedState";
import type { FeedState } from "./feedState";
import { makePage, makePost } from "./testHelpers";

/** A feed of `pageCount` pages of 10 posts. Page 2 was fetched with the cursor "p10", and so on. */
function feedOfPages(pageCount: number): FeedState {
  let state = EMPTY_FEED;
  for (let page = 0; page < pageCount; page++) {
    const from = page * 10 + 1;
    state = addPage(state, makePage(from, from + 9), page === 0 ? null : `p${from - 1}`);
  }
  return state;
}

function heldCount(state: FeedState): number {
  return Object.keys(state.postsById).length;
}

describe("addPage", () => {
  it("adds the posts in the order the server sent them", () => {
    const state = addPage(EMPTY_FEED, makePage(1, 3), null);

    expect(state.order).toEqual(["p1", "p2", "p3"]);
    expect(state.postsById.p2.text).toBe("Text of post 2");
    expect(state.status).toBe("success");
  });

  it("skips a post that the feed already holds, and keeps our copy of it", () => {
    const first = addPage(
      EMPTY_FEED,
      { posts: [makePost(1, { likedByMe: true })], nextCursor: "p1" },
      null,
    );

    const second = addPage(first, makePage(1, 3), "p1");

    expect(second.order).toEqual(["p1", "p2", "p3"]);
    expect(second.postsById.p1.likedByMe).toBe(true);
  });

  it("remembers which cursor fetched which posts", () => {
    const state = feedOfPages(2);

    expect(state.pages).toEqual([
      { cursor: null, ids: makePage(1, 10).posts.map((post) => post.id), hasData: true },
      { cursor: "p10", ids: makePage(11, 20).posts.map((post) => post.id), hasData: true },
    ]);
  });

  it("does not list a page that added no post", () => {
    const first = addPage(EMPTY_FEED, makePage(1, 3), null);

    expect(addPage(first, makePage(1, 3), "p3").pages).toHaveLength(1);
  });

  it("does not give a dropped post a second place when a page sends it again", () => {
    const dropped = dropFarPages(feedOfPages(5), "p41", 30);
    expect(dropped.postsById.p11).toBeUndefined();

    const next = addPage(
      dropped,
      { posts: [makePost(11), makePost(51)], nextCursor: "p51" },
      "p50",
    );

    expect(next.order.filter((postId) => postId === "p11")).toHaveLength(1);
    expect(next.order[next.order.length - 1]).toBe("p51");
  });

  it("says there is more while the server sends a next cursor", () => {
    expect(addPage(EMPTY_FEED, makePage(1, 3), null).hasMore).toBe(true);
    expect(addPage(EMPTY_FEED, makePage(1, 3, true), null).hasMore).toBe(false);
  });

  it("counts the posts of a later page, but not of the first page", () => {
    const first = addPage(EMPTY_FEED, makePage(1, 3), null);
    const second = addPage(first, makePage(3, 6), "p3");

    expect(first.lastAdded).toBe(0);
    expect(second.lastAdded).toBe(3);
  });

  it("removes the error of the try before", () => {
    const failed = { ...feedOfPages(1), status: "error" as const, errorReason: "offline" as const };

    expect(addPage(failed, makePage(11, 20), "p10").errorReason).toBeNull();
  });
});

describe("new posts", () => {
  it("holds new posts apart from the feed, newest first", () => {
    const state = holdNewPosts(feedOfPages(1), [makePost(22), makePost(21)]);

    expect(state.waiting.map((post) => post.id)).toEqual(["p22", "p21"]);
    expect(state.order[0]).toBe("p1");
  });

  it("puts a newer post in front of the ones that already wait", () => {
    const first = holdNewPosts(feedOfPages(1), [makePost(21)]);

    const second = holdNewPosts(first, [makePost(22)]);

    expect(second.waiting.map((post) => post.id)).toEqual(["p22", "p21"]);
  });

  it("skips a post that is in the feed or waits already", () => {
    const first = holdNewPosts(feedOfPages(1), [makePost(21)]);

    const second = holdNewPosts(first, [makePost(21), makePost(5)]);

    expect(second).toBe(first);
  });

  it("puts the waiting posts at the top when the user asks", () => {
    const state = showWaitingPosts(holdNewPosts(feedOfPages(1), [makePost(22), makePost(21)]));

    expect(state.order.slice(0, 3)).toEqual(["p22", "p21", "p1"]);
    expect(state.postsById.p22.text).toBe("Text of post 22");
    expect(state.waiting).toEqual([]);
  });

  it("keeps the cursor, so the next page still follows the last post", () => {
    const state = showWaitingPosts(holdNewPosts(feedOfPages(1), [makePost(21)]));

    expect(state.nextCursor).toBe("p10");
  });

  it("changes nothing when no post waits", () => {
    const state = feedOfPages(1);

    expect(showWaitingPosts(state)).toBe(state);
  });
});

describe("the saved first page", () => {
  it("shows the saved posts at once, as loading", () => {
    const state = startFromCache(makePage(1, 10));

    expect(state.order).toHaveLength(10);
    expect(state.status).toBe("loading");
    expect(state.isFromCache).toBe(true);
  });

  it("gives the posts on screen their new numbers, in place", () => {
    const fresh = { posts: [makePost(1, { likeCount: 99 }), makePost(2)], nextCursor: "p2" };

    const state = mergeFirstPage(startFromCache(makePage(1, 3)), fresh);

    expect(state.order).toEqual(["p1", "p2", "p3"]);
    expect(state.postsById.p1.likeCount).toBe(99);
    expect(state.status).toBe("success");
    expect(state.isFromCache).toBe(false);
  });

  it("puts posts that are not on screen yet behind the pill, not on the page", () => {
    const fresh = { posts: [makePost(21), makePost(1), makePost(2)], nextCursor: "p2" };

    const state = mergeFirstPage(startFromCache(makePage(1, 3)), fresh);

    expect(state.order).toEqual(["p1", "p2", "p3"]);
    expect(state.waiting.map((post) => post.id)).toEqual(["p21"]);
  });

  it("takes the cursor of the real page, not of the saved one", () => {
    const state = mergeFirstPage(startFromCache(makePage(1, 3)), makePage(1, 5));

    expect(state.nextCursor).toBe("p5");
  });
});

describe("dropFarPages", () => {
  it("changes nothing while the feed holds no more than the limit", () => {
    const state = feedOfPages(3);

    expect(dropFarPages(state, "p25", 30)).toBe(state);
  });

  it("drops the data of the page farthest from the reader", () => {
    // The reader is on page 5 (posts 41 to 50). The limit is 40 posts.
    const state = dropFarPages(feedOfPages(5), "p45", 40);

    expect(heldCount(state)).toBe(40);
    // Page 1 is the farthest, but the first page always stays. Page 2 goes.
    expect(state.postsById.p11).toBeUndefined();
    expect(state.postsById.p20).toBeUndefined();
    expect(state.postsById.p1).toBeDefined();
    expect(state.pages.map((page) => page.hasData)).toEqual([true, false, true, true, true]);
  });

  it("drops pages below the reader when the reader has scrolled back up", () => {
    const state = dropFarPages(feedOfPages(6), "p15", 40);

    expect(state.pages.map((page) => page.hasData)).toEqual([true, true, true, true, false, false]);
  });

  it("keeps every id and the order, so no post changes its place", () => {
    const before = feedOfPages(10);

    const after = dropFarPages(before, "p95", 30);

    expect(after.order).toEqual(before.order);
    expect(after.pages.map((page) => page.ids)).toEqual(before.pages.map((page) => page.ids));
  });

  it("never holds more than the limit, however many pages are loaded", () => {
    let state = EMPTY_FEED;
    for (let page = 0; page < 200; page++) {
      const from = page * 10 + 1;
      state = addPage(state, makePage(from, from + 9), page === 0 ? null : `p${from - 1}`);
      state = dropFarPages(state, `p${from}`, 500);

      expect(heldCount(state)).toBeLessThanOrEqual(500);
    }
    expect(state.order).toHaveLength(2000);
  });

  it("never drops the page the reader is on", () => {
    const state = dropFarPages(feedOfPages(5), "p25", 10);

    expect(state.postsById.p25).toBeDefined();
  });

  it("never drops the first page or new posts from the pill, because no cursor gives them back", () => {
    const withNew = showWaitingPosts(holdNewPosts(feedOfPages(5), [makePost(99)]));

    const state = dropFarPages(withNew, "p45", 10);

    expect(state.postsById.p99).toBeDefined();
    expect(state.postsById.p1).toBeDefined();
    expect(state.postsById.p11).toBeUndefined();
  });

  it("treats the top of the feed as the place when nothing is on screen yet", () => {
    const state = dropFarPages(feedOfPages(5), null, 30);

    expect(state.pages.map((page) => page.hasData)).toEqual([true, true, true, false, false]);
  });
});

describe("a dropped page that is fetched again", () => {
  const dropped = dropFarPages(feedOfPages(5), "p45", 40);

  it("finds the dropped page of a post, with the cursor to fetch it", () => {
    expect(findDroppedPage(dropped, "p15")?.cursor).toBe("p10");
    expect(findDroppedPage(dropped, "p45")).toBeUndefined();
    expect(findDroppedPage(dropped, "unknown")).toBeUndefined();
  });

  it("gives the posts their data back at the same place", () => {
    const state = mergeRestoredPage(dropped, "p10", makePage(11, 20));

    expect(state.postsById.p15.text).toBe("Text of post 15");
    expect(state.order).toEqual(dropped.order);
    expect(state.pages[1].hasData).toBe(true);
  });

  it("removes a post that the server no longer sends, so no empty place stays", () => {
    const withoutPost15 = makePage(11, 20);
    withoutPost15.posts = withoutPost15.posts.filter((post) => post.id !== "p15");

    const state = mergeRestoredPage(dropped, "p10", withoutPost15);

    expect(state.order).not.toContain("p15");
    expect(state.order).toHaveLength(49);
    expect(state.pages[1].ids).not.toContain("p15");
  });

  it("ignores a post that the page did not hold before", () => {
    const withExtra = { posts: [...makePage(11, 20).posts, makePost(77)], nextCursor: "p20" };

    const state = mergeRestoredPage(dropped, "p10", withExtra);

    expect(state.order).not.toContain("p77");
    expect(state.postsById.p77).toBeUndefined();
  });

  it("does not move the cursor of the feed", () => {
    const state = mergeRestoredPage(dropped, "p10", makePage(11, 20));

    expect(state.nextCursor).toBe("p50");
  });

  it("changes nothing for a cursor that fetched no dropped page", () => {
    expect(mergeRestoredPage(dropped, "p30", makePage(31, 40))).toBe(dropped);
  });

  it("removes the failure mark of an earlier try", () => {
    const failed = { ...dropped, restoreFailed: true };

    expect(mergeRestoredPage(failed, "p10", makePage(11, 20)).restoreFailed).toBe(false);
  });
});

describe("restoreFeed", () => {
  it("starts empty when nothing was saved, or when the saved feed never got a post", () => {
    expect(restoreFeed(null)).toBe(EMPTY_FEED);
    expect(restoreFeed({ ...EMPTY_FEED, status: "loading" })).toBe(EMPTY_FEED);
  });

  it("does not come back as loading more, because that request is gone", () => {
    expect(restoreFeed({ ...feedOfPages(2), status: "loadingMore" }).status).toBe("success");
  });

  it("comes back with its error, so the user can still press Try again", () => {
    const saved = { ...feedOfPages(2), status: "error" as const, errorReason: "timeout" as const };

    expect(restoreFeed(saved)).toMatchObject({ status: "error", errorReason: "timeout" });
  });

  it("loads the real first page when only the saved one was shown", () => {
    expect(restoreFeed(startFromCache(makePage(1, 10))).status).toBe("loading");
  });

  it("does not announce old posts as newly loaded", () => {
    expect(restoreFeed(feedOfPages(2)).lastAdded).toBe(0);
  });

  it("keeps the new posts that waited behind the pill", () => {
    const saved = holdNewPosts(feedOfPages(1), [makePost(21)]);

    expect(restoreFeed(saved).waiting).toHaveLength(1);
  });
});
