/* NOT PART OF THE INTERVIEW. It only makes imports shorter. */
export { Whiteboard } from "./Whiteboard";
export type { WhiteboardProps } from "./Whiteboard";
export { boardReducer, createBoard, keyToAction, previewScene } from "./board";
export type { BoardAction, BoardState, Tool } from "./board";
export { apply, invert } from "./commands";
export type { Command } from "./commands";
export { DEFAULT_HISTORY_LIMIT, execute, redo, undo } from "./history";
export type { Doc, HistoryEntry } from "./history";
export { drawScene, paint } from "./render";
export type { Surface } from "./render";
export { hitTest, makeRect } from "./scene";
export type { Point, Scene, Shape } from "./scene";
