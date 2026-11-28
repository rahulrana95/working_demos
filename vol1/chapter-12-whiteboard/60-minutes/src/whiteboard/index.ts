/* NOT PART OF THE INTERVIEW. It only makes imports shorter. */
export { Whiteboard } from "./Whiteboard";
export type { WhiteboardProps } from "./Whiteboard";
export {
  CANVAS_SIZE,
  boardReducer,
  createBoard,
  keyToAction,
  previewScene,
  visibleIds,
} from "./board";
export type { BoardAction, BoardState, Tool } from "./board";
export { apply, invert } from "./commands";
export type { Command } from "./commands";
export { hitTest, shapesNear } from "./grid";
export type { Box } from "./grid";
export { DEFAULT_HISTORY_LIMIT, execute, redo, undo } from "./history";
export type { Doc, HistoryEntry } from "./history";
export { DEFAULT_MESSAGES } from "./messages";
export type { WhiteboardMessages } from "./messages";
export { drawScene, paint } from "./render";
export type { Surface } from "./render";
export { makeRect } from "./scene";
export type { Point, Scene, Shape } from "./scene";
export { toBoard, zoomAt } from "./view";
export type { View } from "./view";
