/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you walk through one drag by hand. Here every rule of the
 * board is a test. No browser and no React are needed: the board is one
 * pure function.
 */
import { boardReducer, createBoard, keyToAction, previewScene, visibleIds } from "./board";
import type { BoardAction, BoardState } from "./board";
import { DEFAULT_MESSAGES } from "./messages";
import type { Scene } from "./scene";

function run(state: BoardState, ...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, state);
}

function at(x: number, y: number) {
  return { point: { x, y } };
}

/** One rectangle with id "1" at 100, 100, 50 wide and 50 tall. */
function boardWithOneRect(): BoardState {
  return run(
    createBoard(),
    { type: "tool", tool: "rect" },
    { type: "down", ...at(100, 100) },
    { type: "drag", ...at(150, 150) },
    { type: "up" },
    { type: "tool", tool: "select" },
  );
}

function key(name: string, modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}) {
  return keyToAction({
    key: name,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
  });
}

describe("one command per drag", () => {
  it("adds one undo entry for a drag of 500 pointer moves", () => {
    let state = run(boardWithOneRect(), { type: "down", ...at(110, 110) });
    for (let step = 1; step <= 500; step++) {
      state = boardReducer(state, { type: "drag", ...at(110 + step, 110) });
    }
    expect(state.doc.undoStack).toHaveLength(1);

    state = boardReducer(state, { type: "up" });

    expect(state.doc.undoStack).toHaveLength(2);
    expect(state.doc.undoStack[1].command).toEqual({ type: "move", id: "1", dx: 500, dy: 0 });
    expect(state.doc.scene.shapesById["1"].x).toBe(600);
  });

  it("one undo after a long drag puts the shape back where the drag began", () => {
    const moved = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(200, 180) },
      { type: "drag", ...at(400, 300) },
      { type: "up" },
    );

    const undone = boardReducer(moved, { type: "undo" });

    expect(undone.doc.scene.shapesById["1"]).toMatchObject({ x: 100, y: 100 });
  });

  it("shows the shape at the pointer during the drag, before anything is saved", () => {
    const dragging = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(140, 120) },
    );

    expect(previewScene(dragging).shapesById["1"]).toMatchObject({ x: 130, y: 110 });
    expect(dragging.doc.scene.shapesById["1"]).toMatchObject({ x: 100, y: 100 });
  });

  it("returns the saved scene itself when no drag is in progress", () => {
    const state = boardWithOneRect();

    expect(previewScene(state)).toBe(state.doc.scene);
  });

  it("adds no entry for a click that does not move", () => {
    const state = run(boardWithOneRect(), { type: "down", ...at(110, 110) }, { type: "up" });

    expect(state.doc.undoStack).toHaveLength(1);
    expect(state.selectedId).toBe("1");
    expect(state.drag).toBeNull();
  });

  it("adds no entry for a drag that ends where it began", () => {
    const state = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(300, 300) },
      { type: "drag", ...at(110, 110) },
      { type: "up" },
    );

    expect(state.doc.undoStack).toHaveLength(1);
  });

  it("ignores pointer moves when no button is down", () => {
    const state = boardWithOneRect();

    expect(boardReducer(state, { type: "drag", ...at(300, 300) })).toBe(state);
  });

  it("Escape cancels the drag: the shape stays and no entry is added", () => {
    const state = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(300, 300) },
      { type: "cancel" },
    );

    expect(state.drag).toBeNull();
    expect(previewScene(state).shapesById["1"]).toMatchObject({ x: 100, y: 100 });

    // The button is released later. That must not finish the cancelled drag.
    const released = run(state, { type: "drag", ...at(320, 320) }, { type: "up" });
    expect(released.doc.undoStack).toHaveLength(1);
  });
});

