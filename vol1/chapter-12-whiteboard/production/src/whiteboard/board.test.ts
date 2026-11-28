/*
 * NOT PART OF THE INTERVIEW.
 * Every rule of the board as a test. No browser and no React are needed:
 * the board is one pure function. The tests with two users pass each user's
 * operations to the other by hand, in the order a server would give them.
 */
import {
  DEFAULT_LIMITS,
  SceneTooLargeError,
  boardReducer,
  createBoard,
  keyToAction,
  previewScene,
  visibleIds,
} from "./board";
import type { BoardAction, BoardState } from "./board";
import { MERGE_WINDOW_MS } from "./history";
import type { Scene, Shape } from "./scene";
import type { Operation } from "./sync";

function run(state: BoardState, ...actions: BoardAction[]): BoardState {
  return actions.reduce(boardReducer, state);
}

function at(x: number, y: number) {
  return { point: { x, y } };
}

function newBoard(userId = "a", scene?: Scene): BoardState {
  // The component reports the size of the canvas. Here it is given by hand.
  return run(createBoard({ userId, scene }), { type: "resize", width: 720, height: 420 });
}

function drawRect(state: BoardState, from: [number, number], to: [number, number]): BoardState {
  return run(
    state,
    { type: "tool", tool: "rect" },
    { type: "down", ...at(...from) },
    { type: "drag", ...at(...to) },
    { type: "up" },
    { type: "tool", tool: "select" },
  );
}

/** One rectangle with id "a-1" at 100, 100, 50 wide and 50 tall. */
function boardWithOneRect(): BoardState {
  return drawRect(newBoard(), [100, 100], [150, 150]);
}

function rect(id: string, x = 0, y = 0): Shape {
  return { id, kind: "rect", x, y, width: 20, height: 20, stroke: "#1c1f23" };
}

/**
 * A tiny server: it takes the waiting operations of the given users, in the
 * given order, numbers them, and delivers them to everyone.
 */
function createRoom(...boards: BoardState[]) {
  const log: Operation[] = [];
  const delivered = boards.map(() => 0);
  return {
    boards,
    /** The server takes everything `user` has waiting. */
    takeFrom(user: number) {
      const known = new Set(log.map((operation) => operation.id));
      log.push(...boards[user].sync.unconfirmed.filter((operation) => !known.has(operation.id)));
    },
    /** `user` receives everything the server has. */
    deliverTo(user: number) {
      while (delivered[user] < log.length) {
        const operation = log[delivered[user]];
        delivered[user] += 1;
        boards[user] = boardReducer(boards[user], {
          type: "remote",
          seq: delivered[user],
          operation,
        });
      }
    },
    /** Everything from everyone arrives everywhere. */
    settle() {
      boards.forEach((_board, user) => this.takeFrom(user));
      boards.forEach((_board, user) => this.deliverTo(user));
    },
    act(user: number, ...actions: BoardAction[]) {
      boards[user] = run(boards[user], ...actions);
    },
  };
}

