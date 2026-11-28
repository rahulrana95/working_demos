/* NOT PART OF THE INTERVIEW: production version. */
import { MAX_WAIT_MS, getBackoffDelayMs } from "./backoff";

describe("getBackoffDelayMs", () => {
  it("doubles the wait with every failed try", () => {
    expect(getBackoffDelayMs(0, 1)).toBe(1000);
    expect(getBackoffDelayMs(1, 1)).toBe(2000);
    expect(getBackoffDelayMs(2, 1)).toBe(4000);
    expect(getBackoffDelayMs(3, 1)).toBe(8000);
  });

  it("never waits longer than 30 seconds, even after 1,000 failed tries", () => {
    expect(getBackoffDelayMs(5, 1)).toBe(MAX_WAIT_MS);
    expect(getBackoffDelayMs(1000, 1)).toBe(MAX_WAIT_MS);
  });

  it("takes away a random part, up to half of the wait", () => {
    expect(getBackoffDelayMs(2, 0)).toBe(2000);
    expect(getBackoffDelayMs(2, 0.5)).toBe(3000);
  });

  it("stays between half the wait and the full wait for any random number", () => {
    for (let step = 0; step <= 100; step++) {
      const delay = getBackoffDelayMs(3, step / 100);

      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(8000);
    }
  });
});
