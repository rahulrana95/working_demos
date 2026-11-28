/* NOT PART OF THE INTERVIEW: production version. It only makes imports shorter. */
export { CollabEditor } from "./CollabEditor";
export type { CollabEditorProps } from "./CollabEditor";
export { CrdtEngine } from "./crdt/crdtEngine";
export { Rga, goesFirst, idsOf } from "./crdt/rga";
export type * from "./crdt/types";
export { DEFAULT_MAX_LENGTH } from "./engine";
export type * from "./engine";
export { hashText } from "./hash";
export { DEFAULT_MESSAGES } from "./messages";
export type { CollabMessages } from "./messages";
export { OtEngine } from "./ot/otEngine";
export { applyOp, applyOps, transform, transformIndex, transformLists } from "./ot/transform";
export type { OtOp } from "./ot/transform";
export type { OtClientMessage, OtEntry, OtServerMessage } from "./ot/types";
export { presenceParts } from "./presence";
export type { PresencePart } from "./presence";
export { diffText } from "./textChange";
export type { TextChange } from "./textChange";