describe("one command per drag", () => {
  it("makes one undo entry and one operation for a drag of 500 pointer moves", () => {
    let state = run(boardWithOneRect(), { type: "down", ...at(110, 110) });
    for (let step = 1; step <= 500; step++) {
      state = boardReducer(state, { type: "drag", ...at(110 + step, 110) });
    }
    expect(state.history.undoStack).toHaveLength(1);
    expect(state.sync.unconfirmed).toHaveLength(1);

    state = boardReducer(state, { type: "up" });

    expect(state.history.undoStack).toHaveLength(2);
    expect(state.sync.unconfirmed).toHaveLength(2);
    expect(state.sync.unconfirmed[1].command).toEqual({ type: "move", id: "a-1", dx: 500, dy: 0 });
  });

  it("shows the shape at the pointer during the drag, before anything is sent", () => {
    const dragging = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(140, 120) },
    );

    expect(previewScene(dragging).shapesById["a-1"]).toMatchObject({ x: 130, y: 110 });
    expect(dragging.sync.scene.shapesById["a-1"]).toMatchObject({ x: 100, y: 100 });
  });

  it("sends nothing for a click, or for a drag that ends where it began", () => {
    const clicked = run(boardWithOneRect(), { type: "down", ...at(110, 110) }, { type: "up" });
    const backAgain = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(300, 300) },
      { type: "drag", ...at(110, 110) },
      { type: "up" },
    );

    expect(clicked.sync.unconfirmed).toHaveLength(1);
    expect(backAgain.sync.unconfirmed).toHaveLength(1);
    expect(backAgain.history.undoStack).toHaveLength(1);
  });

  it("Escape cancels the drag, and the later release sends nothing", () => {
    const state = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(300, 300) },
      { type: "cancel" },
      { type: "drag", ...at(320, 320) },
      { type: "up" },
    );

    expect(state.sync.scene.shapesById["a-1"]).toMatchObject({ x: 100, y: 100 });
    expect(state.sync.unconfirmed).toHaveLength(1);
  });

  it("ignores keys, the wheel and a second pointer in the middle of a drag", () => {
    const dragging = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(200, 200) },
    );
    const ignored: BoardAction[] = [
      { type: "undo" },
      { type: "redo" },
      { type: "remove" },
      { type: "add" },
      { type: "nudge", dx: 10, dy: 0, at: 0 },
      { type: "tool", tool: "rect" },
      { type: "stroke", stroke: "#b42318" },
      { type: "down", ...at(5, 5) },
      { type: "pan", dx: 10, dy: 10 },
      { type: "zoom", factor: 2 },
    ];

    for (const action of ignored) {
      expect(boardReducer(dragging, action)).toBe(dragging);
    }
  });

  it("still takes an operation from the server in the middle of a drag", () => {
    const dragging = run(
      boardWithOneRect(),
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(200, 200) },
    );
    const operation: Operation = {
      id: "b-1",
      userId: "b",
      command: { type: "add", shape: rect("b-1", 400, 300), index: 0 },
    };
    // Our own add must come back first: the server numbered it 1.
    const withOwn = boardReducer(dragging, {
      type: "remote",
      seq: 1,
      operation: dragging.sync.unconfirmed[0],
    });

    const after = boardReducer(withOwn, { type: "remote", seq: 2, operation });

    expect(after.sync.scene.order).toContain("b-1");
    expect(after.drag).not.toBeNull();
    expect(previewScene(after).shapesById["a-1"]).toMatchObject({ x: 190, y: 190 });
  });
});

describe("a shape that is removed by someone else during its drag", () => {
  it("the release sends nothing and adds no undo step", () => {
    const drawn = boardWithOneRect();
    const [own] = drawn.sync.unconfirmed;
    const dragging = run(
      drawn,
      { type: "remote", seq: 1, operation: own },
      { type: "down", ...at(110, 110) },
      { type: "drag", ...at(200, 200) },
      {
        type: "remote",
        seq: 2,
        operation: { id: "b-1", userId: "b", command: { type: "remove", id: "a-1" } },
      },
    );

    const released = boardReducer(dragging, { type: "up" });

    expect(released.sync.unconfirmed).toEqual([]);
    expect(released.history.undoStack).toHaveLength(1);
    expect(released.drag).toBeNull();
  });
});

describe("freehand lines", () => {
  function drawLine(points: [number, number][], start = newBoard()): BoardState {
    const [first, ...rest] = points;
    return run(
      start,
      { type: "tool", tool: "pen" },
      { type: "down", ...at(...first) },
      ...rest.map((point): BoardAction => ({ type: "drag", ...at(...point) })),
      { type: "up" },
    );
  }

  it("draws a line through the pointer positions, as one command", () => {
    const state = drawLine([
      [10, 10],
      [60, 10],
      [60, 80],
    ]);

    expect(state.sync.scene.shapesById["a-1"]).toMatchObject({
      kind: "path",
      x: 10,
      y: 10,
      width: 50,
      height: 70,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 70 },
      ],
    });
    expect(state.history.undoStack).toHaveLength(1);
    expect(state.selectedId).toBe("a-1");
  });

  it("does not keep a pointer position that is nearer than 2 pixels to the last one", () => {
    const dragging = run(
      newBoard(),
      { type: "tool", tool: "pen" },
      { type: "down", ...at(10, 10) },
      { type: "drag", ...at(11, 10) },
      { type: "drag", ...at(11, 11) },
      { type: "drag", ...at(13, 10) },
    );

    expect(dragging.drag?.points).toEqual([
      { x: 10, y: 10 },
      { x: 13, y: 10 },
    ]);
  });

  it("stores far fewer points than the pointer reported for a long, smooth line", () => {
    const moves = Array.from({ length: 5000 }, (_unused, index): [number, number] => {
      return [index * 0.5, 200 + Math.sin(index / 200) * 100];
    });

    const state = drawLine(moves);

    const shape = state.sync.scene.shapesById["a-1"];
    expect(shape.kind === "path" && shape.points.length).toBeLessThan(200);
    expect(shape.width).toBeGreaterThan(2400);
  });

  it("the line of an undo and redo is the same line", () => {
    const drawn = drawLine([
      [10, 10],
      [60, 10],
      [60, 80],
    ]);
    const shape = drawn.sync.scene.shapesById["a-1"];

    const again = run(drawn, { type: "undo" }, { type: "redo" });

    expect(again.sync.scene.shapesById["a-1"]).toEqual(shape);
  });

  it("a click with the pen, without a move, draws nothing", () => {
    const state = drawLine([[10, 10]]);

    expect(state.sync.scene.order).toEqual([]);
  });
});