describe("the rectangle tool", () => {
  it("draws a rectangle from pointer down to pointer up, as one command", () => {
    const state = boardWithOneRect();

    expect(state.doc.scene.order).toEqual(["1"]);
    expect(state.doc.scene.shapesById["1"]).toEqual({
      id: "1",
      kind: "rect",
      x: 100,
      y: 100,
      width: 50,
      height: 50,
    });
    expect(state.doc.undoStack).toHaveLength(1);
  });

  it("selects the new rectangle", () => {
    expect(boardWithOneRect().selectedId).toBe("1");
  });

  it("puts a new rectangle on top of the others", () => {
    const state = run(
      boardWithOneRect(),
      { type: "tool", tool: "rect" },
      { type: "down", ...at(120, 120) },
      { type: "drag", ...at(200, 200) },
      { type: "up" },
    );

    expect(state.doc.scene.order).toEqual(["1", "2"]);
  });

  it("a cancelled drawing leaves no shape", () => {
    const state = run(
      createBoard(),
      { type: "tool", tool: "rect" },
      { type: "down", ...at(10, 10) },
      { type: "drag", ...at(90, 90) },
      { type: "cancel" },
    );

    expect(previewScene(state).order).toEqual([]);
    expect(state.doc.undoStack).toEqual([]);
  });

  it("does not select or move the shape under the pointer", () => {
    const state = run(
      boardWithOneRect(),
      { type: "tool", tool: "rect" },
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(130, 130) },
      { type: "up" },
    );

    expect(state.doc.scene.shapesById["1"]).toMatchObject({ x: 100, y: 100 });
    expect(state.doc.scene.order).toHaveLength(2);
  });
});

describe("the select tool", () => {
  it("selects the shape under the pointer", () => {
    const state = run(
      { ...boardWithOneRect(), selectedId: null },
      { type: "down", ...at(120, 120) },
    );

    expect(state.selectedId).toBe("1");
  });

  it("clears the selection on a click on empty board", () => {
    const state = run(boardWithOneRect(), { type: "down", ...at(500, 500) }, { type: "up" });

    expect(state.selectedId).toBeNull();
  });

  it("a drag that starts on empty board moves nothing", () => {
    const state = run(
      boardWithOneRect(),
      { type: "down", ...at(500, 500) },
      { type: "drag", ...at(520, 520) },
      { type: "up" },
    );

    expect(state.doc.undoStack).toHaveLength(1);
  });
});

describe("while a drag is in progress", () => {
  function midDrag(): BoardState {
    return run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(200, 200) },
    );
  }

  const ignored: BoardAction[] = [
    { type: "undo" },
    { type: "redo" },
    { type: "remove" },
    { type: "add" },
    { type: "nudge", dx: 10, dy: 0 },
    { type: "tool", tool: "rect" },
    { type: "down", ...at(5, 5) },
  ];

  it.each(ignored)("ignores $type", (action) => {
    const state = midDrag();

    expect(boardReducer(state, action)).toBe(state);
  });
});

