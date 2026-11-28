/* NOT PART OF THE INTERVIEW. Tests for the two stacks. */
import type { Command } from "./commands";
import { DEFAULT_HISTORY_LIMIT, execute, redo, undo } from "./history";
import type { Doc } from "./history";
import type { Shape } from "./scene";

function rect(id: string, x = 0): Shape {
  return { id, kind: "rect", x, y: 0, width: 10, height: 10 };
}

function add(id: string): Command {
  return { type: "add", shape: rect(id), index: Number.MAX_SAFE_INTEGER };
}

function emptyDoc(): Doc {
  return { scene: { shapesById: {}, order: [] }, undoStack: [], redoStack: [] };
}

function runAll(doc: Doc, commands: Command[], limit?: number): Doc {
  return commands.reduce((current, command) => execute(current, command, limit), doc);
}

describe("execute", () => {
  it("changes the scene and puts one entry on the undo stack", () => {
    const doc = execute(emptyDoc(), add("a"));

    expect(doc.scene.order).toEqual(["a"]);
    expect(doc.undoStack).toEqual([{ command: add("a"), inverse: { type: "remove", id: "a" } }]);
  });

  it("empties the redo stack when a new command runs after an undo", () => {
    const afterUndo = undo(runAll(emptyDoc(), [add("a"), add("b")]));
    expect(afterUndo.redoStack).toHaveLength(1);

    const afterNew = execute(afterUndo, add("c"));

    expect(afterNew.redoStack).toEqual([]);
    expect(afterNew.scene.order).toEqual(["a", "c"]);
    // The shape that was undone cannot come back by redo.
    expect(redo(afterNew)).toBe(afterNew);
  });

  it("does not add an entry, and keeps the redo stack, when the command changes nothing", () => {
    const afterUndo = undo(runAll(emptyDoc(), [add("a"), add("b")]));

    const result = execute(afterUndo, { type: "move", id: "not-there", dx: 5, dy: 5 });

    expect(result).toBe(afterUndo);
  });

  it(`keeps at most ${DEFAULT_HISTORY_LIMIT} entries by default and drops the oldest`, () => {
    const commands = Array.from({ length: 150 }, (_unused, index) => add(`s${index}`));

    const doc = runAll(emptyDoc(), commands);

    expect(DEFAULT_HISTORY_LIMIT).toBe(100);
    expect(doc.undoStack).toHaveLength(100);
    expect(doc.undoStack[0].command).toEqual(add("s50"));
    // The scene still has all 150 shapes. Only the way back is shorter.
    expect(doc.scene.order).toHaveLength(150);
  });

  it("uses the limit it is given", () => {
    const doc = runAll(emptyDoc(), [add("a"), add("b"), add("c")], 2);

    expect(doc.undoStack.map((entry) => entry.command)).toEqual([add("b"), add("c")]);
  });

  it("never holds more than the limit, even after 10,000 commands", () => {
    let doc = execute(emptyDoc(), add("a"));
    for (let step = 0; step < 10_000; step++) {
      doc = execute(doc, { type: "move", id: "a", dx: 1, dy: 0 });
      expect(doc.undoStack.length).toBeLessThanOrEqual(100);
    }

    expect(doc.scene.shapesById.a.x).toBe(10_000);
  });
});

describe("undo and redo", () => {
  it("undo takes the last command back and moves its entry to the redo stack", () => {
    const done = runAll(emptyDoc(), [add("a"), { type: "move", id: "a", dx: 30, dy: 0 }]);

    const undone = undo(done);

    expect(undone.scene.shapesById.a.x).toBe(0);
    expect(undone.undoStack).toHaveLength(1);
    expect(undone.redoStack).toEqual([done.undoStack[1]]);
  });

  it("redo runs the command again and moves its entry back", () => {
    const done = runAll(emptyDoc(), [add("a"), { type: "move", id: "a", dx: 30, dy: 0 }]);

    const redone = redo(undo(done));

    expect(redone).toEqual(done);
  });

  it("returns the same document when there is nothing to undo or to redo", () => {
    const doc = emptyDoc();

    expect(undo(doc)).toBe(doc);
    expect(redo(doc)).toBe(doc);
  });

  it("undoes in the opposite order: the last command first", () => {
    let doc = runAll(emptyDoc(), [add("a"), add("b"), add("c")]);

    doc = undo(doc);
    expect(doc.scene.order).toEqual(["a", "b"]);
    doc = undo(doc);
    expect(doc.scene.order).toEqual(["a"]);
    doc = redo(doc);
    expect(doc.scene.order).toEqual(["a", "b"]);
  });

  it("undo of a remove puts the shape back where it was in the drawing order", () => {
    const done = runAll(emptyDoc(), [add("a"), add("b"), add("c"), { type: "remove", id: "b" }]);
    expect(done.scene.order).toEqual(["a", "c"]);

    expect(undo(done).scene.order).toEqual(["a", "b", "c"]);
  });

  it("100 undos and then 100 redos give the same scene again", () => {
    const moves = Array.from({ length: 99 }, (_unused, index): Command => {
      return { type: "move", id: "a", dx: index, dy: -index };
    });
    const done = runAll(emptyDoc(), [add("a"), ...moves]);

    let doc = done;
    for (let step = 0; step < 100; step++) {
      doc = undo(doc);
    }
    expect(doc.scene).toEqual({ shapesById: {}, order: [] });
    for (let step = 0; step < 100; step++) {
      doc = redo(doc);
    }

    expect(doc).toEqual(done);
  });
});