describe("colours and the keyboard", () => {
  it("a colour button sets the colour of the next shape", () => {
    const state = drawRect(
      run(newBoard(), { type: "stroke", stroke: "#b42318" }),
      [10, 10],
      [50, 50],
    );

    expect(state.sync.scene.shapesById["a-1"].stroke).toBe("#b42318");
  });

  it("a colour button colours the selected shape, as one command that undo takes back", () => {
    const coloured = run(boardWithOneRect(), { type: "stroke", stroke: "#1a56db" });
    expect(coloured.sync.scene.shapesById["a-1"].stroke).toBe("#1a56db");
    expect(coloured.lastChange).toMatchObject({ how: "done", what: "restyle", kind: "rect" });

    const undone = boardReducer(coloured, { type: "undo" });
    expect(undone.sync.scene.shapesById["a-1"].stroke).toBe("#1c1f23");
  });

  it("the colour the shape already has costs no undo step", () => {
    const state = run(boardWithOneRect(), { type: "stroke", stroke: "#1c1f23" });

    expect(state.history.undoStack).toHaveLength(1);
  });

  it("Shift and an arrow key resize the selected rectangle, never below 1", () => {
    const grown = run(boardWithOneRect(), { type: "grow", dx: 10, dy: 0, at: 0 });
    expect(grown.sync.scene.shapesById["a-1"]).toMatchObject({ width: 60, height: 50 });

    const shrunk = run(grown, { type: "grow", dx: -500, dy: -500, at: 5000 });
    expect(shrunk.sync.scene.shapesById["a-1"]).toMatchObject({ width: 1, height: 1 });
  });

  it("ten quick arrow presses are one undo step, and one undo takes all ten back", () => {
    let state = boardWithOneRect();
    for (let press = 0; press < 10; press++) {
      state = boardReducer(state, { type: "nudge", dx: 10, dy: 0, at: 1000 + press * 80 });
    }
    expect(state.sync.scene.shapesById["a-1"].x).toBe(200);
    expect(state.history.undoStack).toHaveLength(2);
    // The others still get every step: ten small operations.
    expect(state.sync.unconfirmed).toHaveLength(11);

    const undone = boardReducer(state, { type: "undo" });
    expect(undone.sync.scene.shapesById["a-1"].x).toBe(100);
    expect(boardReducer(undone, { type: "redo" }).sync.scene.shapesById["a-1"].x).toBe(200);
  });

  it("an arrow press after a pause is a new undo step", () => {
    const state = run(
      boardWithOneRect(),
      { type: "nudge", dx: 10, dy: 0, at: 1000 },
      { type: "nudge", dx: 10, dy: 0, at: 1000 + MERGE_WINDOW_MS },
    );

    expect(state.history.undoStack).toHaveLength(3);
  });

  it("Enter adds a rectangle in the middle of the view, in the chosen colour", () => {
    const state = run(
      newBoard(),
      { type: "pan", dx: -1000, dy: -1000 },
      { type: "stroke", stroke: "#b42318" },
      { type: "tool", tool: "rect" },
      { type: "add" },
    );

    expect(state.sync.scene.shapesById["a-1"]).toEqual({
      id: "a-1",
      kind: "rect",
      x: 1300,
      y: 1170,
      width: 120,
      height: 80,
      stroke: "#b42318",
    });
  });

  it("Delete, arrows and a colour do nothing to a selected shape that is gone", () => {
    const undone = boardReducer(boardWithOneRect(), { type: "undo" });
    expect(undone.selectedId).toBe("a-1");

    const after = run(undone, { type: "remove" }, { type: "grow", dx: 10, dy: 0, at: 0 });

    expect(after.sync).toBe(undone.sync);
    expect(after.history).toBe(undone.history);
  });

  it("maps keys to actions", () => {
    const press = (key: string, more: Partial<KeyboardEvent> = {}) =>
      keyToAction({ key, ctrlKey: false, metaKey: false, shiftKey: false, timeStamp: 7, ...more });

    expect(press("z", { ctrlKey: true })).toEqual({ type: "undo" });
    expect(press("z", { metaKey: true })).toEqual({ type: "undo" });
    expect(press("Z", { ctrlKey: true, shiftKey: true })).toEqual({ type: "redo" });
    expect(press("y", { ctrlKey: true })).toEqual({ type: "redo" });
    expect(press("y", { metaKey: true })).toBeNull();
    expect(press("ArrowLeft")).toEqual({ type: "nudge", dx: -10, dy: 0, at: 7 });
    expect(press("ArrowDown", { shiftKey: true })).toEqual({ type: "grow", dx: 0, dy: 10, at: 7 });
    expect(press("+")).toEqual({ type: "zoom", factor: 1.25 });
    expect(press("=")).toEqual({ type: "zoom", factor: 1.25 });
    expect(press("-")).toEqual({ type: "zoom", factor: 0.8 });
    expect(press("Delete")).toEqual({ type: "remove" });
    expect(press("Backspace")).toEqual({ type: "remove" });
    expect(press("Escape")).toEqual({ type: "cancel" });
    expect(press("Enter")).toEqual({ type: "add" });
    expect(press("a")).toBeNull();
    expect(press("Tab")).toBeNull();
  });
});

