/*
 * NOT PART OF THE INTERVIEW: production version.
 * Which loaded messages are drawn. The interview versions draw all of them:
 * 5,000 messages are 5,000 rows on the page. Here the page holds a window.
 *
 *   - While the user is at the newest messages, the window is the newest 100.
 *     This is where a chat spends its life, so the page stays small however
 *     long the history in memory is.
 *   - When the user scrolls up, the window is pinned to its first message and
 *     grows upwards, 50 messages at a time. Back at the bottom it shrinks
 *     again.
 *
 * The trade-off: a user who scrolls back through everything still gets a
 * long page. A full virtual list would also remove the rows below the
 * screen. It must then know the height of rows it does not draw, and chat
 * rows have no fixed height.
 */
import type { Message } from "./types";

/** How many of the newest messages are drawn while the user is at the bottom. */
export const WINDOW_SIZE = 100;
/** How many older messages one step up adds. */
export const REVEAL_STEP = 50;

/**
 * The index of the first message to draw. `topId` is the `clientId` the
 * window is pinned to, or `null` while it follows the newest messages.
 */
export function windowStart(messages: Message[], topId: string | null, size = WINDOW_SIZE): number {
  const followStart = Math.max(0, messages.length - size);
  if (topId === null) {
    return followStart;
  }
  const pinned = messages.findIndex((message) => message.clientId === topId);
  // The pinned message is gone, for example after a new conversation was opened.
  return pinned === -1 ? followStart : pinned;
}

/** The message to pin to for one step up, from a window that starts at `start`. */
export function stepUp(messages: Message[], start: number, step = REVEAL_STEP): string {
  return messages[Math.max(0, start - step)].clientId;
}

/** True when the two times are on the same day of the user's calendar. */
export function isSameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** False for a time that `Date` cannot hold. Formatting such a time throws. */
export function isValidTime(time: number): boolean {
  return Number.isFinite(time) && Math.abs(time) <= 8.64e15;
}
