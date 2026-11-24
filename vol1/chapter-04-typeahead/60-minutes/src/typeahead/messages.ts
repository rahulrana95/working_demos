/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Every text the user can read or hear is here, in one object.
 * Another team can replace any of them to translate the component.
 */

export interface TypeaheadMessages {
  searching: string;
  /** A function, because the place of the query in the sentence changes with the language. */
  noResults: (query: string) => string;
  error: string;
  retry: string;
  /** A function, because plural rules change with the language. */
  resultsAvailable: (count: number) => string;
}

export const DEFAULT_MESSAGES: TypeaheadMessages = {
  searching: "Searching…",
  noResults: (query) => `No results for “${query}”`,
  error: "Something went wrong.",
  retry: "Try again",
  resultsAvailable: (count) => `${count} results available`,
};
