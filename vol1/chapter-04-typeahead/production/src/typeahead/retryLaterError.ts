/*
 * NOT PART OF THE INTERVIEW: production version.
 * The error a search function throws when the server says "too many requests".
 */

/**
 * Throw this from `search` when the server answers with status 429.
 * Read the waiting time from the `Retry-After` header of the response.
 * The typeahead waits that long and then tries one more time.
 */
export class RetryLaterError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`The server asked us to try again in ${retryAfterMs} ms`);
    this.name = "RetryLaterError";
  }
}
