/*
 * NOT PART OF THE INTERVIEW: production version.
 * The drawing code. On top of the 60-minute answer it draws freehand lines,
 * colours, and the pointers and selections of the other users.
 *
 * Why it holds at scale: it draws only the shapes near the part of the board
 * that is in view, not the whole scene.
 */
import { previewScene, visibleIds } from "./board";
import type { BoardState } from "./board";
import type { Presence } from "./presence";
import type { Scene, Shape } from "./scene";

/** The few canvas calls we use. A test passes an object that records them. */
export type Surface = Pick<
  CanvasRenderingContext2D,
  | "strokeStyle"
  | "fillStyle"
  | "lineWidth"
  | "lineJoin"
  | "lineCap"
  | "font"
  | "strokeRect"
  | "beginPath"
  | "lineTo"
  | "arc"
  | "stroke"
  | "fill"
  | "fillText"
  | "setLineDash"
>;

const OWN_SELECTION_COLOUR = "#1a56db";
const SELECTION_GAP = 4;
const CURSOR_RADIUS = 5;
const NAME_SIZE = 12;

function drawShape(surface: Surface, shape: Shape): void {
  surface.strokeStyle = shape.stroke;
  if (shape.kind === "rect") {
    surface.strokeRect(shape.x, shape.y, shape.width, shape.height);
    return;
  }
  surface.beginPath();
  // The first lineTo of a new path only sets the start point.
  for (const point of shape.points) {
    surface.lineTo(shape.x + point.x, shape.y + point.y);
  }
  // A line of one point has no length. A second point at the same place makes it a dot.
  surface.lineTo(shape.x + shape.points[0].x, shape.y + shape.points[0].y);
  surface.stroke();
}

function drawSelection(surface: Surface, shape: Shape | undefined, colour: string, scale: number) {
  if (shape !== undefined) {
    const gap = SELECTION_GAP / scale;
    surface.strokeStyle = colour;
    surface.strokeRect(shape.x - gap, shape.y - gap, shape.width + 2 * gap, shape.height + 2 * gap);
  }
}

/**
 * Draws the shapes with the given ids in order, then the selection boxes,
 * then the pointers of the other users. `scale` is the zoom level: line
 * widths, gaps and name tags keep their size on the screen at every level.
 */
export function drawScene(
  surface: Surface,
  scene: Scene,
  ids: string[],
  selectedId: string | null,
  peers: Presence[],
  scale: number,
): void {
  surface.lineWidth = 2 / scale;
  surface.lineJoin = "round";
  surface.lineCap = "round";
  surface.setLineDash([]);
  for (const id of ids) {
    drawShape(surface, scene.shapesById[id]);
  }

  // The selection of another user is dashed and has their colour. Ours is solid.
  surface.setLineDash([6 / scale, 4 / scale]);
  for (const peer of peers) {
    drawSelection(surface, scene.shapesById[peer.selectedId ?? ""], peer.colour, scale);
  }
  surface.setLineDash([]);
  drawSelection(surface, scene.shapesById[selectedId ?? ""], OWN_SELECTION_COLOUR, scale);

  surface.font = `${NAME_SIZE / scale}px system-ui, sans-serif`;
  for (const { cursor, colour, name } of peers) {
    if (cursor !== null) {
      surface.fillStyle = colour;
      surface.beginPath();
      surface.arc(cursor.x, cursor.y, CURSOR_RADIUS / scale, 0, 2 * Math.PI);
      surface.fill();
      // The name stands next to the dot, so a user is not known by colour alone.
      surface.fillText(name, cursor.x + 8 / scale, cursor.y + 4 / scale);
    }
  }
}

/**
 * Clears the canvas and draws the board. On a screen with two device pixels
 * for one CSS pixel, the canvas holds twice as many pixels in each direction
 * and every drawing call is scaled by two. Without this, lines look blurred.
 * Returns how many shapes it drew.
 */
export function paint(canvas: HTMLCanvasElement, state: BoardState): number {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(state.size.width * ratio);
  const height = Math.round(state.size.height * ratio);
  // Setting the size also clears the canvas, so do it only when it changed.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (context === null) {
    return 0;
  }
  const { x, y, scale } = state.view;
  const zoom = ratio * scale;
  // From here on, every drawing call is in board positions.
  context.setTransform(zoom, 0, 0, zoom, -x * zoom, -y * zoom);
  context.clearRect(x, y, state.size.width / scale, state.size.height / scale);
  const ids = visibleIds(state);
  drawScene(context, previewScene(state), ids, state.selectedId, Object.values(state.peers), scale);
  return ids.length;
}
