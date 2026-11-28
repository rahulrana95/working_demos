/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text the user can read or hear is here, in one object. Another team
 * can replace any of them to translate the whiteboard.
 */
import type { Change, Tool } from "./board";
import type { Command } from "./commands";
import type { Shape, ShapeKind } from "./scene";

export interface WhiteboardMessages {
  board: string;
  toolbar: string;
  tools: Record<Tool, string>;
  colours: string;
  /** The name of a colour of the toolbar, by its place in `STROKES`. */
  colourNames: string[];
  undo: string;
  redo: string;
  exportPng: string;
  /** The names of the kinds of shape, as they stand in a sentence. */
  kinds: Record<ShapeKind, string>;
  /** The names of the kinds of change, as they stand in a sentence. */
  changes: Record<Command["type"], string>;
  /** The text of one shape in the list for screen readers. `number` is its place in the list. */
  shape: (shape: Shape, kind: string, number: number) => string;
  /** A function, because plural rules change with the language. */
  moreShapes: (count: number) => string;
  /** The word for a shape whose kind is not known, because the shape is gone. */
  anyShape: string;
  /** Said after each change. `changeName` and `kindName` come from `changes` and `kinds`. */
  status: (change: Change, changeName: string, kindName: string) => string;
  /** The name tag of another user's pointer. */
  peer: (name: string) => string;
  tooLarge: string;
  failed: string;
  reload: string;
}

const englishPlurals = new Intl.PluralRules("en");

export const DEFAULT_MESSAGES: WhiteboardMessages = {
  board: "Whiteboard",
  toolbar: "Tools",
  tools: { select: "Select", rect: "Rectangle", pen: "Freehand", hand: "Pan" },
  colours: "Colour",
  colourNames: ["Black", "Red", "Blue"],
  undo: "Undo",
  redo: "Redo",
  exportPng: "Save as picture",
  kinds: { rect: "Rectangle", path: "Freehand line" },
  changes: { add: "add", remove: "remove", move: "move", resize: "resize", restyle: "colour" },
  shape: (shape, kind, number) =>
    `${kind} ${number} at ${Math.round(shape.x)}, ${Math.round(shape.y)}`,
  moreShapes: (count) =>
    englishPlurals.select(count) === "one"
      ? "1 more shape is in view. Zoom in to reach it."
      : `${count} more shapes are in view. Zoom in to reach them.`,
  anyShape: "shape",
  status: ({ how, steps }, changeName, kindName) => {
    const what = `${changeName} ${kindName.toLowerCase()}`;
    const sentences = {
      done: `Done: ${what}.`,
      undone: `Undid: ${what}.`,
      redone: `Redid: ${what}.`,
      skipped: `Nothing to do for ${what}: someone else changed or removed it.`,
      refused: "The board is full. Remove a shape first.",
    };
    // The count makes two equal messages in a row differ, so a screen reader reads both.
    return `${sentences[how]} Steps to undo: ${steps}.`;
  },
  peer: (name) => name,
  tooLarge: "This board has too many shapes to open here.",
  failed: "The whiteboard stopped working.",
  reload: "Start the whiteboard again",
};
