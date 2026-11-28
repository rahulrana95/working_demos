/*
 * NOT PART OF THE INTERVIEW: production version.
 * The same as in the 60-minute answer. The board is larger than the canvas,
 * so every pointer position goes through `toBoard` before it is used.
 */
import type { Point } from "./scene";

/** `x` and `y` are the board position at the top-left corner of the canvas. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

/** From a position on the canvas to a position on the board. */
export function toBoard(view: View, point: Point): Point {
  return { x: view.x + point.x / view.scale, y: view.y + point.y / view.scale };
}

/** Zooms in or out. The board position under `point` stays under it. */
export function zoomAt(view: View, point: Point, factor: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const anchor = toBoard(view, point);
  return { x: anchor.x - point.x / scale, y: anchor.y - point.y / scale, scale };
}
