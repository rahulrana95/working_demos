/*
 * PART OF THE INTERVIEW: yes (about 3 minutes).
 * Write these types first. The scene is plain data, so it can be saved as
 * JSON, compared in a test and sent to a server.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * This answer has one kind of shape. The other kinds get a `kind` of their
 * own and join a union: `type Shape = RectShape | PathShape`.
 */
export interface Shape {
  id: string;
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `order` is the drawing order: the last id is on top. */
export interface Scene {
  shapesById: Record<string, Shape>;
  order: string[];
}

/** A rectangle between two corners, dragged in any direction. */
export function makeRect(id: string, a: Point, b: Point): Shape {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { id, kind: "rect", x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
