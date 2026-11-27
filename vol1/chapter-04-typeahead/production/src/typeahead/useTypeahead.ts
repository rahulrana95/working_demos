/*
 * NOT PART OF THE INTERVIEW: production version.
 * The hook from the 60-minute answer, plus what a team adds in the first week:
 *   1. The text is cleaned once. The clean text is the cache key and the
 *      text sent to the server, so a CDN sees one URL for one query.
 *   2. `minChars` counts what the user sees, not UTF-16 code units.
 *   3. A request that takes too long is aborted and becomes an error.
 *   4. The error has a reason: failed, timeout or offline. We always send
 *      the request. Offline is only the reason we give after it failed.
 *   5. When the server says "try later", we wait and try once more. If it
 *      asks for more than 2 seconds, we do not wait and show the error.
 *   6. Typeaheads with the same `cacheKey` share one cache. A new key gives
 *      a new cache, also on a typeahead that is already on the page.
 *   7. Events tell analytics what happened, without the typed text.
 *   8. `isSearchingSlow` lets the component hide "Searching…" for a fast answer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LruCache } from "./lruCache";
import { MAX_RETRY_WAIT_MS, RetryLaterError } from "./retryLaterError";
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
  /** The language used to split the text into characters. The default is the browser language. */
  locale?: string;
  /** A request that takes longer than this is aborted. */
  timeoutMs?: number;
  /** `isSearchingSlow` becomes true when a request has taken longer than this. */
  searchingDelayMs?: number;
  /**
   * Typeaheads with the same key share one cache. Use one key for one search
   * function only. Leave it out and this typeahead keeps its own cache.
   */
  cacheKey?: string;
  /** Receives one event for each search, result, failure and selection. */
  onEvent?: (event: TypeaheadEvent) => void;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** What a `results_shown` event needs. It is sent after the rows are painted. */
interface ShownResult {
  queryLength: number;
  count: number;
  fromCache: boolean;
  /** When the user last changed the text. */
  typedAt: number;
}

