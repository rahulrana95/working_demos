/*
 * NOT PART OF THE INTERVIEW: production version.
 * How long to wait before the next try to reconnect.
 */

const FIRST_WAIT_MS = 1000;
export const MAX_WAIT_MS = 30_000;

/**
 * The wait doubles with every failed try (1 s, 2 s, 4 s, …) and stops
 * growing at 30 seconds. Then a random part of it is taken away (jitter):
 * when a server comes back, a million feeds must not all reconnect in the
 * same instant. `random` is a number from 0 to 1, as `Math.random()` gives.
 */
export function getBackoffDelayMs(failedTries: number, random: number): number {
  const fullWait = Math.min(MAX_WAIT_MS, FIRST_WAIT_MS * 2 ** failedTries);
  return fullWait / 2 + (fullWait / 2) * random;
}
