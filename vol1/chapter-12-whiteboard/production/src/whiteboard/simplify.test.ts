/* NOT PART OF THE INTERVIEW. Tests for the two ways to make a freehand line smaller. */
import { distanceToSegment } from "./scene";
import type { Point } from "./scene";
import { isFarEnough, simplifyPath } from "./simplify";

/** The shortest distance from a point to a line of many pieces. */
function distanceToLine(point: Point, line: Point[]): number {
  let shortest = Infinity;
  for (let index = 1; index < line.length; index++) {
    shortest = Math.min(shortest, distanceToSegment(point, line[index - 1], line[index]));
  }
  return shortest;
}

/** A wavy line, like a hand draws it. The same on every run. */
function wavyLine(count: number): Point[] {
  return Array.from({ length: count }, (_unused, index) => ({
    x: index * 0.8,
    y: Math.sin(index / 25) * 60 + Math.sin(index / 3) * 0.4,
  }));
}

describe("isFarEnough", () => {
  it("is true at the distance or further, and false nearer", () => {
    expect(isFarEnough({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(isFarEnough({ x: 0, y: 0 }, { x: 3, y: 4 }, 5.1)).toBe(false);
    expect(isFarEnough({ x: 0, y: 0 }, { x: 0, y: 0 }, 2)).toBe(false);
  });
});

describe("simplifyPath", () => {
  it("returns a line of zero, one or two points as it is", () => {
    const two = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ];

    expect(simplifyPath([], 1)).toEqual([]);
    expect(simplifyPath([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }]);
    expect(simplifyPath(two, 1)).toEqual(two);
  });

  it("makes a straight line of 1,000 points into its two ends", () => {
    const straight = Array.from({ length: 1000 }, (_unused, index) => ({ x: index, y: index * 2 }));

    expect(simplifyPath(straight, 0.5)).toEqual([straight[0], straight[999]]);
  });

  it("keeps a corner", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ];

    expect(simplifyPath(corner, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("drops a small bump and keeps a large one", () => {
    const bump = (height: number) => [
      { x: 0, y: 0 },
      { x: 5, y: height },
      { x: 10, y: 0 },
    ];

    expect(simplifyPath(bump(0.4), 0.5)).toHaveLength(2);
    expect(simplifyPath(bump(0.6), 0.5)).toHaveLength(3);
  });

  it("always keeps the first and the last point", () => {
    const line = wavyLine(500);

    const simple = simplifyPath(line, 5);

    expect(simple[0]).toBe(line[0]);
    expect(simple[simple.length - 1]).toBe(line[499]);
  });

  it("makes a hand-drawn line of 5,000 points much smaller", () => {
    const simple = simplifyPath(wavyLine(5000), 0.75);

    expect(simple.length).toBeLessThan(500);
    expect(simple.length).toBeGreaterThan(20);
  });

  it("never drops a point that is further from the result than the tolerance", () => {
    for (const tolerance of [0.25, 0.75, 2, 10]) {
      const line = wavyLine(2000);
      const simple = simplifyPath(line, tolerance);

      const furthest = Math.max(...line.map((point) => distanceToLine(point, simple)));

      expect(furthest).toBeLessThanOrEqual(tolerance + 1e-9);
    }
  });

  it("keeps the points in their order and adds no new point", () => {
    const line = wavyLine(300);

    const simple = simplifyPath(line, 1);

    const places = simple.map((point) => line.indexOf(point));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it("handles a zigzag of 12,000 points, where the work goes as deep as the line is long", () => {
    // A function that calls itself would be 12,000 calls deep here.
    const zigzag = Array.from({ length: 12_000 }, (_unused, index) => ({
      x: index,
      y: index % 2 === 0 ? 0 : 10,
    }));

    expect(simplifyPath(zigzag, 1)).toHaveLength(12_000);
  });

  it("does not change the list it is given", () => {
    const line = wavyLine(100);
    const copy = line.map((point) => ({ ...point }));

    simplifyPath(line, 3);

    expect(line).toEqual(copy);
  });
});
