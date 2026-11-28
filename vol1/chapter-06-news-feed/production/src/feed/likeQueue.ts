/*
 * NOT PART OF THE INTERVIEW: production version.
 * A plain class with no React. It sends likes one at a time, in the order
 * of the taps. The production version adds offline: a like that could not
 * be sent stays in the queue, and is sent when the network works again.
 *
 * Why it holds at scale:
 *   1. One request at a time: the server gets the choices in the order the
 *      user made them.
 *   2. A newer choice for a post replaces one that was not sent yet.
 *   3. Every choice has its own idempotency key, and keeps it for every
 *      try. The server never counts a like twice.
 *   4. No retry loop: after a failure the queue stops, and waits until
 *      someone calls `resume`. A choice is tried `MAX_TRIES` times at most.
 */
import { LikeRejectedError } from "./types";
import type { LikeState } from "./types";

export interface LikeIntent {
  postId: string;
  liked: boolean;
  /** The same for every try of this choice. */
  idempotencyKey: string;
  /** How often this choice was sent. */
  tries: number;
}

export const MAX_TRIES = 5;

export interface LikeQueueCallbacks {
  /**
   * A choice is done. `saved` is `null` when the server refused it, or when
   * it failed `MAX_TRIES` times. `isLatest` is false when a newer choice for
   * the same post waits in the queue.
   */
  onSettled: (intent: LikeIntent, saved: LikeState | null, isLatest: boolean) => void;
  /** True when the queue stops after a failure, false when it runs again. */
  onPausedChange: (isPaused: boolean) => void;
}

export class LikeQueue {
  private waiting: LikeIntent[] = [];
  private isSending = false;
  private isPaused = false;
  private isStopped = false;

  constructor(
    private send: (intent: LikeIntent) => Promise<LikeState>,
    private callbacks: LikeQueueCallbacks,
  ) {}

  add(postId: string, liked: boolean): void {
    this.waiting = this.waiting.filter((intent) => intent.postId !== postId);
    // `randomUUID` needs HTTPS or localhost, like most new browser features.
    this.waiting.push({ postId, liked, idempotencyKey: crypto.randomUUID(), tries: 0 });
    // A tap is a good moment to find out whether the network is back.
    this.resume();
  }

  /** Call it when any request has succeeded again, or the browser says "online". */
  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.callbacks.onPausedChange(false);
    }
    void this.drain();
  }

  /** Drops what was not sent yet. Call it when the feed is removed. */
  stop(): void {
    this.isStopped = true;
    this.waiting = [];
  }

  private hasNewerChoice(postId: string): boolean {
    return this.waiting.some((intent) => intent.postId === postId);
  }

  private async drain(): Promise<void> {
    if (this.isSending) {
      return;
    }
    this.isSending = true;

    while (!this.isPaused && !this.isStopped && this.waiting.length > 0) {
      // The array is not empty, so `shift` gives an intent.
      const intent = this.waiting.shift() as LikeIntent;
      intent.tries += 1;

      let saved: LikeState | null = null;
      let canTryLater = false;
      try {
        saved = await this.send(intent);
      } catch (error) {
        canTryLater = !(error instanceof LikeRejectedError) && intent.tries < MAX_TRIES;
      }
      if (this.isStopped) {
        break;
      }

      const isLatest = !this.hasNewerChoice(intent.postId);
      if (saved === null && canTryLater) {
        // Keep the choice at the front, unless the user chose again since.
        if (isLatest) {
          this.waiting.unshift(intent);
        }
        this.isPaused = true;
        this.callbacks.onPausedChange(true);
      } else {
        this.callbacks.onSettled(intent, saved, isLatest);
      }
    }

    this.isSending = false;
  }
}
