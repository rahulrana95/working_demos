/*
 * NOT PART OF THE INTERVIEW: production version.
 * The state of the feed and every change to it, as pure functions with no
 * React. The interview answers keep the two or three functions they need
 * inside `useFeed.ts`.
 *
 * Why it holds at scale:
 *   1. Normalised state: every post is stored once, by id.
 *   2. Memory limit: the data of at most `maxPosts` posts is kept. The pages
 *      farthest from the reader are dropped, and fetched again by their
 *      cursor when the reader scrolls back. The ids and the measured heights
 *      stay, so the scrollbar and the place of every post do not change.
 *   3. New posts wait in `waiting`. They never move what the reader looks at.
 */
import type { FeedErrorReason, FeedPage, FeedStatus, Post } from "./types";

/** One page as the server sent it. We keep it to fetch the page again. */
export interface PageRef {
  /**
   * The cursor that fetched the page. `null` is the first page. `undefined`
   * is for posts that came through the "new posts" pill: no cursor gives
   * them back, so they are never dropped.
   */
  cursor: string | null | undefined;
  ids: string[];
  /** False when the data of these posts was dropped to save memory. */
  hasData: boolean;
}

export interface FeedState {
  /** The data of the posts. A post that was dropped is not in here. */
  postsById: Record<string, Post>;
  /** The ids of all posts, in the order the server ranked them. */
  order: string[];
  status: FeedStatus;
  /** Set only when the status is "error". */
  errorReason: FeedErrorReason | null;
  hasMore: boolean;
  /** Where the next page starts. */
  nextCursor: string | null;
  /** How many posts the last "load more" added. The screen reader message uses it. */
  lastAdded: number;
  pages: PageRef[];
  /** New posts that wait until the user asks for them, newest first. */
  waiting: Post[];
  /** True while the posts on screen come from the saved first page only. */
  isFromCache: boolean;
  /** True when a dropped page could not be fetched again. */
  restoreFailed: boolean;
}

export const EMPTY_FEED: FeedState = {
  postsById: {},
  order: [],
  status: "idle",
  errorReason: null,
  hasMore: true,
  nextCursor: null,
  lastAdded: 0,
  pages: [],
  waiting: [],
  isFromCache: false,
  restoreFailed: false,
};

function byId(posts: Post[]): Record<string, Post> {
  return Object.fromEntries(posts.map((post) => [post.id, post]));
}

/**
 * Adds one page to the end of the feed. `cursor` is the cursor that fetched
 * it. A post that the feed already lists is skipped, also when its data was
 * dropped: it keeps its place.
 */
export function addPage(state: FeedState, page: FeedPage, cursor: string | null): FeedState {
  const listed = new Set(state.order);
  const fresh = page.posts.filter((post) => !listed.has(post.id));
  const freshIds = fresh.map((post) => post.id);

  return {
    ...state,
    postsById: { ...state.postsById, ...byId(fresh) },
    order: [...state.order, ...freshIds],
    pages:
      freshIds.length === 0
        ? state.pages
        : [...state.pages, { cursor, ids: freshIds, hasData: true }],
    status: "success",
    errorReason: null,
    hasMore: page.nextCursor !== null,
    nextCursor: page.nextCursor,
    lastAdded: state.order.length === 0 ? 0 : freshIds.length,
  };
}

/** The feed to show at once from the saved first page, while the real one loads. */
export function startFromCache(cachedPage: FeedPage): FeedState {
  return { ...addPage(EMPTY_FEED, cachedPage, null), status: "loading", isFromCache: true };
}

/**
 * The real first page arrived while the saved one is on screen. Posts that
 * are on screen get the new numbers, in place. Posts that are not on screen
 * yet go behind the "new posts" pill: the reader may be in the middle of a
 * post, and nothing may move under their eyes.
 */
export function mergeFirstPage(state: FeedState, page: FeedPage): FeedState {
  const listed = new Set(state.order);
  const refreshed = page.posts.filter((post) => listed.has(post.id));
  const unknown = page.posts.filter((post) => !listed.has(post.id));

  return holdNewPosts(
    {
      ...state,
      postsById: { ...state.postsById, ...byId(refreshed) },
      status: "success",
      errorReason: null,
      hasMore: page.nextCursor !== null,
      nextCursor: page.nextCursor,
      isFromCache: false,
    },
    unknown,
  );
}