describe("the view", () => {
  it("the pan tool moves the view with the pointer and adds no undo step", () => {
    const state = run(
      boardWithOneRect(),
      { type: "tool", tool: "hand" },
      { type: "down", ...at(300, 200) },
      { type: "drag", ...at(250, 180) },
      { type: "drag", ...at(200, 150) },
      { type: "up" },
    );

    expect(state.view).toEqual({ x: 100, y: 50, scale: 1 });
    expect(state.history.undoStack).toHaveLength(1);
    expect(state.sync.scene.shapesById["a-1"]).toMatchObject({ x: 100, y: 100 });
  });

  it("zoom from the keyboard keeps the middle of the canvas where it is", () => {
    const state = run(newBoard(), { type: "zoom", factor: 2 });

    expect(state.view).toEqual({ x: 180, y: 105, scale: 2 });
  });

  it("with nothing selected, an arrow key moves the view", () => {
    const state = run(newBoard(), { type: "nudge", dx: 10, dy: 0, at: 0 });

    expect(state.view.x).toBe(10);
  });

  it("names only the shapes near the view, of 10,000", () => {
    const scene: Scene = { shapesById: {}, order: [] };
    for (let index = 0; index < 10_000; index++) {
      const shape = rect(`s-${index}`, (index % 100) * 60, Math.floor(index / 100) * 60);
      scene.shapesById[shape.id] = shape;
      scene.order.push(shape.id);
    }

    const ids = visibleIds(newBoard("a", scene));

    expect(ids.length).toBeGreaterThan(80);
    expect(ids.length).toBeLessThan(400);
  });
});

