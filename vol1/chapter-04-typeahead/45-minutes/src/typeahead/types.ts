/*
 * PART OF THE INTERVIEW: yes (about 1 minute).
 * Write these types first. They are the contract of the component.
 */

/**
 * The function that fetches suggestions.
 *
 * It receives an AbortSignal. When the user types again, the signal is
 * aborted, so the function can cancel the network call.
 */
export type SearchFn<T> = (query: string, signal: AbortSignal) => Promise<T[]>;

export type TypeaheadStatus = "idle" | "loading" | "success" | "error";

export interface TypeaheadResult<T> {
  status: TypeaheadStatus;
  items: T[];
}
