/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * Write it after the commands. Three things to say aloud: the device pixel
 * ratio, the view, and the small Surface type that lets a test draw without
 * a canvas.
 *
 * Why it holds at scale: it draws only the shapes near the part of the board
 * that is in view, not the whole scene.
 */
import { CANVAS_SIZE, previewScene, visibleIds } from "./board";
import type { BoardState } from "./board";
import type { Scene } from "./scene";

/** The few canvas calls we use. A test passes an object that records them. */
export type Surface = Pick<CanvasRenderingContext2D, "strokeStyle" | "lineWidth" | "strokeRect">;

const SHAPE_COLOUR = "#1c1f23";
const SELECTION_COLOUR = "#1a56db";
const SELECTION_GAP = 4;

/** Draws the shapes with the given ids in order, then a blue box around the selected one. */
export function drawScene(target: Surface, scene: Scene, ids: string[], selectedId: string | null) {
  target.strokeStyle = SHAPE_COLOUR;
  for (const id of ids) {
    const shape = scene.shapesById[id];
    target.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }

  const selected = selectedId === null ? undefined : scene.shapesById[selectedId];
  if (selected !== undefined) {
    const { x, y, width, height } = selected;
    target.strokeStyle = SELECTION_COLOUR;
    target.strokeRect(x - SELECTION_GAP, y - SELECTION_GAP, width + 8, height + 8);
  }
}

/**
 * Clears the canvas and draws the board. On a screen with two device pixels
 * for one CSS pixel, the canvas holds twice as many pixels in each direction
 * and every drawing call is scaled by two. Without this, lines look blurred.
 */
export function paint(canvas: HTMLCanvasElement, state: BoardState): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(CANVAS_SIZE.width * ratio);
  const height = Math.round(CANVAS_SIZE.height * ratio);
  // Setting the size also clears the canvas, so do it only when it changed.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (context !== null) {
    const { x, y, scale } = state.view;
    const zoom = ratio * scale;
    // From here on, every drawing call is in board positions.
    context.setTransform(zoom, 0, 0, zoom, -x * zoom, -y * zoom);
    context.clearRect(x, y, CANVAS_SIZE.width / scale, CANVAS_SIZE.height / scale);
    // Lines stay 2 pixels wide on the screen at every zoom level.
    context.lineWidth = 2 / scale;
    drawScene(context, previewScene(state), visibleIds(state), state.selectedId);
  }
}