describe("keys", () => {
  it("Delete removes the selected shape as one command, and undo brings it back", () => {
    const removed = boardReducer(boardWithOneRect(), { type: "remove" });
    expect(removed.doc.scene.order).toEqual([]);
    expect(removed.doc.undoStack).toHaveLength(2);

    expect(boardReducer(removed, { type: "undo" }).doc.scene.order).toEqual(["1"]);
  });

  it("an arrow key moves the selected shape, one command per key press", () => {
    const state = run(
      boardWithOneRect(),
      { type: "nudge", dx: 10, dy: 0 },
      { type: "nudge", dx: 10, dy: 0 },
      { type: "nudge", dx: 0, dy: -10 },
    );

    expect(state.doc.scene.shapesById["1"]).toMatchObject({ x: 120, y: 90 });
    expect(state.doc.undoStack).toHaveLength(4);
  });

  it("Delete does nothing when no shape is selected", () => {
    const state = { ...boardWithOneRect(), selectedId: null };

    expect(boardReducer(state, { type: "remove" })).toBe(state);
  });

  it("Enter adds a rectangle when the rectangle tool is chosen, and selects it", () => {
    const state = run(createBoard(), { type: "tool", tool: "rect" }, { type: "add" });

    expect(state.doc.scene.shapesById["1"]).toEqual({
      id: "1",
      kind: "rect",
      x: 40,
      y: 40,
      width: 120,
      height: 80,
    });
    expect(state.selectedId).toBe("1");
    expect(state.doc.undoStack).toHaveLength(1);
  });

  it("Enter adds nothing when the select tool is chosen", () => {
    const state = createBoard();

    expect(boardReducer(state, { type: "add" })).toBe(state);
  });

  it("keyboard only: add a rectangle, nudge it, undo the nudge", () => {
    const state = run(
      createBoard(),
      { type: "tool", tool: "rect" },
      { type: "add" },
      { type: "nudge", dx: 10, dy: 0 },
      { type: "undo" },
    );

    expect(state.doc.scene.shapesById["1"]).toMatchObject({ x: 40, y: 40 });
    expect(state.doc.redoStack).toHaveLength(1);
  });
});

describe("undo and redo on the board", () => {
  it("does nothing when there is nothing to undo or redo", () => {
    const state = createBoard();

    expect(boardReducer(state, { type: "undo" })).toBe(state);
    expect(boardReducer(state, { type: "redo" })).toBe(state);
  });

  it("records what was done, undone and redone, as data for the status line", () => {
    const moved = boardReducer(boardWithOneRect(), { type: "nudge", dx: 10, dy: 0 });
    expect(moved.lastChange).toEqual({ how: "done", what: "move", steps: 2 });

    const undone = boardReducer(moved, { type: "undo" });
    expect(undone.lastChange).toEqual({ how: "undone", what: "move", steps: 1 });

    const undoneTwice = boardReducer(undone, { type: "undo" });
    expect(undoneTwice.lastChange).toEqual({ how: "undone", what: "add", steps: 0 });

    const redone = boardReducer(undoneTwice, { type: "redo" });
    expect(redone.lastChange).toEqual({ how: "redone", what: "add", steps: 1 });
  });

  it("two equal undos in a row give two different messages, so both are read out", () => {
    const state = run(
      boardWithOneRect(),
      { type: "nudge", dx: 10, dy: 0 },
      { type: "nudge", dx: 10, dy: 0 },
    );

    const first = boardReducer(state, { type: "undo" });
    const second = boardReducer(first, { type: "undo" });

    expect(first.lastChange).toEqual({ how: "undone", what: "move", steps: 2 });
    expect(second.lastChange).toEqual({ how: "undone", what: "move", steps: 1 });
    const say = (state: BoardState) =>
      state.lastChange && DEFAULT_MESSAGES.status(state.lastChange);
    expect(say(first)).not.toBe(say(second));
  });

  it("a new command after an undo empties the redo stack", () => {
    const state = run(
      boardWithOneRect(),
      { type: "nudge", dx: 10, dy: 0 },
      { type: "undo" },
      { type: "nudge", dx: 0, dy: 10 },
    );

    expect(state.doc.redoStack).toEqual([]);
    expect(boardReducer(state, { type: "redo" })).toBe(state);
  });

  it("keys do nothing to a selected shape that undo has removed, and redo selects it again", () => {
    const undone = boardReducer(boardWithOneRect(), { type: "undo" });
    expect(undone.selectedId).toBe("1");
    expect(undone.doc.scene.order).toEqual([]);

    const afterKeys = run(undone, { type: "nudge", dx: 10, dy: 0 }, { type: "remove" });
    expect(afterKeys.doc).toBe(undone.doc);

    const redone = boardReducer(afterKeys, { type: "redo" });
    expect(redone.doc.scene.shapesById["1"]).toMatchObject({ x: 100, y: 100 });
  });
});

