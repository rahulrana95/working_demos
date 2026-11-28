/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Write it when the interviewer asks, "What do a million pages do when the
 * collector comes back after an outage?"
 */

export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 30_000;

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
