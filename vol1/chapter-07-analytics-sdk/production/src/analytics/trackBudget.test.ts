/*
 * NOT PART OF THE INTERVIEW.
 * This test holds `track` to a time budget. It uses the real clock.
 * `scripts/measure-track.mjs` in the chapter folder measures the same thing
 * in Node and in a real browser, and prints the numbers.
 */
import { createAnalytics } from "./createAnalytics";
import type { SendResult } from "./types";

/** Well under one millisecond, with room for a slow test machine. */
const MEDIAN_BUDGET_MS = 0.05;
const TOTAL_BUDGET_MS = 500;
const CALLS = 10_000;

describe("the cost of track", () => {
  it(`takes less than ${MEDIAN_BUDGET_MS} ms for the median of 10,000 calls`, () => {
    localStorage.clear();
    const analytics = createAnalytics({
      endpoint: "/collect",
      writeKey: "budget",
      trackPages: false,
      transport: () => new Promise<SendResult>(() => {}),
      beforeSend: (event) => {
        // A slow hook. It must not make `track` slow, because it runs later.
        const end = performance.now() + 0.2;
        while (performance.now() < end) {
          // Busy wait.
        }
        return event;
      },
    });
    const properties = { plan: "pro", step: 3, source: "pricing page", items: [1, 2, 3] };
    const times: number[] = [];

    const startedAt = performance.now();
    for (let index = 0; index < CALLS; index += 1) {
      const before = performance.now();
      analytics.track("checkout_started", properties);
      times.push(performance.now() - before);
    }
    const totalMs = performance.now() - startedAt;
    analytics.shutdown();

    times.sort((a, b) => a - b);
    expect(times[CALLS / 2]).toBeLessThan(MEDIAN_BUDGET_MS);
    // With the hook run inside `track`, 10,000 calls would take 2 seconds.
    expect(totalMs).toBeLessThan(TOTAL_BUDGET_MS);
  });
});