describe("ids and limits", () => {
  it("gives every shape an id that starts with the user's id", () => {
    const state = drawRect(boardWithOneRect(), [200, 200], [250, 250]);

    expect(state.sync.scene.order).toEqual(["a-1", "a-2"]);
  });

  it("never repeats one of the user's ids from a loaded scene", () => {
    const scene: Scene = {
      shapesById: { "a-7": rect("a-7"), "b-90": rect("b-90"), seed: rect("seed") },
      order: ["a-7", "b-90", "seed"],
    };

    const state = drawRect(newBoard("a", scene), [200, 200], [250, 250]);

    expect(state.sync.scene.order).toEqual(["a-7", "b-90", "seed", "a-8"]);
  });

  it("throws SceneTooLargeError for a scene over the limit, and takes one at the limit", () => {
    const scene: Scene = {
      shapesById: { a: rect("a"), b: rect("b"), c: rect("c") },
      order: ["a", "b", "c"],
    };

    expect(() => createBoard({ userId: "a", scene, limits: { maxShapes: 2 } })).toThrow(
      SceneTooLargeError,
    );
    expect(() => createBoard({ userId: "a", scene, limits: { maxShapes: 3 } })).not.toThrow();
    expect(DEFAULT_LIMITS.maxShapes).toBe(20_000);
  });

  it("refuses a new shape when the board is full, and says so", () => {
    const scene: Scene = { shapesById: { s: rect("s") }, order: ["s"] };
    const full = run(createBoard({ userId: "a", scene, limits: { maxShapes: 1 } }), {
      type: "resize",
      width: 720,
      height: 420,
    });

    const state = drawRect(full, [200, 200], [250, 250]);

    expect(state.sync.scene.order).toEqual(["s"]);
    expect(state.sync.unconfirmed).toEqual([]);
    expect(state.lastChange).toMatchObject({ how: "refused", what: "add" });
    expect(state.drag).toBeNull();
  });

  it("still takes a shape from another user when the board is full, so all boards stay the same", () => {
    const scene: Scene = { shapesById: { s: rect("s") }, order: ["s"] };
    const full = createBoard({ userId: "a", scene, limits: { maxShapes: 1 } });
    const operation: Operation = {
      id: "b-1",
      userId: "b",
      command: { type: "add", shape: rect("b-1"), index: 1 },
    };

    const state = boardReducer(full, { type: "remote", seq: 1, operation });

    expect(state.sync.scene.order).toEqual(["s", "b-1"]);
  });
});

describe("undo with several users", () => {
  it("A draws, B draws, A undoes: only A's shape goes, on both boards", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    room.settle();
    room.boards[1] = drawRect(room.boards[1], [200, 200], [260, 260]);
    room.settle();
    expect(room.boards[0].sync.scene.order).toEqual(["a-1", "b-1"]);

    room.act(0, { type: "undo" });
    room.settle();

    expect(room.boards[0].sync.scene.order).toEqual(["b-1"]);
    expect(room.boards[1].sync.scene.order).toEqual(["b-1"]);
    expect(room.boards[0].lastChange).toMatchObject({ how: "undone", what: "add", kind: "rect" });
  });

  it("a user who has done nothing has nothing to undo, whatever the others did", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    room.settle();
    const before = room.boards[1];

    room.act(1, { type: "undo" });

    expect(room.boards[1]).toBe(before);
    expect(room.boards[1].sync.scene.order).toEqual(["a-1"]);
  });

  it("B moves A's shape, A undoes an earlier move: B's move stays", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    room.act(0, { type: "nudge", dx: 100, dy: 0, at: 0 });
    room.settle();
    room.act(1, { type: "select", id: "a-1" }, { type: "nudge", dx: 0, dy: 70, at: 0 });
    room.settle();
    expect(room.boards[0].sync.scene.shapesById["a-1"]).toMatchObject({ x: 110, y: 80 });

    room.act(0, { type: "undo" });
    room.settle();

    expect(room.boards[0].sync.scene.shapesById["a-1"]).toMatchObject({ x: 10, y: 80 });
    expect(room.boards[1].sync.scene).toEqual(room.boards[0].sync.scene);
  });

  it("B removes the shape A moved, A undoes the move: nothing happens, and A is told", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    room.act(0, { type: "nudge", dx: 100, dy: 0, at: 0 });
    room.settle();
    room.act(1, { type: "select", id: "a-1" }, { type: "remove" });
    room.settle();
    const waitingBefore = room.boards[0].sync.unconfirmed.length;

    room.act(0, { type: "undo" });

    expect(room.boards[0].sync.unconfirmed).toHaveLength(waitingBefore);
    expect(room.boards[0].lastChange).toEqual({
      how: "skipped",
      what: "move",
      kind: null,
      steps: 1,
    });
    // The entry is gone for good: it is not on the redo stack.
    expect(room.boards[0].history.redoStack).toEqual([]);
  });

  it("B removes A's shape, B undoes: the shape is back as B found it", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    room.settle();
    room.act(1, { type: "select", id: "a-1" }, { type: "remove" });
    room.settle();
    expect(room.boards[0].sync.scene.order).toEqual([]);

    room.act(1, { type: "undo" });
    room.settle();

    expect(room.boards[0].sync.scene.shapesById["a-1"]).toMatchObject({ x: 10, y: 10 });
    expect(room.boards[1].sync.scene).toEqual(room.boards[0].sync.scene);
  });

  it("A colours a shape red, B colours it blue, A undoes: it stays blue", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    room.act(0, { type: "stroke", stroke: "#b42318" });
    room.settle();
    room.act(1, { type: "select", id: "a-1" }, { type: "stroke", stroke: "#1a56db" });
    room.settle();

    room.act(0, { type: "undo" });
    room.settle();

    expect(room.boards[0].sync.scene.shapesById["a-1"].stroke).toBe("#1a56db");
    expect(room.boards[1].sync.scene.shapesById["a-1"].stroke).toBe("#1a56db");
    expect(room.boards[0].lastChange).toMatchObject({ how: "skipped", what: "restyle" });
  });

  it("a new command of another user does not empty this user's redo stack", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    room.act(0, { type: "undo" });
    room.settle();
    room.boards[1] = drawRect(room.boards[1], [200, 200], [260, 260]);
    room.settle();

    room.act(0, { type: "redo" });
    room.settle();

    // A's shape comes back at its old place in the drawing order: under B's.
    expect(room.boards[0].sync.scene.order).toEqual(["a-1", "b-1"]);
    expect(room.boards[1].sync.scene).toEqual(room.boards[0].sync.scene);
  });
});

