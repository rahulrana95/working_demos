/*
 * NOT PART OF THE INTERVIEW: production version.
 * Lets several typeaheads on one page share the answers they already have.
 * A "From" box and a "To" box search the same places, so one cache is enough.
 */
import { LruCache } from "./lruCache";

// One cache for each `cacheKey`. It lives as long as the page.
const sharedCaches = new Map<string, LruCache<unknown>>();

/**
 * Returns the cache for this key, and creates it on the first call.
 * The size and the expiry time of the first caller are kept.
 */
export function getSharedCache<V>(cacheKey: string, maxSize: number, ttlMs: number): LruCache<V> {
  let cache = sharedCaches.get(cacheKey);

  if (cache === undefined) {
    cache = new LruCache<unknown>(maxSize, ttlMs);
    sharedCaches.set(cacheKey, cache);
  }

  // The Map cannot know the type of each cache. The caller must use one
  // `cacheKey` for one kind of item and one search function only.
  return cache as LruCache<V>;
}

/**
 * Empties every shared cache. Call it on logout, so the next user never sees
 * the answers of the last one. We empty the caches and do not delete them,
 * because typeaheads on the page still hold them.
 */
export function clearSharedCaches(): void {
  sharedCaches.forEach((cache) => cache.clear());
}
