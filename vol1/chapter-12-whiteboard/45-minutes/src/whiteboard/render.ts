/*
 * PART OF THE INTERVIEW: yes (about 5 minutes).
 * Write it after the commands. Two things to say aloud: the device pixel
 * ratio, and the small Surface type that lets a test draw without a canvas.
 */
import type { Scene } from "./scene";

/** The few canvas calls we use. A test passes an object that records them. */
export type Surface = Pick<CanvasRenderingContext2D, "strokeStyle" | "lineWidth" | "strokeRect">;

const SHAPE_COLOUR = "#1c1f23";
const SELECTION_COLOUR = "#1a56db";
const SELECTION_GAP = 4;

/** Draws every shape in order, then a blue box around the selected one. */
export function drawScene(surface: Surface, scene: Scene, selectedId: string | null): void {
  surface.strokeStyle = SHAPE_COLOUR;
  surface.lineWidth = 2;
  for (const id of scene.order) {
    const shape = scene.shapesById[id];
    surface.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }

  const selected = selectedId === null ? undefined : scene.shapesById[selectedId];
  if (selected !== undefined) {
    const { x, y, width, height } = selected;
    surface.strokeStyle = SELECTION_COLOUR;
    surface.strokeRect(x - SELECTION_GAP, y - SELECTION_GAP, width + 8, height + 8);
  }
}

/**
 * Clears the canvas and draws the scene. On a screen with two device pixels
 * for one CSS pixel, the canvas holds twice as many pixels in each direction
 * and every drawing call is scaled by two. Without this, lines look blurred.
 */
export function paint(canvas: HTMLCanvasElement, scene: Scene, selectedId: string | null): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  // Setting the size also clears the canvas, so do it only when it changed.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (context !== null) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawScene(context, scene, selectedId);
  }
}