describe("the order of the server", () => {
  it("both users colour the same shape before either hears of the other: the later number wins on both boards", () => {
    const scene: Scene = { shapesById: { s: rect("s", 100, 100) }, order: ["s"] };
    const room = createRoom(newBoard("a", scene), newBoard("b", scene));
    room.act(0, { type: "select", id: "s" }, { type: "stroke", stroke: "#b42318" });
    room.act(1, { type: "select", id: "s" }, { type: "stroke", stroke: "#1a56db" });
    // Each user sees their own colour first.
    expect(room.boards[0].sync.scene.shapesById.s.stroke).toBe("#b42318");
    expect(room.boards[1].sync.scene.shapesById.s.stroke).toBe("#1a56db");

    // The server takes B's operation first, then A's.
    room.takeFrom(1);
    room.takeFrom(0);
    room.deliverTo(0);
    room.deliverTo(1);

    expect(room.boards[0].sync.scene.shapesById.s.stroke).toBe("#b42318");
    expect(room.boards[1].sync.scene.shapesById.s.stroke).toBe("#b42318");
    expect(room.boards[0].conflictCount).toBe(1);
    expect(room.boards[1].conflictCount).toBe(0);
  });

  it("an operation that is delivered twice is applied once", () => {
    const room = createRoom(newBoard("a"), newBoard("b"));
    room.boards[0] = drawRect(room.boards[0], [10, 10], [60, 60]);
    const [operation] = room.boards[0].sync.unconfirmed;

    const once = boardReducer(room.boards[1], { type: "remote", seq: 1, operation });
    const twice = boardReducer(once, { type: "remote", seq: 1, operation });

    expect(twice).toBe(once);
    expect(twice.sync.scene.order).toEqual(["a-1"]);
  });

  it("stores the pointer and the selection of the others, and forgets a user who left", () => {
    const presence = {
      userId: "b",
      name: "Bela",
      colour: "#7c3aed",
      cursor: { x: 5, y: 6 },
      selectedId: null,
    };

    const withPeer = boardReducer(newBoard(), { type: "presence", presence });
    expect(withPeer.peers).toEqual({ b: presence });

    expect(boardReducer(withPeer, { type: "peerLeft", userId: "b" }).peers).toEqual({});
  });
});
