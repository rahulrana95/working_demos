/*
 * NOT PART OF THE INTERVIEW: production version.
 * Keeps the first page in `sessionStorage`, so a reload, or a visit with no
 * network, shows posts at once. `sessionStorage` belongs to one tab and is
 * emptied when the tab closes.
 */
import type { FeedPage } from "./types";

/** We keep a few posts only: enough to fill the first screens. */
const MAX_CACHED_POSTS = 20;

function isPage(value: unknown): value is FeedPage {
  const page = value as FeedPage | null;
  return (
    typeof page === "object" &&
    page !== null &&
    Array.isArray(page.posts) &&
    page.posts.every((post) => typeof post?.id === "string" && typeof post.author === "object")
  );
}

/** The saved first page, or `null`. Storage can be switched off or hold old data. */
export function readCachedPage(cacheKey: string | undefined): FeedPage | null {
  if (cacheKey === undefined) {
    return null;
  }

  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(cacheKey) ?? "null");
    return isPage(saved) && saved.posts.length > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function writeCachedPage(cacheKey: string | undefined, page: FeedPage): void {
  if (cacheKey === undefined) {
    return;
  }

  try {
    const posts = page.posts.slice(0, MAX_CACHED_POSTS);
    window.sessionStorage.setItem(cacheKey, JSON.stringify({ ...page, posts }));
  } catch {
    // The storage is full or switched off. The feed works without it.
  }
}

/** Call it on logout, so the next user of the tab never sees these posts. */
export function clearCachedPage(cacheKey: string): void {
  try {
    window.sessionStorage.removeItem(cacheKey);
  } catch {
    // Nothing to remove when the storage is switched off.
  }
}
