/* NOT PART OF THE INTERVIEW: production version. */

export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 30_000;
/** We never wait longer than this, whatever the server asks. */
export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * How long to wait before try number `failedAttempts + 1`.
 *
 * Why it holds at scale: the wait doubles after each failure, so a collector
 * in trouble gets fewer requests, not more. Half of the wait is random, so
 * the pages that failed together do not all come back in the same instant.
 */
export function backoffDelayMs(failedAttempts: number, random: () => number = Math.random): number {
  const ceiling = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failedAttempts - 1));
  return ceiling / 2 + (random() * ceiling) / 2;
}

/**
 * Reads a `Retry-After` header: a number of seconds, or a date.
 * Returns milliseconds, or undefined when the header is missing or wrong.
 */
export function parseRetryAfter(
  header: string | null,
  now: number = Date.now(),
): number | undefined {
  if (header === null || header.trim() === "") {
    return undefined;
  }

  const seconds = Number(header);
  const waitMs = Number.isNaN(seconds) ? Date.parse(header) - now : seconds * 1000;
  return Number.isNaN(waitMs) ? undefined : Math.max(0, waitMs);
}
