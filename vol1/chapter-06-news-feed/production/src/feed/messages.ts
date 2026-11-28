/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text the user can read or hear is here, in one object.
 * Another team can replace any of them to translate the feed.
 * The production version adds the texts for offline, a timeout, a broken
 * post, a post that is loading again, and the video button.
 */

export interface FeedMessages {
  loading: string;
  loadMore: string;
  retry: string;
  empty: string;
  endOfFeed: string;
  loadFailed: string;
  loadMoreFailed: string;
  /** Shown in place of the two above when the browser says it is offline. */
  offline: string;
  /** Shown in place of them when a page did not answer in time. */
  timeout: string;
  like: string;
  likeFailed: string;
  /** Likes are on screen but not saved yet. */
  likesWaiting: string;
  /** The same, when the browser says it is offline. */
  likesWaitingOffline: string;
  /** In place of a post that could not be drawn. */
  postBroken: string;
  /** The name of a post whose data is being fetched again. */
  postLoading: string;
  playVideo: string;
  pauseVideo: string;
  /** Functions, because plural rules change with the language. */
  morePostsLoaded: (count: number) => string;
  newPosts: (count: number) => string;
  likeCount: (count: number) => string;
  commentCount: (count: number) => string;
  /** Turns the ISO date of a post into the text on screen. */
  formatDate: (isoDate: string) => string;
}

const englishPlurals = new Intl.PluralRules("en");

/** "1 like" or "2 likes": the browser says which form fits the count. */
function english(count: number, one: string, other: string): string {
  return `${count} ${englishPlurals.select(count) === "one" ? one : other}`;
}

export const DEFAULT_MESSAGES: FeedMessages = {
  loading: "Loading posts…",
  loadMore: "Load more",
  retry: "Try again",
  empty: "No posts yet.",
  endOfFeed: "You have seen all the posts.",
  loadFailed: "Could not load the posts.",
  loadMoreFailed: "Could not load more posts.",
  offline: "You are offline.",
  timeout: "The posts took too long to load.",
  like: "Like",
  likeFailed: "Could not save your like. Try again.",
  likesWaiting: "Your likes are not saved yet. We will send them when the connection is back.",
  likesWaitingOffline: "You are offline. We will send your likes when you are back online.",
  postBroken: "This post cannot be shown.",
  postLoading: "Loading this post…",
  playVideo: "Play video",
  pauseVideo: "Pause video",
  morePostsLoaded: (count) => `${english(count, "more post", "more posts")} loaded`,
  newPosts: (count) => english(count, "new post", "new posts"),
  likeCount: (count) => english(count, "like", "likes"),
  commentCount: (count) => english(count, "comment", "comments"),
  formatDate: (isoDate) => new Date(isoDate).toLocaleDateString("en", { dateStyle: "medium" }),
};
