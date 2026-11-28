/*
 * NOT PART OF THE INTERVIEW: production version.
 * Saves the scene in the browser, so a closed tab or a lost connection does
 * not lose the drawing. Neither function ever throws: storage can be full,
 * switched off (private mode in some browsers) or hold text from an old version.
 */
import type { Scene } from "./scene";

export interface SaveResult {
  ok: boolean;
  /** The number of characters that were written, or 0 when the save failed. */
  size: number;
}

export function saveScene(key: string, scene: Scene): SaveResult {
  try {
    const text = JSON.stringify(scene);
    window.localStorage.setItem(key, text);
    return { ok: true, size: text.length };
  } catch {
    // Most often the storage is full. The drawing stays in memory, and the next save tries again.
    return { ok: false, size: 0 };
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Checks the few things the rest of the code relies on. Saved text can come from an old version. */
function isScene(value: unknown): value is Scene {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { shapesById, order } = value as Partial<Scene>;
  if (typeof shapesById !== "object" || shapesById === null || !Array.isArray(order)) {
    return false;
  }
  return order.every((id) => {
    const shape = shapesById[id] as Partial<Scene["shapesById"][string]> | undefined;
    return (
      shape !== undefined &&
      shape.id === id &&
      (shape.kind === "rect" || (shape.kind === "path" && Array.isArray(shape.points))) &&
      [shape.x, shape.y, shape.width, shape.height].every(isNumber) &&
      typeof shape.stroke === "string"
    );
  });
}

/** The saved scene, or null when there is none or it cannot be used. */
export function loadScene(key: string): Scene | null {
  try {
    const text = window.localStorage.getItem(key);
    const value: unknown = text === null ? null : JSON.parse(text);
    return isScene(value) ? value : null;
  } catch {
    return null;
  }
}
