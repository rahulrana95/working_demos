/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * Added in the 60-minute answer, when the interviewer asks, "What happens
 * with 10,000 shapes?"
 *
 * Why it holds at scale: the board is cut into square cells, and each cell
 * knows the shapes that touch it. To draw, or to find the shape under the
 * pointer, we read only the cells in question, not all 10,000 shapes.
 */
import type { Point, Scene, Shape } from "./scene";

export type Box = Pick<Shape, "x" | "y" | "width" | "height">;

/** The side of one cell. A few screens of shapes fit in a handful of cells. */
const CELL_SIZE = 256;
/** A click this close to a shape still hits it, so a very thin shape can be picked. */
const HIT_SLOP = 4;

/** For each cell: the places in `scene.order` of the shapes that touch it. */
type Grid = Map<string, number[]>;

function forEachCell(box: Box, visit: (cellKey: string) => void): void {
  const lastColumn = Math.floor((box.x + box.width) / CELL_SIZE);
  const lastRow = Math.floor((box.y + box.height) / CELL_SIZE);
  for (let column = Math.floor(box.x / CELL_SIZE); column <= lastColumn; column++) {
    for (let row = Math.floor(box.y / CELL_SIZE); row <= lastRow; row++) {
      visit(`${column},${row}`);
    }
  }
}

/** A scene never changes, so its grid is built once and kept as long as the scene. */
const grids = new WeakMap<Scene, Grid>();

function gridOf(scene: Scene): Grid {
  const grid = grids.get(scene) ?? new Map<string, number[]>();
  if (!grids.has(scene)) {
    const put = (key: string, place: number) => grid.set(key, [...(grid.get(key) ?? []), place]);
    scene.order.forEach((id, place) => forEachCell(scene.shapesById[id], (key) => put(key, place)));
    grids.set(scene, grid);
  }
  return grid;
}

/** The ids of the shapes in the cells that the box touches, in drawing order. */
export function shapesNear(scene: Scene, box: Box): string[] {
  const grid = gridOf(scene);
  const places = new Set<number>();
  forEachCell(box, (key) => grid.get(key)?.forEach((place) => places.add(place)));
  return [...places].sort((a, b) => a - b).map((place) => scene.order[place]);
}

/** The id of the top-most shape under the point, or null. */
export function hitTest(scene: Scene, { x, y }: Point): string | null {
  const isHit = (shape: Shape) =>
    Math.min(x - shape.x, y - shape.y, shape.x + shape.width - x, shape.y + shape.height - y) >=
    -HIT_SLOP;
  const reach = { x: x - HIT_SLOP, y: y - HIT_SLOP, width: 2 * HIT_SLOP, height: 2 * HIT_SLOP };
  // The last shape in the drawing order is on top, so look from the end.
  return (
    shapesNear(scene, reach)
      .reverse()
      .find((id) => isHit(scene.shapesById[id])) ?? null
  );
}
