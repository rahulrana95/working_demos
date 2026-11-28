/*
 * PART OF THE INTERVIEW: yes (about 8 minutes).
 * This file and history.ts are the heart of the answer. Write them before any
 * drawing code, and test them without a browser.
 *
 * Why it holds at scale: a command is a few numbers, not a copy of the scene.
 * One hundred steps of history for a board of 10,000 shapes are one hundred
 * small objects. A full copy per step would be one hundred boards.
 */
import type { Scene, Shape } from "./scene";

/**
 * One change to the scene, as plain data. A move holds a distance, not a
 * position, so the opposite move is the same distance back.
 */
export type Command =
  | { type: "add"; shape: Shape; index: number }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; dx: number; dy: number };

/** Returns a new scene. Returns the same scene when the target does not exist. */
export function apply(scene: Scene, command: Command): Scene {
  if (command.type === "add") {
    const { shape, index } = command;
    const order = [...scene.order.slice(0, index), shape.id, ...scene.order.slice(index)];
    return { shapesById: { ...scene.shapesById, [shape.id]: shape }, order };
  }

  const shape = scene.shapesById[command.id];
  if (shape === undefined) {
    return scene;
  }
  if (command.type === "remove") {
    const { [command.id]: removed, ...shapesById } = scene.shapesById;
    return { shapesById, order: scene.order.filter((id) => id !== removed.id) };
  }
  const moved = { ...shape, x: shape.x + command.dx, y: shape.y + command.dy };
  return { ...scene, shapesById: { ...scene.shapesById, [shape.id]: moved } };
}

/**
 * The command that takes the change back. `sceneBefore` is the scene before
 * the command ran: it still has the shape that a remove deletes, and its
 * place in the drawing order.
 */
export function invert(command: Command, sceneBefore: Scene): Command {
  if (command.type === "add") {
    return { type: "remove", id: command.shape.id };
  }
  if (command.type === "move") {
    return { ...command, dx: -command.dx, dy: -command.dy };
  }
  const shape = sceneBefore.shapesById[command.id];
  return { type: "add", shape, index: sceneBefore.order.indexOf(command.id) };
}
