/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the retry waits grow, stay random and stay bounded.
 */
import { backoffDelayMs, RETRY_MAX_MS } from "./backoff";

describe("backoffDelayMs", () => {
  it("doubles the longest wait after each failure", () => {
    const longest = [1, 2, 3, 4, 5].map((attempt) => backoffDelayMs(attempt, () => 1));

    expect(longest).toEqual([1000, 2000, 4000, 8000, 16_000]);
  });

  it("never waits less than half of the longest wait", () => {
    const shortest = [1, 2, 3].map((attempt) => backoffDelayMs(attempt, () => 0));

    expect(shortest).toEqual([500, 1000, 2000]);
  });

  it("gives different pages different waits", () => {
    expect(backoffDelayMs(3, () => 0.25)).toBe(2500);
    expect(backoffDelayMs(3, () => 0.75)).toBe(3500);
  });

  it("never waits more than 30 seconds, even after 1,000 failures", () => {
    expect(backoffDelayMs(6, () => 1)).toBe(RETRY_MAX_MS);
    expect(backoffDelayMs(1000, () => 1)).toBe(RETRY_MAX_MS);
  });

  it("stays between half and all of the longest wait with the real random numbers", () => {
    for (let run = 0; run < 1000; run += 1) {
      const wait = backoffDelayMs(2);

      expect(wait).toBeGreaterThanOrEqual(1000);
      expect(wait).toBeLessThanOrEqual(2000);
    }
  });
});
