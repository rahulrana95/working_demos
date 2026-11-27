/*
 * NOT PART OF THE INTERVIEW: production version.
 * The error a search function throws when the server says "too many requests".
 */

/**
 * The longest time the typeahead waits before it tries again. When the server
 * asks for more, the user gets the error at once and can use "Try again".
 */
export const MAX_RETRY_WAIT_MS = 2000;

/**
 * Throw this from `search` when the server answers with status 429.
 * Read the waiting time from the `Retry-After` header of the response.
 * The typeahead waits that long and then tries one more time. It does not
 * wait longer than `MAX_RETRY_WAIT_MS`: then it shows the error at once.
 */
export class RetryLaterError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`The server asked us to try again in ${retryAfterMs} ms`);
    this.name = "RetryLaterError";
  }
}