describe("ids", () => {
  it("never gives a new shape the id of a shape in a loaded scene", () => {
    const scene: Scene = {
      shapesById: {
        "7": { id: "7", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
        note: { id: "note", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
      },
      order: ["7", "note"],
    };

    const state = run(createBoard(scene), { type: "tool", tool: "rect" }, { type: "add" });

    expect(state.doc.scene.order).toEqual(["7", "note", "8"]);
  });

  it("does not use an id again after the shape was removed", () => {
    const state = run(
      createBoard(),
      { type: "tool", tool: "rect" },
      { type: "add" },
      { type: "remove" },
      { type: "add" },
    );

    expect(state.doc.scene.order).toEqual(["3"]);
  });
});

describe("keyToAction", () => {
  it("maps Ctrl+Z and Cmd+Z to undo", () => {
    expect(key("z", { ctrl: true })).toEqual({ type: "undo" });
    expect(key("z", { meta: true })).toEqual({ type: "undo" });
  });

  it("maps Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y to redo", () => {
    // With Shift held, the browser reports the key as a capital letter.
    expect(key("Z", { ctrl: true, shift: true })).toEqual({ type: "redo" });
    expect(key("Z", { meta: true, shift: true })).toEqual({ type: "redo" });
    expect(key("y", { ctrl: true })).toEqual({ type: "redo" });
  });

  it("leaves Cmd+Y and other shortcuts of the browser alone", () => {
    expect(key("y", { meta: true })).toBeNull();
    expect(key("r", { ctrl: true })).toBeNull();
    expect(key("ArrowLeft", { ctrl: true })).toBeNull();
  });

  it("maps Delete and Backspace to remove, Escape to cancel, Enter to add", () => {
    expect(key("Delete")).toEqual({ type: "remove" });
    expect(key("Backspace")).toEqual({ type: "remove" });
    expect(key("Escape")).toEqual({ type: "cancel" });
    expect(key("Enter")).toEqual({ type: "add" });
  });

  it("maps the four arrows to a nudge of 10 pixels", () => {
    expect(key("ArrowLeft")).toEqual({ type: "nudge", dx: -10, dy: 0 });
    expect(key("ArrowRight")).toEqual({ type: "nudge", dx: 10, dy: 0 });
    expect(key("ArrowUp")).toEqual({ type: "nudge", dx: 0, dy: -10 });
    expect(key("ArrowDown")).toEqual({ type: "nudge", dx: 0, dy: 10 });
  });

  it("returns null for a key that is not a shortcut", () => {
    expect(key("a")).toBeNull();
    expect(key("z")).toBeNull();
    expect(key("Tab")).toBeNull();
    expect(key(" ")).toBeNull();
  });
});

describe("pan and zoom", () => {
  it("pan moves the view by the distance on the canvas, divided by the scale", () => {
    const state = run(createBoard(), { type: "pan", dx: -100, dy: -50 });
    expect(state.view).toEqual({ x: 100, y: 50, scale: 1 });

    const zoomed = { ...state, view: { ...state.view, scale: 2 } };
    expect(boardReducer(zoomed, { type: "pan", dx: -100, dy: -50 }).view).toEqual({
      x: 150,
      y: 75,
      scale: 2,
    });
  });

  it("zoom keeps the board position under the pointer", () => {
    const state = run(createBoard(), { type: "zoom", point: { x: 200, y: 100 }, factor: 2 });

    expect(state.view).toEqual({ x: 100, y: 50, scale: 2 });
  });

  it("a pointer position goes through the view before it selects a shape", () => {
    const moved = run(boardWithOneRect(), { type: "pan", dx: -1000, dy: 0 });

    // The rectangle at 100, 100 is now 1,000 pixels to the left of the canvas.
    const missed = run({ ...moved, selectedId: null }, { type: "down", ...at(120, 120) });
    expect(missed.selectedId).toBeNull();

    const back = run(moved, { type: "pan", dx: 1000, dy: 0 }, { type: "down", ...at(120, 120) });
    expect(back.selectedId).toBe("1");
  });

  it("a drag at 200 percent moves the shape half as far on the board as on the canvas", () => {
    const zoomed = { ...boardWithOneRect(), view: { x: 0, y: 0, scale: 2 } };

    const state = run(
      zoomed,
      { type: "down", ...at(220, 220) },
      { type: "drag", ...at(320, 260) },
      { type: "up" },
    );

    expect(state.doc.scene.shapesById["1"]).toMatchObject({ x: 150, y: 120 });
  });

  it("pan and zoom add no undo entry", () => {
    const state = run(
      boardWithOneRect(),
      { type: "pan", dx: 10, dy: 10 },
      { type: "zoom", point: { x: 0, y: 0 }, factor: 2 },
    );

    expect(state.doc.undoStack).toHaveLength(1);
  });

  it("with nothing selected, an arrow key moves the view instead of a shape", () => {
    const state = run(
      { ...boardWithOneRect(), selectedId: null },
      { type: "nudge", dx: 10, dy: 0 },
    );

    expect(state.view.x).toBe(10);
    expect(state.doc.undoStack).toHaveLength(1);
  });

  it("the wheel is ignored in the middle of a drag", () => {
    const dragging = run(boardWithOneRect(), { type: "down", ...at(110, 110) });

    expect(boardReducer(dragging, { type: "pan", dx: 10, dy: 10 })).toBe(dragging);
    expect(boardReducer(dragging, { type: "zoom", point: { x: 0, y: 0 }, factor: 2 })).toBe(
      dragging,
    );
  });

  it("Enter adds the rectangle near the corner of the view, wherever the view is", () => {
    const state = run(
      createBoard(),
      { type: "pan", dx: -5000, dy: -3000 },
      { type: "tool", tool: "rect" },
      { type: "add" },
    );

    expect(state.doc.scene.shapesById["1"]).toMatchObject({ x: 5040, y: 3040, width: 120 });
  });
});

describe("visibleIds", () => {
  function gridOfRects(): BoardState {
    const scene: Scene = { shapesById: {}, order: [] };
    for (let index = 0; index < 10_000; index++) {
      const id = String(index + 1);
      const x = (index % 100) * 60;
      const y = Math.floor(index / 100) * 60;
      scene.shapesById[id] = { id, kind: "rect", x, y, width: 20, height: 20 };
      scene.order.push(id);
    }
    return createBoard(scene);
  }

  it("names a few hundred of 10,000 shapes for one screen", () => {
    const ids = visibleIds(gridOfRects());

    expect(ids.length).toBeGreaterThan(80);
    expect(ids.length).toBeLessThan(400);
    expect(ids[0]).toBe("1");
  });

  it("names more shapes when the view is zoomed out", () => {
    const board = gridOfRects();
    const zoomedOut = { ...board, view: { x: 0, y: 0, scale: 0.25 } };

    expect(visibleIds(zoomedOut).length).toBeGreaterThan(visibleIds(board).length * 4);
  });

  it("includes the shape that is being drawn", () => {
    const drawing = run(
      gridOfRects(),
      { type: "tool", tool: "rect" },
      { type: "down", ...at(5, 5) },
      { type: "drag", ...at(50, 50) },
    );

    expect(visibleIds(drawing).slice(-1)).toEqual(["10001"]);
  });

  it("keeps a moved shape in the list during its drag, so it is drawn at the pointer", () => {
    const dragging = run(
      gridOfRects(),
      { type: "down", ...at(10, 10) },
      { type: "drag", ...at(300, 300) },
    );

    expect(dragging.selectedId).toBe("1");
    expect(visibleIds(dragging)).toContain("1");
    expect(previewScene(dragging).shapesById["1"]).toMatchObject({ x: 290, y: 290 });
  });
});
