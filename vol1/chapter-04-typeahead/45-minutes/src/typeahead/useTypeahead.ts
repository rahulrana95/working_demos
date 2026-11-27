/*
 * PART OF THE INTERVIEW: yes (about 15 minutes).
 * This hook is the heart of the answer. Write it before the component.
 *
 * Why it holds at scale:
 *   1. Debounce: fast typing sends one request, not one per key press.
 *   2. Abort: a request that is no longer needed is cancelled, and its
 *      response can never replace a newer one.
 *   3. Cache: a query seen before costs zero network calls.
 *   4. maxItems: we keep and draw only the top few items, even if the
 *      server sends thousands.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LruCache } from "./lruCache";
import type { SearchFn, TypeaheadResult } from "./types";

export interface UseTypeaheadOptions<T> {
  /** The text to search for. Pass an empty string to stop searching. */
  query: string;
  search: SearchFn<T>;
  /** How long to wait after the last key press before calling the server. */
  debounceMs?: number;
  /** Do not search until the user has typed this many characters. */
  minChars?: number;
  /** Keep only this many items from one response. */
  maxItems?: number;
  /** How many past queries to remember. */
  cacheSize?: number;
}

export interface UseTypeaheadReturn<T> extends TypeaheadResult<T> {
  /** Runs the last query again. Used by the "Try again" button. */
  retry: () => void;
  /** True while the rows on screen belong to an older query. They must not be picked. */
  isStale: boolean;
}

export function useTypeahead<T>({
  query,
  search,
  debounceMs = 250,
  minChars = 2,
  maxItems = 10,
  cacheSize = 50,
}: UseTypeaheadOptions<T>): UseTypeaheadReturn<T> {
  const [result, setResult] = useState<TypeaheadResult<T>>({
    status: "idle",
    items: [],
  });
  const [attempt, setAttempt] = useState(0);

  // The parent may pass a new function on every render. We keep the latest
  // one in a ref, so a new function does not restart the search below.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // useState with a function creates the cache once, on the first render.
  const [cache] = useState(() => new LruCache<T[]>(cacheSize));

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < minChars) {
      setResult({ status: "idle", items: [] });
      return;
    }

    const cacheKey = trimmedQuery.toLowerCase();
    const cachedItems = cache.get(cacheKey);

    if (cachedItems !== undefined) {
      setResult({ status: "success", items: cachedItems });
      return;
    }

    // Keep the old items on screen while the new ones load.
    // This stops the list from flickering on every key press.
    setResult((previous) => ({ status: "loading", items: previous.items }));

    const controller = new AbortController();

    const timerId = setTimeout(async () => {
      try {
        const response = await searchRef.current(trimmedQuery, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        const items = response.slice(0, maxItems);
        cache.set(cacheKey, items);
        setResult({ status: "success", items });
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        // A failed request is not cached, so the next attempt asks the server again.
        setResult({ status: "error", items: [] });
      }
    }, debounceMs);

    // This runs when the query changes or the component is removed.
    // It cancels the waiting timer and the request already in flight,
    // so an old response can never overwrite a newer one.
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [query, attempt, minChars, maxItems, debounceMs, cache]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // While loading, any items we still hold came from an earlier query.
  const isStale = result.status === "loading" && result.items.length > 0;

  return { ...result, retry, isStale };
}
