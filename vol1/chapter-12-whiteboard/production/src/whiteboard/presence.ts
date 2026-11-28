/*
 * NOT PART OF THE INTERVIEW: production version.
 * Where the other users are: their pointer and the shape they have selected.
 * Presence is not part of the scene and not part of the history. A lost
 * presence message does no harm, because the next one replaces it.
 */
import type { Point } from "./scene";

export interface Presence {
  userId: string;
  name: string;
  colour: string;
  /** A board position, or null when the pointer is not over the board. */
  cursor: Point | null;
  selectedId: string | null;
}

/** At most one presence message is sent in this many milliseconds. */
export const PRESENCE_INTERVAL_MS = 50;

export interface Throttled<T> {
  /** Runs `send` now, or keeps the value for the end of the waiting time. */
  call: (value: T) => void;
  /** Drops a value that is still waiting. */
  cancel: () => void;
}

/**
 * Calls `send` at most once per `intervalMs`. The first value goes out at
 * once. Of the values that arrive during the wait, only the last one is sent,
 * when the wait ends. So the others always get the final position.
 */
export function createThrottle<T>(send: (value: T) => void, intervalMs: number): Throttled<T> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let waiting: { value: T } | null = null;

  function startWait() {
    timerId = setTimeout(() => {
      timerId = null;
      if (waiting !== null) {
        const { value } = waiting;
        waiting = null;
        send(value);
        startWait();
      }
    }, intervalMs);
  }

  return {
    call(value) {
      if (timerId === null) {
        send(value);
        startWait();
      } else {
        waiting = { value };
      }
    },
    cancel() {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      timerId = null;
      waiting = null;
    },
  };
}
