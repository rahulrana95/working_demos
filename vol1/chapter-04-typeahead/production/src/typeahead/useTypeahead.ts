/*
 * NOT PART OF THE INTERVIEW: production version.
 * The hook from the 60-minute answer, plus what a team adds in the first week:
 *   1. The text is cleaned once. The clean text is the cache key and the
 *      text sent to the server, so a CDN sees one URL for one query.
 *   2. `minChars` counts what the user sees, not UTF-16 code units.
 *   3. A request that takes too long is aborted and becomes an error.
 *   4. The error has a reason: failed, timeout or offline.
 *   5. When the server says "try later", we wait and try once more.
 *   6. Typeaheads with the same `cacheKey` share one cache.
 *   7. Events tell analytics what happened, without the typed text.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LruCache } from "./lruCache";
import { RetryLaterError } from "./retryLaterError";
import { getSharedCache } from "./sharedCache";
import { countGraphemes, normaliseQuery } from "./text";
import type { SearchFn, TypeaheadErrorReason, TypeaheadEvent, TypeaheadResult } from "./types";

export interface UseTypeaheadOptions<T> {
  /** The text to search for. Pass an empty string to stop searching. */
  query: string;
  search: SearchFn<T>;
  /** How long to wait after the last key press before calling the server. */
  debounceMs?: number;
  /** Do not search until the user has typed this many visible characters. */
  minChars?: number;
  /** Keep only this many items from one response. */
  maxItems?: number;
  /** How many past queries to remember. */
  cacheSize?: number;
  /** How long a remembered answer stays valid. */
  cacheTtlMs?: number;
  /** A longer query is cut to this many characters before searching. */
  maxQueryLength?: number;
  /** The language used to make the text lower case. The default is the browser language. */
  locale?: string;
  /** A request that takes longer than this is aborted. */
  timeoutMs?: number;
  /**
   * Typeaheads with the same key share one cache. Use one key for one search
   * function only. Leave it out and this typeahead keeps its own cache.
   */
  cacheKey?: string;
  /** Receives one event for each search, result, failure and selection. */
  onEvent?: (event: TypeaheadEvent) => void;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

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
  cacheTtlMs = FIVE_MINUTES_MS,
  maxQueryLength = 100,
  locale,
  timeoutMs = 5000,
  cacheKey,
  onEvent,
}: UseTypeaheadOptions<T>): UseTypeaheadReturn<T> {
  const [result, setResult] = useState<TypeaheadResult<T>>({
    status: "idle",
    items: [],
    errorReason: null,
  });
  const [attempt, setAttempt] = useState(0);

  // The parent may pass new functions on every render. We keep the latest
  // ones in refs, so a new function does not restart the search below.
  const searchRef = useRef(search);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    searchRef.current = search;
    onEventRef.current = onEvent;
  }, [search, onEvent]);

  // useState with a function picks the cache once, on the first render.
  const [cache] = useState(() =>
    cacheKey === undefined
      ? new LruCache<T[]>(cacheSize, cacheTtlMs)
      : getSharedCache<T[]>(cacheKey, cacheSize, cacheTtlMs),
  );

  useEffect(() => {
    const cleanQuery = normaliseQuery(query, locale).slice(0, maxQueryLength);
    const queryLength = countGraphemes(cleanQuery);

    if (queryLength < minChars) {
      setResult({ status: "idle", items: [], errorReason: null });
      return;
    }

    function emit(event: TypeaheadEvent) {
      onEventRef.current?.(event);
    }

    function showItems(items: T[], durationMs: number, fromCache: boolean) {
      setResult({ status: "success", items, errorReason: null });
      emit({ type: "results_shown", queryLength, count: items.length, durationMs, fromCache });
    }

    function fail(reason: TypeaheadErrorReason) {
      setResult({ status: "error", items: [], errorReason: reason });
      emit({ type: "search_failed", queryLength, reason });
    }

    const cachedItems = cache.get(cleanQuery);

    if (cachedItems !== undefined) {
      showItems(cachedItems, 0, true);
      return;
    }

    // Without a network the request can only fail, so we do not send it.
    // When the network is back, the search runs again by itself.
    if (navigator.onLine === false) {
      fail("offline");
      const searchAgain = () => setAttempt((count) => count + 1);
      window.addEventListener("online", searchAgain);
      return () => window.removeEventListener("online", searchAgain);
    }

    // Keep the old items on screen while the new ones load.
    // This stops the list from flickering on every key press.
    setResult((previous) => ({ status: "loading", items: previous.items, errorReason: null }));

    const controller = new AbortController();
    let startedAt = 0;
    let timeoutTimerId: ReturnType<typeof setTimeout> | undefined;

    async function requestItems(canRetryLater: boolean) {
      timeoutTimerId = setTimeout(() => {
        // Abort first, so an answer that arrives after this is ignored.
        controller.abort();
        fail("timeout");
      }, timeoutMs);

      try {
        const response = await searchRef.current(cleanQuery, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        const items = response.slice(0, maxItems);
        cache.set(cleanQuery, items);
        showItems(items, Date.now() - startedAt, false);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        // The server is busy and told us when to come back. We stay in
        // "loading", wait, and try one more time. Only one, so a server
        // in trouble does not get a second wave of requests from us.
        if (canRetryLater && error instanceof RetryLaterError) {
          waitTimerId = setTimeout(() => requestItems(false), error.retryAfterMs);
          return;
        }

        // A failed request is not cached, so the next attempt asks the server again.
        fail("failed");
      } finally {
        clearTimeout(timeoutTimerId);
      }
    }

    // First this timer waits for the debounce. Later it may wait for the retry.
    let waitTimerId = setTimeout(() => {
      startedAt = Date.now();
      emit({ type: "search_started", queryLength });
      requestItems(true);
    }, debounceMs);

    // This runs when the query changes or the component is removed.
    // It cancels every waiting timer and the request already in flight,
    // so an old response can never overwrite a newer one.
    return () => {
      clearTimeout(waitTimerId);
      clearTimeout(timeoutTimerId);
      controller.abort();
    };
  }, [query, attempt, minChars, maxItems, maxQueryLength, locale, timeoutMs, debounceMs, cache]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // While loading, any items we still hold came from an earlier query.
  const isStale = result.status === "loading" && result.items.length > 0;

  return { ...result, retry, isStale };
}
