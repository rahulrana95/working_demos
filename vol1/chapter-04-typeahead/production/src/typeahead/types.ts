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
      durationMs: number;
      fromCache: boolean;
    }
  | { type: "search_failed"; queryLength: number; reason: TypeaheadErrorReason }
  // `position` is 1 for the first row.
  | { type: "item_selected"; position: number; queryLength: number };
