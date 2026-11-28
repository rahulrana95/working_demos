/*
 * NOT PART OF THE INTERVIEW: production version.
 * Two ways to make a freehand line smaller. A pen can report 240 positions a
 * second, so a long line would hold thousands of points that nobody can see.
 */
import { distanceToSegment } from "./scene";
import type { Point } from "./scene";

/**
 * Used while the line is drawn. Returns true when `next` is at least
 * `minDistance` away from the last point that was kept.
 */
export function isFarEnough(last: Point, next: Point, minDistance: number): boolean {
  return Math.hypot(next.x - last.x, next.y - last.y) >= minDistance;
}

/**
 * Used once, when the line is finished (the Ramer-Douglas-Peucker method).
 * It keeps the two ends. Between them it keeps the point that is furthest from
 * the straight line, if that point is further than `tolerance`, and then does
 * the same for the two halves. No dropped point is further than `tolerance`
 * from the result.
 *
 * It uses a list of ranges still to do, not a function that calls itself, so
 * a line of 100,000 points cannot overflow the call stack.
 */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) {
    return points;
  }
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const ranges: [number, number][] = [[0, points.length - 1]];

  while (ranges.length > 0) {
    // The loop runs only while the list has a range, so pop() returns one.
    const [first, last] = ranges.pop() as [number, number];
    let furthest = -1;
    let furthestDistance = tolerance;
    for (let index = first + 1; index < last; index++) {
      const distance = distanceToSegment(points[index], points[first], points[last]);
      if (distance > furthestDistance) {
        furthest = index;
        furthestDistance = distance;
      }
    }
    if (furthest !== -1) {
      keep[furthest] = true;
      ranges.push([first, furthest], [furthest, last]);
    }
  }
  return points.filter((_point, index) => keep[index]);
}
