/*
 * NOT PART OF THE INTERVIEW: production version.
 * Counts a post as "seen" when at least half of it was on screen for one
 * second. A plain class with no React.
 *
 * Why it holds at scale:
 *   1. One IntersectionObserver for all posts. No scroll listener.
 *   2. The ids are sent in batches: one event for up to 20 posts, not one
 *      event per post.
 *   3. A post is reported once, however often the user scrolls past it.
 *
 * An impression holds the id of a post and nothing else.
 */

export interface ImpressionOptions {
  /** How long a post must stay on screen. */
  visibleMs?: number;
  /** How long ids wait for more ids before they are sent. */
  batchMs?: number;
  /** A batch is sent at once when it holds this many ids. */
  maxBatchSize?: number;
}

/** A post counts when this part of it is on screen. */
const VISIBLE_PART = 0.5;

export class ImpressionTracker {
  private observer: IntersectionObserver | null = null;
  /** The posts that are half on screen now, with the timer that will count them. */
  private timers = new Map<string, ReturnType<typeof setTimeout> | null>();
  private reported = new Set<string>();
  private batch: string[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | undefined;
  private visibleMs: number;
  private batchMs: number;
  private maxBatchSize: number;

  constructor(
    private onBatch: (postIds: string[]) => void,
    { visibleMs = 1000, batchMs = 5000, maxBatchSize = 20 }: ImpressionOptions = {},
  ) {
    this.visibleMs = visibleMs;
    this.batchMs = batchMs;
    this.maxBatchSize = maxBatchSize;

    // A browser without IntersectionObserver reports no impressions.
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver(this.handleEntries, { threshold: VISIBLE_PART });
    }
    this.start();
  }

  /** Listens for a hidden tab. A new tracker has started; call it again after `stop`. */
  start(): void {
    // Adding the same listener twice adds it once.
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  /** Starts watching a post. The element needs `data-post-id`. Returns the function that stops it. */
  observe = (row: HTMLElement): (() => void) => {
    this.observer?.observe(row);
    return () => {
      this.observer?.unobserve(row);
      this.leave(row.dataset.postId);
    };
  };

  /** Sends the ids that wait, now. */
  flush = (): void => {
    clearTimeout(this.batchTimer);
    this.batchTimer = undefined;
    if (this.batch.length > 0) {
      const postIds = this.batch;
      this.batch = [];
      this.onBatch(postIds);
    }
  };

  /** Sends what waits and stops watching. Call it when the feed is removed. */
  stop(): void {
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    for (const postId of [...this.timers.keys()]) {
      this.leave(postId);
    }
    this.flush();
  }

  private handleEntries = (entries: IntersectionObserverEntry[]): void => {
    for (const entry of entries) {
      const postId = (entry.target as HTMLElement).dataset.postId;
      if (postId === undefined || this.reported.has(postId)) {
        continue;
      }

      if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_PART) {
        this.enter(postId);
      } else {
        this.leave(postId);
      }
    }
  };

  /** The post is half on screen. Start its timer, unless the tab is hidden. */
  private enter(postId: string): void {
    if (this.timers.get(postId) != null) {
      return;
    }
    const isTabVisible = document.visibilityState !== "hidden";
    this.timers.set(
      postId,
      isTabVisible ? setTimeout(() => this.count(postId), this.visibleMs) : null,
    );
  }

  /** The post left the screen before its second was over. */
  private leave(postId: string | undefined): void {
    if (postId !== undefined) {
      clearTimeout(this.timers.get(postId) ?? undefined);
      this.timers.delete(postId);
    }
  }

  private count(postId: string): void {
    this.timers.delete(postId);
    this.reported.add(postId);
    this.batch.push(postId);

    if (this.batch.length >= this.maxBatchSize) {
      this.flush();
    } else if (this.batchTimer === undefined) {
      this.batchTimer = setTimeout(this.flush, this.batchMs);
    }
  }

  /**
   * Nobody sees a hidden tab, so its time does not count: the timers stop,
   * and start again from zero when the tab is shown. The ids that wait are
   * sent now, because a hidden tab may never come back.
   */
  private handleVisibilityChange = (): void => {
    const isHidden = document.visibilityState === "hidden";
    for (const postId of [...this.timers.keys()]) {
      clearTimeout(this.timers.get(postId) ?? undefined);
      this.timers.set(postId, null);
      if (!isHidden) {
        this.enter(postId);
      }
    }
    if (isHidden) {
      this.flush();
    }
  };
}
