/*
 * NOT PART OF THE INTERVIEW: production version.
 * The interview versions have add, remove and move. This one adds resize and
 * restyle, and the rule that makes undo safe when several people draw.
 */
import type { Scene, Shape } from "./scene";

/** The values a resize or a restyle may change. */
export type ShapePatch = Partial<Pick<Shape, "x" | "y" | "width" | "height" | "stroke">>;

/**
 * One change to the scene, as plain data. A move holds a distance, not a
 * position, so the opposite move is the same distance back, and two people
 * who move the same shape at the same time both keep their move.
 */
export type Command =
  | { type: "add"; shape: Shape; index: number }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; dx: number; dy: number }
  | { type: "resize" | "restyle"; id: string; patch: ShapePatch };

/** The id of the shape the command changes. */
export function targetId(command: Command): string {
  return command.type === "add" ? command.shape.id : command.id;
}

/**
 * Returns a new scene. Returns the same scene when the command changes
 * nothing: the shape to change is gone, the shape to add is already there, or
 * the shape already has the new values.
 */
export function apply(scene: Scene, command: Command): Scene {
  const shape = scene.shapesById[targetId(command)];
  if (command.type === "add") {
    if (shape !== undefined) {
      return scene;
    }
    const added = command.shape;
    const order = [
      ...scene.order.slice(0, command.index),
      added.id,
      ...scene.order.slice(command.index),
    ];
    return { shapesById: { ...scene.shapesById, [added.id]: added }, order };
  }
  if (shape === undefined) {
    return scene;
  }
  if (command.type === "remove") {
    const { [command.id]: removed, ...shapesById } = scene.shapesById;
    return { shapesById, order: scene.order.filter((id) => id !== removed.id) };
  }

  const changes: ShapePatch =
    command.type === "move" ? { x: shape.x + command.dx, y: shape.y + command.dy } : command.patch;
  // The shape already has these values: nothing changes, so the scene stays the same object.
  const isSame = Object.entries(changes).every(
    ([key, value]) => shape[key as keyof ShapePatch] === value,
  );
  return isSame
    ? scene
    : { ...scene, shapesById: { ...scene.shapesById, [shape.id]: { ...shape, ...changes } } };
}

/** The given values, for the named keys only. A shape has all of them. */
function pick(values: ShapePatch, keys: string[]): ShapePatch {
  return Object.fromEntries(keys.map((key) => [key, values[key as keyof ShapePatch]]));
}

/**
 * The command that takes the change back. `sceneBefore` is the scene before
 * the command ran: it still has the shape that a remove deletes, and the
 * values that a resize or a restyle replaces. The shape must be in it.
 */
export function invert(command: Command, sceneBefore: Scene): Command {
  if (command.type === "add") {
    return { type: "remove", id: command.shape.id };
  }
  if (command.type === "move") {
    return { ...command, dx: -command.dx, dy: -command.dy };
  }
  const shape = sceneBefore.shapesById[command.id];
  if (command.type === "remove") {
    return { type: "add", shape, index: sceneBefore.order.indexOf(command.id) };
  }
  return { ...command, patch: pick(shape, Object.keys(command.patch)) };
}

/**
 * Makes an undo or a redo safe when other people have changed the scene since.
 *
 * `step` is what we want to run now: the inverse for an undo, the command
 * itself for a redo. `opposite` is the other one of the pair: it holds the
 * values our own change left behind. The result is the part of `step` that
 * only touches our own work, or null when nothing is left:
 *   - The shape is gone (someone removed it): nothing to do.
 *   - The shape to put back is there again: nothing to do.
 *   - A value was changed by someone else after us: that value stays theirs.
 */
export function stepOnCurrentScene(step: Command, opposite: Command, scene: Scene): Command | null {
  const shape = scene.shapesById[targetId(step)];
  if (step.type === "add") {
    return shape === undefined ? step : null;
  }
  if (shape === undefined) {
    return null;
  }
  if (step.type !== "resize" && step.type !== "restyle") {
    return step;
  }
  const ours = "patch" in opposite ? opposite.patch : {};
  const stillOurs = Object.keys(step.patch).filter(
    (key) => shape[key as keyof ShapePatch] === ours[key as keyof ShapePatch],
  );
  return stillOurs.length === 0 ? null : { ...step, patch: pick(step.patch, stillOurs) };
}
