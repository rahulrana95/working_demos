/*
 * PART OF THE INTERVIEW: yes (about 3 minutes).
 * Write these types first. They are the contract between the feed and the page.
 */

export interface Post {
  id: string;
  author: { id: string; name: string; avatarUrl: string };
  text: string;
  /** The server sends the size, so we can keep the space before the image loads. */
  media?: { url: string; width: number; height: number; alt: string };
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
 * Resolve with the page. Reject with any error when the request failed.
 */
export type FetchPageFn = (cursor: string | null, signal: AbortSignal) => Promise<FeedPage>;

/** The part of a post that a like changes. */
export type LikeState = Pick<Post, "likeCount" | "likedByMe">;

/** Saves a like or an unlike. Resolve with the numbers the server now holds. */
export type SetLikeFn = (postId: string, liked: boolean, signal: AbortSignal) => Promise<LikeState>;

export type FeedStatus = "idle" | "loading" | "loadingMore" | "success" | "error";
