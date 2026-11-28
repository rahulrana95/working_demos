/* NOT PART OF THE INTERVIEW. Tests for the two stacks of one user. */
import type { Command } from "./commands";
import {
  DEFAULT_HISTORY_LIMITS,
  EMPTY_HISTORY,
  MERGE_WINDOW_MS,
  makeEntry,
  record,
  shift,
} from "./history";
import type { History, HistoryEntry } from "./history";

function move(id: string, dx: number, dy = 0): Command {
  return { type: "move", id, dx, dy };
}

function entry(command: Command, nudgedAt?: number): HistoryEntry {
  const inverse = command.type === "move" ? move(command.id, -command.dx, -command.dy) : command;
  return makeEntry(command, inverse, nudgedAt);
}

function recordAll(entries: HistoryEntry[], limits = DEFAULT_HISTORY_LIMITS): History {
  return entries.reduce((history, next) => record(history, next, limits), EMPTY_HISTORY);
}

describe("record", () => {
  it("puts the entry on the undo stack and empties the redo stack", () => {
    const withRedo = shift(recordAll([entry(move("a", 1)), entry(move("a", 2))]), "undo", true);
    expect(withRedo.redoStack).toHaveLength(1);

    const result = record(withRedo, entry(move("a", 3)), DEFAULT_HISTORY_LIMITS);

    expect(result.undoStack.map((item) => item.command)).toEqual([move("a", 1), move("a", 3)]);
    expect(result.redoStack).toEqual([]);
  });

  it("keeps at most 100 entries by default and drops the oldest", () => {
    const entries = Array.from({ length: 150 }, (_unused, index) => entry(move("a", index)));

    const history = recordAll(entries);

    expect(DEFAULT_HISTORY_LIMITS.maxEntries).toBe(100);
    expect(history.undoStack).toHaveLength(100);
    expect(history.undoStack[0].command).toEqual(move("a", 50));
  });

  it("measures an entry by the length of its JSON", () => {
    const item = entry(move("a", 1));

    expect(item.size).toBe(JSON.stringify([item.command, item.inverse]).length);
  });

  it("drops the oldest entries when the stack is larger than the size limit", () => {
    const size = entry(move("a", 1)).size;
    const limits = { maxEntries: 100, maxSize: size * 3 };

    const history = recordAll(
      [1, 2, 3, 4, 5].map((dx) => entry(move("a", dx))),
      limits,
    );

    expect(history.undoStack.map((item) => (item.command as { dx: number }).dx)).toEqual([3, 4, 5]);
  });

  it("always keeps the newest entry, even when it alone is over the size limit", () => {
    const history = recordAll([entry(move("a", 1)), entry(move("a", 2))], {
      maxEntries: 100,
      maxSize: 1,
    });

    expect(history.undoStack.map((item) => item.command)).toEqual([move("a", 2)]);
  });

  it("one large freehand line pushes many small moves out of a small budget", () => {
    const points = Array.from({ length: 2000 }, (_unused, index) => ({ x: index, y: index }));
    const line: Command = {
      type: "add",
      index: 0,
      shape: {
        id: "p",
        kind: "path",
        x: 0,
        y: 0,
        width: 1999,
        height: 1999,
        stroke: "#000",
        points,
      },
    };
    const moves = Array.from({ length: 50 }, (_unused, index) => entry(move("a", index)));

    const history = recordAll([...moves, makeEntry(line, { type: "remove", id: "p" })], {
      maxEntries: 100,
      maxSize: 40_000,
    });

    expect(history.undoStack.length).toBeLessThan(51);
    expect(history.undoStack[history.undoStack.length - 1].command).toBe(line);
  });
});

describe("joining quick key presses", () => {
  it("joins arrow presses on one shape that follow each other fast into one entry", () => {
    const history = recordAll([
      entry(move("a", 10), 1000),
      entry(move("a", 10), 1100),
      entry(move("a", 0, 10), 1200),
    ]);

    expect(history.undoStack).toHaveLength(1);
    expect(history.undoStack[0].command).toEqual(move("a", 20, 10));
    expect(history.undoStack[0].inverse).toEqual(move("a", -20, -10));
  });

  it("starts a new entry after a pause", () => {
    const history = recordAll([
      entry(move("a", 10), 1000),
      entry(move("a", 10), 1000 + MERGE_WINDOW_MS),
    ]);

    expect(history.undoStack).toHaveLength(2);
  });

  it("measures the pause from the last press, so a long run of presses stays one entry", () => {
    const presses = Array.from({ length: 30 }, (_unused, index) =>
      entry(move("a", 10), index * 500),
    );

    expect(recordAll(presses).undoStack).toHaveLength(1);
  });

  it("does not join presses on different shapes", () => {
    const history = recordAll([entry(move("a", 10), 1000), entry(move("b", 10), 1100)]);

    expect(history.undoStack).toHaveLength(2);
  });

  it("does not join a key press with a drag, which has no press time", () => {
    const history = recordAll([entry(move("a", 300)), entry(move("a", 10), 1100)]);

    expect(history.undoStack).toHaveLength(2);
  });

  it("does not join a move with a resize", () => {
    const resize: Command = { type: "resize", id: "a", patch: { width: 50 } };
    const back: Command = { type: "resize", id: "a", patch: { width: 40 } };

    const history = recordAll([entry(move("a", 10), 1000), makeEntry(resize, back, 1100)]);

    expect(history.undoStack).toHaveLength(2);
  });

  it("joins two resizes: the newest sizes to redo, the oldest sizes to undo", () => {
    const first = makeEntry(
      { type: "resize", id: "a", patch: { width: 50, height: 10 } },
      { type: "resize", id: "a", patch: { width: 40, height: 10 } },
      1000,
    );
    const second = makeEntry(
      { type: "resize", id: "a", patch: { width: 60, height: 10 } },
      { type: "resize", id: "a", patch: { width: 50, height: 10 } },
      1100,
    );

    const [joined] = recordAll([first, second]).undoStack;

    expect(joined.command).toEqual({ type: "resize", id: "a", patch: { width: 60, height: 10 } });
    expect(joined.inverse).toEqual({ type: "resize", id: "a", patch: { width: 40, height: 10 } });
  });
});

describe("shift", () => {
  const two = recordAll([entry(move("a", 1)), entry(move("a", 2))]);

  it("moves the top undo entry to the redo stack, and back", () => {
    const undone = shift(two, "undo", true);
    expect(undone.undoStack).toHaveLength(1);
    expect(undone.redoStack).toEqual([two.undoStack[1]]);

    expect(shift(undone, "redo", true)).toEqual(two);
  });

  it("drops the entry when it is not to be kept", () => {
    const dropped = shift(two, "undo", false);

    expect(dropped.undoStack).toHaveLength(1);
    expect(dropped.redoStack).toEqual([]);
  });
});
