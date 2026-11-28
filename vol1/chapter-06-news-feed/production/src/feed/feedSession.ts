/*
 * NOT PART OF THE INTERVIEW: production version.
 * What the feed must remember while it is not on the page: the user opens a
 * post, the feed is removed, the user comes back, and the feed must be the
 * same. The page creates one session and keeps it, for example next to its
 * router. It lives in memory only.
 */
import type { FeedState } from "./feedState";

export interface FeedSession {
  /** The posts and the cursor, so coming back sends no request. */
  state: FeedState | null;
  /** The measured height of every post that was drawn, by post id. */
  heights: Map<string, number>;
  /** The first post on screen, and how far the screen top is below its top. */
  anchor: { postId: string; offset: number } | null;
  /** The post that held the keyboard focus, or `null`. */
  focusedPostId: string | null;
}

export function createFeedSession(): FeedSession {
  return { state: null, heights: new Map(), anchor: null, focusedPostId: null };
}
