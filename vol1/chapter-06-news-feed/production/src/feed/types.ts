/*
 * NOT PART OF THE INTERVIEW: production version.
 * The contract between the feed and the page. The production version adds
 * video and responsive images, the live stream, the reason of an error, the
 * error for a like that the server refuses, and the events.
 */

export interface PostMedia {
  /** "image" when it is left out. */
  kind?: "image" | "video";
  url: string;
  /** The server sends the size, so we can keep the space before the media loads. */
  width: number;
  height: number;
  alt: string;
  /**
   * The same image in other widths. With them the browser picks the
   * smallest file that is sharp enough for the screen.
   */
  sources?: { url: string; width: number }[];
  /** For a video: the picture to show before it plays. */
  posterUrl?: string;
}

export interface Post {
  id: string;
  author: { id: string; name: string; avatarUrl: string };
  text: string;
  media?: PostMedia;
  /** An ISO 8601 date, for example "2026-11-28T09:30:00Z". */
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

export interface FeedPage {
  posts: Post[];
  /** Where the next page starts. `null` means this was the last page. */
  nextCursor: string | null;
}

/**
 * Fetches one page. The cursor is `null` for the first page.
 *
 * We page by cursor ("the posts after this one"), never by offset ("posts 20
 * to 30"). New posts arrive at the top all the time. With an offset they
 * would push every post down, and the next page would repeat posts.
 *
 * The feed never sees the HTTP status code. It only sees whether the promise
 * resolves or rejects. Resolve with the page. Reject with any error when the
 * request failed. The same cursor must give the same posts again later: the
 * feed drops far pages from memory and asks for them again by their cursor.
 */
export type FetchPageFn = (cursor: string | null, signal: AbortSignal) => Promise<FeedPage>;

/** The part of a post that a like changes. */
export type LikeState = Pick<Post, "likeCount" | "likedByMe">;

/**
 * Saves a like or an unlike. Resolve with the numbers the server now holds.
 *
 * The feed cannot see status codes, so the function must keep two rules:
 *   a. When the server refuses the like for good (the post was deleted, the
 *      user is blocked: HTTP 4xx), reject with `new LikeRejectedError()`.
 *      The feed rolls back and tells the user.
 *   b. For every other failure (no network, a timeout, HTTP 5xx), reject with
 *      any other error. The feed keeps the like on screen and sends it again
 *      when a request succeeds again.
 *
 * Send `idempotencyKey` to the server, for example in an `Idempotency-Key`
 * header. The feed sends the same choice again with the same key. A server
 * that has seen the key before answers again and saves nothing twice.
 */
export type SetLikeFn = (
  postId: string,
  liked: boolean,
  signal: AbortSignal,
  idempotencyKey: string,
) => Promise<LikeState>;

/** Throw this from `setLike` when sending the same like again can never work. */
export class LikeRejectedError extends Error {
  constructor(message = "The server refused the like") {
    super(message);
    this.name = "LikeRejectedError";
  }
}

/**
 * Fetches the posts that are newer than `sinceId`, newest first. `sinceId`
 * is `null` when the feed holds no post. Resolve with an empty array when
 * there is nothing new.
 */
export type FetchNewerFn = (sinceId: string | null, signal: AbortSignal) => Promise<Post[]>;

/** What the live connection tells the feed. */
export type FeedStreamEvent =
  /** The connection is up. The feed then asks `fetchNewer` for what it missed. */
  | { type: "open" }
  | { type: "post"; post: Post }
  /** The connection dropped. The feed waits, then subscribes again. */
  | { type: "closed" };

/**
 * Opens the live connection (a WebSocket or server-sent events) and reports
 * through `onEvent`. Returns the function that closes it. The feed calls
 * `subscribe` again after a "closed" event, so the function must not
 * reconnect by itself.
 */
export type SubscribeFn = (onEvent: (event: FeedStreamEvent) => void) => () => void;

export type FeedStatus = "idle" | "loading" | "loadingMore" | "success" | "error";

/** Why a page could not be loaded. Each reason has its own message for the user. */
export type FeedErrorReason = "failed" | "timeout" | "offline";

/**
 * What the feed reports to analytics and monitoring.
 *
 * An event holds ids, counts and times only. It never holds the text of a
 * post or the name of an author.
 */
export type FeedEvent =
  /** The first posts are on the page. `durationMs` runs from the moment the feed appeared. */
  | { type: "feed_loaded"; durationMs: number; postCount: number; fromCache: boolean }
  | { type: "page_loaded"; durationMs: number; postCount: number; postsInMemory: number }
  | { type: "load_failed"; reason: FeedErrorReason; isFirstPage: boolean }
  /** These posts were at least half on screen for one second. Each post is reported once. */
  | { type: "post_impression"; postIds: string[] }
  | { type: "like_toggled"; postId: string; liked: boolean }
  | { type: "like_failed"; postId: string }
  | { type: "post_render_failed"; postId: string };
