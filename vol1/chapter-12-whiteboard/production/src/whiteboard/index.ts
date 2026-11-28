/* NOT PART OF THE INTERVIEW: production version. It only makes imports shorter. */
export { WhiteboardErrorBoundary } from "./ErrorBoundary";
export type { WhiteboardErrorBoundaryProps } from "./ErrorBoundary";
export { LIST_LIMIT, Whiteboard } from "./Whiteboard";
export type { WhiteboardProps } from "./Whiteboard";
export {
  DEFAULT_LIMITS,
  STROKES,
  SceneTooLargeError,
  boardReducer,
  createBoard,
  keyToAction,
  previewScene,
  visibleIds,
} from "./board";
export type { BoardAction, BoardLimits, BoardOptions, BoardState, Change, Tool } from "./board";
export { apply, invert, stepOnCurrentScene, targetId } from "./commands";
export type { Command, ShapePatch } from "./commands";
export { eventsFor } from "./events";
export type { BoardEvent } from "./events";
export { exportPng } from "./exportPng";
export { hitTest, shapesNear } from "./grid";
export { DEFAULT_HISTORY_LIMITS, MERGE_WINDOW_MS, makeEntry, record, shift } from "./history";
export type { History, HistoryEntry, HistoryLimits } from "./history";
export { DEFAULT_MESSAGES } from "./messages";
export type { WhiteboardMessages } from "./messages";
export { PRESENCE_INTERVAL_MS, createThrottle } from "./presence";
export type { Presence } from "./presence";
export { drawScene, paint } from "./render";
export type { Surface } from "./render";
export { EMPTY_SCENE, makePath, makeRect } from "./scene";
export type { PathShape, Point, RectShape, Scene, Shape, ShapeKind } from "./scene";
export { isFarEnough, simplifyPath } from "./simplify";
export { loadScene, saveScene } from "./storage";
export type { SaveResult } from "./storage";
export { addLocal, createSync, receive } from "./sync";
export type { Operation, SyncState } from "./sync";
export { useWhiteboard } from "./useWhiteboard";
export type { Transport, UseWhiteboardOptions, UseWhiteboardReturn } from "./useWhiteboard";
export { toBoard, zoomAt } from "./view";
export type { View } from "./view";
