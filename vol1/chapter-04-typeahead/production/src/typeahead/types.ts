/*
 * NOT PART OF THE INTERVIEW: production version.
 * The interview version has only the first three types.
 * The production version adds the reason of an error and the events.
 */

/**
 * The function that fetches suggestions.
 *
 * It receives an AbortSignal. When the user types again, the signal is
 * aborted, so the function can cancel the network call.
 *
 * The typeahead never sees the HTTP status code. It only sees whether the
 * promise resolves or rejects. So your `search` function must keep three rules:
 *   a. For HTTP 429 ("too many requests"), reject with
 *      `new RetryLaterError(retryAfterMs)`. The typeahead waits and tries once
 *      more. If the wait is longer than 2 seconds, it shows the error at once.
 *   b. For every other failure (500, 404, a broken connection, bad JSON),
 *      reject with any other error. The user sees an error and "Try again".
 *   c. Resolve with an empty array only when the server really found nothing.
 *      The user then reads "No results", and that answer is kept in the cache.
 * A function that returns `[]` for a failed request breaks rule c: the user
 * is told that nothing exists, and the cache remembers it.
 */
export type SearchFn<T> = (query: string, signal: AbortSignal) => Promise<T[]>;

export type TypeaheadStatus = "idle" | "loading" | "success" | "error";

/** Why the search failed. Each reason has its own message for the user. */
export type TypeaheadErrorReason = "failed" | "timeout" | "offline";

export interface TypeaheadResult<T> {
  status: TypeaheadStatus;
  items: T[];
  /** Set only when the status is "error". */
  errorReason: TypeaheadErrorReason | null;
}

/**
 * What the typeahead reports to analytics and monitoring.
 *
 * An event holds numbers only, never the typed text. People type names,
 * addresses and other private things in a search box.
 */
export type TypeaheadEvent =
  | { type: "search_started"; queryLength: number }
  | {
      type: "results_shown";
      queryLength: number;
      count: number;
      /**
       * From the user's last key press (or the retry that started this
       * search) to the rows being painted. It holds the debounce wait and the drawing time,
       * so it is small but not zero for an answer from the cache.
       */
      durationMs: number;
      fromCache: boolean;
    }
  | { type: "search_failed"; queryLength: number; reason: TypeaheadErrorReason }
  // `position` is 1 for the first row.
  | { type: "item_selected"; position: number; queryLength: number };
