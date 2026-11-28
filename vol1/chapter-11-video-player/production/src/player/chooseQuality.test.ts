/* NOT PART OF THE INTERVIEW. */
import { chooseQuality } from "./chooseQuality";
import type { QualityLevel } from "./chooseQuality";

const LEVELS: QualityLevel[] = [
  { height: 240, kbps: 400 },
  { height: 360, kbps: 800 },
  { height: 480, kbps: 1400 },
  { height: 720, kbps: 2800 },
  { height: 1080, kbps: 5000 },
];
const P240 = 0;
const P360 = 1;
const P480 = 2;
const P720 = 3;
const P1080 = 4;

const FULL_BUFFER = 20;
const LOW_BUFFER = 3;

describe("chooseQuality: going up", () => {
  it("goes up one level when the speed is clearly enough and the buffer is safe", () => {
    // 720p needs 2800 kbps. 70% of 4000 is exactly 2800.
    expect(chooseQuality(LEVELS, 4000, FULL_BUFFER, P480)).toBe(P720);
  });

  it("goes up only one level at a time, even on a very fast network", () => {
    expect(chooseQuality(LEVELS, 100_000, FULL_BUFFER, P240)).toBe(P360);
  });

  it("does not go up when the next level would need more than 70% of the speed", () => {
    expect(chooseQuality(LEVELS, 3999, FULL_BUFFER, P480)).toBe(P480);
  });

  it("does not go up while the buffer is not safe, however fast the network is", () => {
    expect(chooseQuality(LEVELS, 100_000, 9.9, P480)).toBe(P480);
    expect(chooseQuality(LEVELS, 100_000, 10, P480)).toBe(P720);
  });

  it("stays at the highest level when there is nothing above it", () => {
    expect(chooseQuality(LEVELS, 100_000, FULL_BUFFER, P1080)).toBe(P1080);
  });
});

describe("chooseQuality: going down", () => {
  it("goes down when the level needs more than 90% of the speed and the buffer is low", () => {
    // 720p needs 2800 kbps. 90% of 3000 is 2700.
    expect(chooseQuality(LEVELS, 3000, LOW_BUFFER, P720)).toBe(P480);
  });

  it("goes straight down to the best level the network can carry, not one step", () => {
    expect(chooseQuality(LEVELS, 1000, LOW_BUFFER, P1080)).toBe(P360);
  });

  it("goes down to the lowest level when even that is too much, and never below it", () => {
    expect(chooseQuality(LEVELS, 100, LOW_BUFFER, P1080)).toBe(P240);
    expect(chooseQuality(LEVELS, 0, 0, P240)).toBe(P240);
  });

  it("does not go down for a slow moment while the buffer is safe", () => {
    expect(chooseQuality(LEVELS, 500, FULL_BUFFER, P720)).toBe(P720);
  });

  it("goes down once the buffer is no longer safe", () => {
    expect(chooseQuality(LEVELS, 500, 9, P720)).toBe(P240);
  });

  it("stays when the level still fits in 90% of the speed, with a low buffer", () => {
    // 90% of 3200 is 2880, and 720p needs 2800.
    expect(chooseQuality(LEVELS, 3200, LOW_BUFFER, P720)).toBe(P720);
  });
});

describe("chooseQuality: no switching up and down", () => {
  /** Runs the decision once for each measured speed and returns the levels it chose. */
  function runWith(speeds: number[], bufferSeconds: number, startIndex: number): number[] {
    const chosen: number[] = [];
    let index = startIndex;
    for (const speed of speeds) {
      index = chooseQuality(LEVELS, speed, bufferSeconds, index);
      chosen.push(index);
    }
    return chosen;
  }

  it("keeps one level when the speed moves 10% around the limit of the next level", () => {
    // 720p needs 2800 kbps. A rule without a gap would switch at 2800 on every change.
    const speeds = Array.from({ length: 40 }, (_, step) => (step % 2 === 0 ? 3080 : 2520));

    expect(new Set(runWith(speeds, FULL_BUFFER, P480))).toEqual(new Set([P480]));
    expect(new Set(runWith(speeds, LOW_BUFFER, P480))).toEqual(new Set([P480]));
  });

  it("does not come back down right after it went up, at the same speed", () => {
    // At 4000 kbps it goes from 480p to 720p. 720p then stays, also with a low buffer.
    expect(chooseQuality(LEVELS, 4000, FULL_BUFFER, P480)).toBe(P720);
    expect(chooseQuality(LEVELS, 4000, LOW_BUFFER, P720)).toBe(P720);
  });

  it("switches at most once when the speed moves inside the gap between going up and staying", () => {
    // Between 70% and 90%: 720p fits for staying, but not for going up to it.
    const speeds = Array.from({ length: 40 }, (_, step) => 3150 + (step % 5) * 150);

    expect(new Set(runWith(speeds, LOW_BUFFER, P720))).toEqual(new Set([P720]));
    expect(new Set(runWith(speeds, FULL_BUFFER, P480))).toEqual(new Set([P480]));
  });

  it("climbs from the lowest level to the highest in four steps on a fast network", () => {
    expect(runWith([9000, 9000, 9000, 9000, 9000], FULL_BUFFER, P240)).toEqual([
      P360,
      P480,
      P720,
      P1080,
      P1080,
    ]);
  });

  it("always returns a level that exists, for any speed, buffer and start", () => {
    for (let start = 0; start < LEVELS.length; start++) {
      for (const speed of [0, 1, 399, 400, 2800, 5000, 1e9, Infinity]) {
        for (const buffer of [0, 5, 10, 60]) {
          const index = chooseQuality(LEVELS, speed, buffer, start);

          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(LEVELS.length);
        }
      }
    }
  });

  it("works with one level only", () => {
    expect(chooseQuality([{ height: 480, kbps: 1400 }], 100, 0, 0)).toBe(0);
  });
});
