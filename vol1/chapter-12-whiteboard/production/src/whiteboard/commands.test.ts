/*
 * NOT PART OF THE INTERVIEW.
 * apply and invert are pure, so they are tested with plain objects.
 */
import { apply, invert, stepOnCurrentScene, targetId } from "./commands";
import type { Command } from "./commands";
import type { Scene, Shape } from "./scene";

function rect(id: string, x = 0, y = 0, stroke = "black"): Shape {
  return { id, kind: "rect", x, y, width: 10, height: 10, stroke };
}

/** Freezes the scene, so a function that changes it in place throws. */
function frozenScene(...shapes: Shape[]): Scene {
  const shapesById: Record<string, Shape> = {};
  for (const shape of shapes) {
    shapesById[shape.id] = Object.freeze(shape);
  }
  return Object.freeze({
    shapesById: Object.freeze(shapesById),
    order: Object.freeze(shapes.map((shape) => shape.id)) as string[],
  });
}

describe("apply", () => {
  it("adds a shape at the given place in the drawing order", () => {
    const result = apply(frozenScene(rect("a"), rect("b")), {
      type: "add",
      shape: rect("c"),
      index: 1,
    });

    expect(result.order).toEqual(["a", "c", "b"]);
  });

  it("adds at the end when the place is beyond the end, as after a remove by someone else", () => {
    const result = apply(frozenScene(rect("a")), { type: "add", shape: rect("c"), index: 9 });

    expect(result.order).toEqual(["a", "c"]);
  });

  it("returns the same scene when the shape to add is already there", () => {
    const scene = frozenScene(rect("a"));

    expect(apply(scene, { type: "add", shape: rect("a", 50, 50), index: 0 })).toBe(scene);
  });

  it("removes a shape from the map and from the drawing order", () => {
    const result = apply(frozenScene(rect("a"), rect("b")), { type: "remove", id: "a" });

    expect(result.order).toEqual(["b"]);
    expect(result.shapesById).toEqual({ b: rect("b") });
  });

  it("moves a shape by a distance", () => {
    const result = apply(frozenScene(rect("a", 5, 5)), { type: "move", id: "a", dx: 10, dy: -2 });

    expect(result.shapesById.a).toEqual(rect("a", 15, 3));
  });

  it("a resize or a restyle changes only the values it names", () => {
    const scene = frozenScene(rect("a", 5, 5, "black"));

    const resized = apply(scene, { type: "resize", id: "a", patch: { width: 40 } });
    const restyled = apply(scene, { type: "restyle", id: "a", patch: { stroke: "red" } });

    expect(resized.shapesById.a).toEqual({ ...rect("a", 5, 5), width: 40 });
    expect(restyled.shapesById.a).toEqual(rect("a", 5, 5, "red"));
  });

  it("returns the same scene when the shape to change does not exist", () => {
    const scene = frozenScene(rect("a"));

    expect(apply(scene, { type: "move", id: "gone", dx: 1, dy: 1 })).toBe(scene);
    expect(apply(scene, { type: "remove", id: "gone" })).toBe(scene);
    expect(apply(scene, { type: "restyle", id: "gone", patch: { stroke: "red" } })).toBe(scene);
  });

  it("keeps the same object for every shape it did not change", () => {
    const scene = frozenScene(rect("a"), rect("b"));

    const result = apply(scene, { type: "move", id: "a", dx: 1, dy: 1 });

    expect(result.shapesById.b).toBe(scene.shapesById.b);
    expect(result.order).toBe(scene.order);
  });
});

describe("invert", () => {
  const scene = frozenScene(rect("a", 1, 2), rect("b", 3, 4), rect("c", 5, 6));

  const commands: [string, Command][] = [
    ["add at the end", { type: "add", shape: rect("d"), index: 3 }],
    ["add in the middle", { type: "add", shape: rect("d"), index: 1 }],
    ["remove from the middle", { type: "remove", id: "b" }],
    ["move", { type: "move", id: "a", dx: 7, dy: -3 }],
    ["resize", { type: "resize", id: "a", patch: { width: 99, height: 77 } }],
    ["restyle", { type: "restyle", id: "c", patch: { stroke: "red" } }],
  ];

  it.each(commands)("a command and then its inverse give the first scene: %s", (_name, command) => {
    expect(apply(apply(scene, command), invert(command, scene))).toEqual(scene);
  });

  it("the inverse of a restyle holds the old value of only the values that changed", () => {
    expect(invert({ type: "restyle", id: "a", patch: { stroke: "red" } }, scene)).toEqual({
      type: "restyle",
      id: "a",
      patch: { stroke: "black" },
    });
  });

  it("names the shape a command changes", () => {
    expect(targetId({ type: "add", shape: rect("d"), index: 0 })).toBe("d");
    expect(targetId({ type: "move", id: "a", dx: 1, dy: 1 })).toBe("a");
  });
});

describe("stepOnCurrentScene: undo and redo when others have changed the scene", () => {
  const add: Command = { type: "add", shape: rect("a"), index: 0 };
  const remove: Command = { type: "remove", id: "a" };
  const toRed: Command = { type: "restyle", id: "a", patch: { stroke: "red" } };
  const toBlack: Command = { type: "restyle", id: "a", patch: { stroke: "black" } };

  it("lets the undo of our add remove the shape that is still there", () => {
    expect(stepOnCurrentScene(remove, add, frozenScene(rect("a")))).toEqual(remove);
  });

  it("returns null for the undo of our add when someone else already removed the shape", () => {
    expect(stepOnCurrentScene(remove, add, frozenScene())).toBeNull();
  });

  it("returns null for the undo of our remove when the shape is back already", () => {
    expect(stepOnCurrentScene(add, remove, frozenScene(rect("a")))).toBeNull();
  });

  it("returns null for a move when the shape is gone", () => {
    const move: Command = { type: "move", id: "a", dx: 5, dy: 5 };
    const back: Command = { type: "move", id: "a", dx: -5, dy: -5 };

    expect(stepOnCurrentScene(back, move, frozenScene())).toBeNull();
    expect(stepOnCurrentScene(back, move, frozenScene(rect("a")))).toEqual(back);
  });

  it("lets the undo of our colour run when the shape still has our colour", () => {
    expect(stepOnCurrentScene(toBlack, toRed, frozenScene(rect("a", 0, 0, "red")))).toEqual(
      toBlack,
    );
  });

  it("returns null for the undo of our colour when someone else coloured the shape after us", () => {
    expect(stepOnCurrentScene(toBlack, toRed, frozenScene(rect("a", 0, 0, "blue")))).toBeNull();
  });

  it("undoes only the values that are still ours when someone changed one of two", () => {
    const resize: Command = { type: "resize", id: "a", patch: { width: 50, height: 60 } };
    const back: Command = { type: "resize", id: "a", patch: { width: 10, height: 10 } };
    // We set 50 by 60. Someone else then made the width 80.
    const scene = frozenScene({ ...rect("a"), width: 80, height: 60 });

    expect(stepOnCurrentScene(back, resize, scene)).toEqual({
      type: "resize",
      id: "a",
      patch: { height: 10 },
    });
  });
});
