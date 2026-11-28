/*
 * PART OF THE INTERVIEW: yes (about 3 minutes).
 * Added in the 60-minute answer. Every text the user can read or hear is
 * here, in one object. Another team can replace any of them to translate
 * the whiteboard. No text counts things, so no plural forms are needed.
 */
import type { BoardState, Tool } from "./board";

const CHANGE_WORDS = { done: "Done", undone: "Undid", redone: "Redid" };

export const DEFAULT_MESSAGES = {
  board: "Whiteboard",
  toolbar: "Tools",
  tools: { select: "Select", rect: "Rectangle" } as Record<Tool, string>,
  undo: "Undo",
  redo: "Redo",
  /** Said after each change. The count makes two equal messages in a row differ. */
  status: ({ how, what, steps }: NonNullable<BoardState["lastChange"]>) =>
    `${CHANGE_WORDS[how]}: ${what} rectangle. Steps to undo: ${steps}.`,
};

export type WhiteboardMessages = typeof DEFAULT_MESSAGES;
