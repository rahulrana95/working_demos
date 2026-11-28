/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say: "apply and invert are pure, so I can test them
 * with plain objects." Here are those tests.
 */
import { apply, invert } from "./commands";
import type { Command } from "./commands";
import type { Scene, Shape } from "./scene";

function rect(id: string, x = 0, y = 0): Shape {
  return { id, kind: "rect", x, y, width: 10, height: 10 };
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
    const scene = frozenScene(rect("a"), rect("b"));

    const result = apply(scene, { type: "add", shape: rect("c"), index: 1 });

    expect(result.order).toEqual(["a", "c", "b"]);
    expect(result.shapesById.c).toEqual(rect("c"));
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

  it("returns a new scene and leaves the old one as it was", () => {
    const scene = frozenScene(rect("a", 5, 5));

    const result = apply(scene, { type: "move", id: "a", dx: 1, dy: 1 });

    expect(result).not.toBe(scene);
    expect(scene.shapesById.a).toEqual(rect("a", 5, 5));
  });

  it("keeps the same object for every shape it did not change", () => {
    const scene = frozenScene(rect("a"), rect("b"));

    const result = apply(scene, { type: "move", id: "a", dx: 1, dy: 1 });

    expect(result.shapesById.b).toBe(scene.shapesById.b);
    expect(result.order).toBe(scene.order);
  });

  it("returns the same scene when the shape to move or remove does not exist", () => {
    const scene = frozenScene(rect("a"));

    expect(apply(scene, { type: "move", id: "gone", dx: 1, dy: 1 })).toBe(scene);
    expect(apply(scene, { type: "remove", id: "gone" })).toBe(scene);
  });
});

describe("invert", () => {
  const scene = frozenScene(rect("a", 1, 2), rect("b", 3, 4), rect("c", 5, 6));

  const commands: [string, Command][] = [
    ["add at the end", { type: "add", shape: rect("d"), index: 3 }],
    ["add in the middle", { type: "add", shape: rect("d"), index: 1 }],
    ["remove from the middle", { type: "remove", id: "b" }],
    ["remove the last", { type: "remove", id: "c" }],
    ["move", { type: "move", id: "a", dx: 7, dy: -3 }],
  ];

  it.each(commands)("a command and then its inverse give the first scene: %s", (_name, command) => {
    const inverse = invert(command, scene);

    expect(apply(apply(scene, command), inverse)).toEqual(scene);
  });

  it("the inverse of a remove puts the shape back at its old place in the order", () => {
    expect(invert({ type: "remove", id: "b" }, scene)).toEqual({
      type: "add",
      shape: rect("b", 3, 4),
      index: 1,
    });
  });

  it("the inverse of a move is the same distance back, whatever the scene is", () => {
    expect(invert({ type: "move", id: "a", dx: 7, dy: -3 }, scene)).toEqual({
      type: "move",
      id: "a",
      dx: -7,
      dy: 3,
    });
  });

  it("a command is plain data: it survives a trip through JSON", () => {
    const command: Command = { type: "add", shape: rect("d"), index: 0 };

    expect(JSON.parse(JSON.stringify(command))).toEqual(command);
  });
});
