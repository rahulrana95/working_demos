/*
 * NOT PART OF THE INTERVIEW.
 * Makes a large scene for the demo and for the measurements: rows of
 * rectangles that cover an area much larger than the canvas.
 */
import type { Scene, Shape } from "./whiteboard";

const SPACING = 60;

export function createDemoScene(count: number): Scene {
  const shapesById: Record<string, Shape> = {};
  const order: string[] = [];
  const columns = Math.ceil(Math.sqrt(count));

  for (let index = 0; index < count; index++) {
    const id = `seed-${index + 1}`;
    // The sizes repeat in a fixed pattern, so every run draws the same scene.
    const width = 20 + ((index * 7) % 30);
    const height = 20 + ((index * 13) % 30);
    const x = 20 + (index % columns) * SPACING;
    const y = 20 + Math.floor(index / columns) * SPACING;
    shapesById[id] = { id, kind: "rect", x, y, width, height, stroke: "#1c1f23" };
    order.push(id);
  }
  return { shapesById, order };
}
