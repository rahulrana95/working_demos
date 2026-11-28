/*
 * NOT PART OF THE INTERVIEW.
 * Tests for the events. The last one proves that no event holds what the
 * user drew.
 */
import { boardReducer, createBoard } from "./board";
import type { BoardAction, BoardState } from "./board";
import { eventsFor } from "./events";
import type { BoardEvent } from "./events";

/** Runs the actions and collects the events of every step. */
function runWithEvents(state: BoardState, actions: BoardAction[]) {
  const events: BoardEvent[] = [];
  let current = state;
  for (const action of actions) {
    const next = boardReducer(current, action);
    events.push(...eventsFor(current, next, action));
    current = next;
  }
  return { state: current, events };
}

function at(x: number, y: number) {
  return { point: { x, y } };
}

const drawRect: BoardAction[] = [
  { type: "tool", tool: "rect" },
  { type: "down", ...at(131, 247) },
  { type: "drag", ...at(389, 401) },
  { type: "up" },
];

const drawLine: BoardAction[] = [
  { type: "tool", tool: "pen" },
  { type: "down", ...at(517, 263) },
  { type: "drag", ...at(533, 271) },
  { type: "drag", ...at(547, 293) },
  { type: "up" },
];

describe("eventsFor", () => {
  it("reports a new shape with its kind, once, when the drag ends", () => {
    const { events } = runWithEvents(createBoard({ userId: "a" }), [...drawRect, ...drawLine]);

    expect(events).toEqual([
      { type: "shape_created", kind: "rect" },
      { type: "shape_created", kind: "path" },
    ]);
  });

  it("reports nothing for pointer moves, tools, pan and zoom", () => {
    const { events } = runWithEvents(createBoard({ userId: "a" }), [
      { type: "tool", tool: "select" },
      { type: "down", ...at(10, 10) },
      { type: "drag", ...at(20, 20) },
      { type: "up" },
      { type: "pan", dx: 5, dy: 5 },
      { type: "zoom", factor: 2 },
    ]);

    expect(events).toEqual([]);
  });

  it("reports an undo and a redo, and not a move or a remove as a new shape", () => {
    const { events } = runWithEvents(createBoard({ userId: "a" }), [
      ...drawRect,
      { type: "nudge", dx: 10, dy: 0, at: 0 },
      { type: "undo" },
      { type: "redo" },
      { type: "remove" },
    ]);

    expect(events).toEqual([
      { type: "shape_created", kind: "rect" },
      { type: "undo", applied: true },
      { type: "redo", applied: true },
    ]);
  });

  it("reports nothing for an undo with an empty stack", () => {
    const { events } = runWithEvents(createBoard({ userId: "a" }), [{ type: "undo" }]);

    expect(events).toEqual([]);
  });

  it("reports an undo that had nothing left to do as not applied", () => {
    const drawn = runWithEvents(createBoard({ userId: "a" }), drawRect).state;
    const [own] = drawn.sync.unconfirmed;
    const removedByOther: BoardAction[] = [
      { type: "remote", seq: 1, operation: own },
      {
        type: "remote",
        seq: 2,
        operation: { id: "b-1", userId: "b", command: { type: "remove", id: "a-1" } },
      },
      { type: "undo" },
    ];

    const { events } = runWithEvents(drawn, removedByOther);

    expect(events).toEqual([{ type: "undo", applied: false }]);
  });

  it("reports a conflict when someone else changes the shape this user is changing", () => {
    const drawn = runWithEvents(createBoard({ userId: "a" }), drawRect).state;

    const { events } = runWithEvents(drawn, [
      {
        type: "remote",
        seq: 1,
        operation: { id: "b-1", userId: "b", command: { type: "remove", id: "a-1" } },
      },
    ]);

    expect(events).toEqual([{ type: "sync_conflict" }]);
  });

  it("reports a full board with the number of shapes", () => {
    const full = createBoard({ userId: "a", limits: { maxShapes: 0 } });

    const { events } = runWithEvents(full, drawRect);

    expect(events).toEqual([{ type: "scene_too_large", shapeCount: 0 }]);
  });

  it("never puts positions, sizes, points, colours or ids in an event", () => {
    const { events, state } = runWithEvents(createBoard({ userId: "user-7f3a" }), [
      { type: "resize", width: 720, height: 420 },
      { type: "stroke", stroke: "#b42318" },
      ...drawRect,
      ...drawLine,
      { type: "nudge", dx: 10, dy: 0, at: 0 },
      { type: "undo" },
      { type: "redo" },
      { type: "tool", tool: "select" },
      { type: "down", ...at(140, 260) },
      { type: "drag", ...at(171, 283) },
      { type: "up" },
      { type: "remove" },
      { type: "undo" },
    ]);
    expect(events.length).toBeGreaterThan(4);
    const text = JSON.stringify(events);

    // Every number the user drew with, and every number in the scene.
    const drawn = new Set<number>([
      131, 247, 389, 401, 517, 263, 533, 271, 547, 293, 140, 260, 171, 283,
    ]);
    for (const shape of Object.values(state.sync.scene.shapesById)) {
      [shape.x, shape.y, shape.width, shape.height].forEach((value) => drawn.add(value));
    }
    for (const value of drawn) {
      expect(text).not.toContain(String(value));
    }
    expect(text).not.toContain("#b42318");
    expect(text).not.toContain("user-7f3a");
    expect(text).not.toContain("points");
    expect(text).not.toContain("stroke");
    // Only these keys may appear in an event.
    const keys = new Set(events.flatMap((event) => Object.keys(event)));
    expect([...keys].sort()).toEqual(["applied", "kind", "type"]);
  });
});