export interface UseTypeaheadReturn<T> extends TypeaheadResult<T> {
  /** Runs the last query again. Used by the "Try again" button. */
  retry: () => void;
  /** True while the rows on screen belong to an older query. They must not be picked. */
  isStale: boolean;
  /** True while a request has been in flight for longer than `searchingDelayMs`. */
  isSearchingSlow: boolean;
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
  searchingDelayMs = 300,
  cacheKey,
  onEvent,
}: UseTypeaheadOptions<T>): UseTypeaheadReturn<T> {
  const [result, setResult] = useState<TypeaheadResult<T>>({
    status: "idle",
    items: [],
    errorReason: null,
  });
  const [attempt, setAttempt] = useState(0);
  const [isSearchingSlow, setIsSearchingSlow] = useState(false);
  const [shownResult, setShownResult] = useState<ShownResult | null>(null);

  // The parent may pass new functions on every render. We keep the latest
  // ones in refs, so a new function does not restart the search below.
  const searchRef = useRef(search);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    searchRef.current = search;
    onEventRef.current = onEvent;
  }, [search, onEvent]);

  // useMemo, not useState: a team changes `cacheKey` to drop old answers, for
  // example when the search function changes. The cache must then change on
  // a typeahead that is already on the page. React may forget a memo value.
  // That is safe here: a shared cache is found again by its key, and a
  // private cache starts empty, which costs one more request.
  const cache = useMemo(
    () =>
      cacheKey === undefined
        ? new LruCache<T[]>(cacheSize, cacheTtlMs)
        : getSharedCache<T[]>(cacheKey, cacheSize, cacheTtlMs),
    [cacheKey, cacheSize, cacheTtlMs],
  );

  useEffect(() => {
    // React runs this effect right after the key press that changed the text.
    // So this is the time of the last key press, or of a click on "Try again".
    const typedAt = Date.now();
    const cleanQuery = normaliseQuery(query).slice(0, maxQueryLength);
    const queryLength = countGraphemes(cleanQuery, locale);

    // A new search starts: forget what the last one was still going to show or report.
    setIsSearchingSlow(false);
    setShownResult(null);

    if (queryLength < minChars) {
      setResult({ status: "idle", items: [], errorReason: null });
      return;
    }

    function emit(event: TypeaheadEvent) {
      onEventRef.current?.(event);
    }

    let slowTimerId: ReturnType<typeof setTimeout> | undefined;
    let isShowingOfflineError = false;

    function showItems(items: T[], fromCache: boolean) {
      clearTimeout(slowTimerId);
      setResult({ status: "success", items, errorReason: null });
      // A new object for every answer, so the effect that sends the
      // `results_shown` event runs for every answer.
      setShownResult({ queryLength, count: items.length, fromCache, typedAt });
    }

    function fail(reason: TypeaheadErrorReason) {
      clearTimeout(slowTimerId);
      isShowingOfflineError = reason === "offline";
      setResult({ status: "error", items: [], errorReason: reason });
      emit({ type: "search_failed", queryLength, reason });
    }

    const cachedItems = cache.get(cleanQuery);

    if (cachedItems !== undefined) {
      showItems(cachedItems, true);
      return;
    }

    // Keep the old items on screen while the new ones load.
    // This stops the list from flickering on every key press.
    setResult((previous) => ({ status: "loading", items: previous.items, errorReason: null }));

    const controller = new AbortController();
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
        showItems(items, false);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        // The server is busy and told us when to come back. We stay in
        // "loading", wait, and try one more time. Only one, so a server
        // in trouble does not get a second wave of requests from us.
        // A longer wait than the limit is not worth it: the user would look
        // at a loading state for too long, so they get the error at once.
        const canWait = error instanceof RetryLaterError && error.retryAfterMs <= MAX_RETRY_WAIT_MS;

        if (canRetryLater && canWait) {
          waitTimerId = setTimeout(() => requestItems(false), error.retryAfterMs);
          return;
        }

        // `navigator.onLine` is only a hint. A browser can say "offline" on a
        // network that works, and "online" behind a Wi-Fi login page. So we
        // never use it to stop a request. We only use it now, after the
        // request has failed, to tell the user the most likely reason.
        // A failed request is not cached, so the next attempt asks the server again.
        fail(navigator.onLine === false ? "offline" : "failed");
      } finally {
        clearTimeout(timeoutTimerId);
      }
    }

    // First this timer waits for the debounce. Later it may wait for the retry.
    let waitTimerId = setTimeout(() => {
      emit({ type: "search_started", queryLength });
      slowTimerId = setTimeout(() => setIsSearchingSlow(true), searchingDelayMs);
      requestItems(true);
    }, debounceMs);

    // The browser tells us the network is back. If the user is looking at
    // the offline error, we search again, so they do not have to.
    function searchAgainAfterOffline() {
      if (isShowingOfflineError) {
        setAttempt((count) => count + 1);
      }
    }
    window.addEventListener("online", searchAgainAfterOffline);

    // This runs when the query changes or the component is removed.
    // It cancels every waiting timer and the request already in flight,
    // so an old response can never overwrite a newer one.
    return () => {
      clearTimeout(waitTimerId);
      clearTimeout(timeoutTimerId);
      clearTimeout(slowTimerId);
      window.removeEventListener("online", searchAgainAfterOffline);
      controller.abort();
    };
  }, [
    query,
    attempt,
    minChars,
    maxItems,
    maxQueryLength,
    locale,
    timeoutMs,
    searchingDelayMs,
    debounceMs,
    cache,
  ]);

  // Sends `results_shown` when the user can really see the rows. An effect
  // runs after React has put the rows in the page, and the browser paints
  // them in the next frame. So the time in the event is what the user felt.
  useEffect(() => {
    if (shownResult === null) {
      return;
    }

    const { typedAt, ...numbers } = shownResult;
    const frameId = requestAnimationFrame(() => {
      const durationMs = Date.now() - typedAt;
      onEventRef.current?.({ type: "results_shown", ...numbers, durationMs });
    });

    // New rows replaced these ones before the browser painted them.
    return () => cancelAnimationFrame(frameId);
  }, [shownResult]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // While loading, any items we still hold came from an earlier query.
  const isStale = result.status === "loading" && result.items.length > 0;

  return { ...result, retry, isStale, isSearchingSlow };
}
