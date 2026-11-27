/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text the user can read or hear is here, in one object.
 * Another team can replace any of them to translate the component.
 * The production version adds `offline` and `timeout`.
 */

export interface TypeaheadMessages {
  searching: string;
  /** A function, because the place of the query in the sentence changes with the language. */
  noResults: (query: string) => string;
  error: string;
  /** Shown when the device has no network. */
  offline: string;
  /** Shown when the server did not answer in time. */
  timeout: string;
  retry: string;
  /** A function, because plural rules change with the language. */
  resultsAvailable: (count: number) => string;
}

export const DEFAULT_MESSAGES: TypeaheadMessages = {
  searching: "Searching…",
  noResults: (query) => `No results for “${query}”`,
  error: "Something went wrong.",
  offline: "You are offline.",
  timeout: "The search took too long.",
  retry: "Try again",
  resultsAvailable: (count) => (count === 1 ? "1 result available" : `${count} results available`),
};
