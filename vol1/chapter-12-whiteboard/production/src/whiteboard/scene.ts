/*
 * NOT PART OF THE INTERVIEW: production version.
 * The interview versions have rectangles only. This one adds freehand lines
 * and a colour for every shape.
 */

export interface Point {
  x: number;
  y: number;
}

/** Every shape has a box. Moving a shape changes only `x` and `y`. */
interface BaseShape {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
}

export interface RectShape extends BaseShape {
  kind: "rect";
}

/** A freehand line. The points are counted from the corner of the box. */
export interface PathShape extends BaseShape {
  kind: "path";
  points: Point[];
}

export type Shape = RectShape | PathShape;
export type ShapeKind = Shape["kind"];

/** `order` is the drawing order: the last id is on top. */
export interface Scene {
  shapesById: Record<string, Shape>;
  order: string[];
}

export const EMPTY_SCENE: Scene = { shapesById: {}, order: [] };

/** A rectangle between two corners, dragged in any direction. */
export function makeRect(id: string, a: Point, b: Point, stroke: string): RectShape {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    id,
    kind: "rect",
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
    stroke,
  };
}

/** A freehand line through the given board positions. There must be at least one. */
export function makePath(id: string, boardPoints: Point[], stroke: string): PathShape {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  // A loop, not Math.min(...xs): a call with 100,000 arguments can fail.
  for (const point of boardPoints) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  const points = boardPoints.map((point) => ({ x: point.x - left, y: point.y - top }));
  return {
    id,
    kind: "path",
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    stroke,
    points,
  };
}

/** The shortest distance from a point to the line piece between `a` and `b`. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  // `along` is how far along the piece the nearest position is, from 0 to 1.
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + along * dx), point.y - (a.y + along * dy));
}

/**
 * True when the point is on the shape, or within `slop` of it. A rectangle is
 * hit anywhere inside its box. A freehand line is hit only near the line itself.
 */
export function isShapeHit(shape: Shape, point: Point, slop: number): boolean {
  const local = { x: point.x - shape.x, y: point.y - shape.y };
  const isInBox =
    Math.min(local.x, local.y, shape.width - local.x, shape.height - local.y) >= -slop;
  if (!isInBox || shape.kind === "rect") {
    return isInBox;
  }
  return shape.points.some(
    (end, index) => distanceToSegment(local, shape.points[Math.max(0, index - 1)], end) <= slop,
  );
}