/** Keeps new posts, newest first, until the user asks for them. Known posts are skipped. */
export function holdNewPosts(state: FeedState, newPosts: Post[]): FeedState {
  const known = new Set([...state.order, ...state.waiting.map((post) => post.id)]);
  const fresh = newPosts.filter((post) => !known.has(post.id));
  return fresh.length === 0 ? state : { ...state, waiting: [...fresh, ...state.waiting] };
}

/** Puts the waiting posts at the top of the feed. */
export function showWaitingPosts(state: FeedState): FeedState {
  if (state.waiting.length === 0) {
    return state;
  }

  const ids = state.waiting.map((post) => post.id);
  return {
    ...state,
    postsById: { ...state.postsById, ...byId(state.waiting) },
    order: [...ids, ...state.order],
    pages: [{ cursor: undefined, ids, hasData: true }, ...state.pages],
    waiting: [],
  };
}

/**
 * Drops the data of whole pages until at most `maxPosts` posts are held.
 * The page farthest from the reader goes first. The reader's own page, the
 * first page and the "new posts" pages always stay.
 */
export function dropFarPages(
  state: FeedState,
  /** The first post on screen, or `null` when the feed has no place yet. */
  anchorPostId: string | null,
  maxPosts: number,
): FeedState {
  let heldCount = Object.keys(state.postsById).length;
  if (heldCount <= maxPosts) {
    return state;
  }

  const anchorPage = Math.max(
    0,
    state.pages.findIndex((page) => anchorPostId !== null && page.ids.includes(anchorPostId)),
  );
  const farthestFirst = state.pages
    .map((page, index) => ({ page, index, distance: Math.abs(index - anchorPage) }))
    // Only a page with a cursor of its own can be fetched again.
    .filter(({ page, distance }) => page.hasData && typeof page.cursor === "string" && distance > 0)
    .sort((a, b) => b.distance - a.distance);

  const postsById = { ...state.postsById };
  const pages = [...state.pages];

  for (const { page, index } of farthestFirst) {
    if (heldCount <= maxPosts) {
      break;
    }
    for (const postId of page.ids) {
      delete postsById[postId];
    }
    heldCount -= page.ids.length;
    pages[index] = { ...page, hasData: false };
  }

  return { ...state, postsById, pages };
}

/** The dropped page that holds this post, or `undefined`. */
export function findDroppedPage(state: FeedState, postId: string): PageRef | undefined {
  return state.pages.find((page) => !page.hasData && page.ids.includes(postId));
}

/**
 * A dropped page was fetched again. Its posts get their data back. A post
 * that the server no longer sends for this cursor was deleted, or moved by
 * the server: it leaves the feed, so no empty place stays for ever. A post
 * that the page did not hold before is ignored.
 */
export function mergeRestoredPage(state: FeedState, cursor: string, fetched: FeedPage): FeedState {
  const pageIndex = state.pages.findIndex((page) => page.cursor === cursor && !page.hasData);
  if (pageIndex === -1) {
    return state;
  }

  const page = state.pages[pageIndex];
  const returned = byId(fetched.posts);
  const keptIds = page.ids.filter((postId) => returned[postId] !== undefined);
  const goneIds = new Set(page.ids.filter((postId) => returned[postId] === undefined));

  const pages = [...state.pages];
  pages[pageIndex] = { ...page, ids: keptIds, hasData: true };

  return {
    ...state,
    postsById: { ...state.postsById, ...byId(keptIds.map((postId) => returned[postId])) },
    order: goneIds.size === 0 ? state.order : state.order.filter((postId) => !goneIds.has(postId)),
    pages,
    restoreFailed: false,
  };
}

/**
 * The state to start with when the feed comes back. A request that was in
 * flight when the feed was removed is gone, so "loading more" must not come
 * back. A feed that still shows the saved first page loads the real one.
 */
export function restoreFeed(saved: FeedState | null): FeedState {
  if (saved === null || saved.order.length === 0) {
    return EMPTY_FEED;
  }

  const status = saved.isFromCache ? "loading" : saved.status === "error" ? "error" : "success";
  return { ...saved, status, lastAdded: 0, restoreFailed: false };
}
