/*
 * NOT PART OF THE INTERVIEW: production version.
 * Playback quality events for monitoring. They answer the questions a video
 * team asks every day: how long until the first picture, how often and how
 * long did it stop to buffer, which quality did people get, what failed.
 *
 * An event holds numbers and fixed words only. It never holds the address
 * or the title of the video, a caption, or anything else that says who
 * watches what. The code that receives the events adds its own session data.
 */
import type { StreamingEngine } from "./engine";
import type { ErrorKind, PlayerState } from "./playerMachine";
import type { PlayerStore } from "./store";

export type PlayerMetricEvent =
  /** From the start of the load to the first moving picture. */
  | { type: "first_frame"; ms: number }
  | { type: "autoplay_blocked" }
  /** The picture stopped after it had started. A wait before the first frame is not counted here. */
  | { type: "rebuffer_start"; count: number; afterSeek: boolean }
  | { type: "rebuffer_end"; ms: number; totalMs: number }
  /** The picture stood still although the element did not say so. */
  | { type: "stall_detected" }
  /** Heights in pixels, for example 480 to 720. `fromHeight` is null for the first level. */
  | { type: "quality_switch"; fromHeight: number | null; toHeight: number; auto: boolean }
  /** `retry` is the number of the try by ourselves that follows, or 0 when the user sees the error. */
  | { type: "error"; kind: ErrorKind | "render"; retry: number }
  /** Sent every 10 seconds of watching, and once at the end. Times are for this load of the player. */
  | { type: "heartbeat"; watchedMs: number; rebufferCount: number; rebufferMs: number }
  | { type: "ended" };

export const HEARTBEAT_MS = 10_000;
/** A wait that starts this soon after a seek is the cost of the seek, not a network problem. */
const SEEK_WINDOW_MS = 1000;

export interface Metrics {
  /** The controller calls these for things the store cannot see. */
  loadStarted: () => void;
  autoplayBlocked: () => void;
  stallDetected: () => void;
  seeked: () => void;
  stop: () => void;
}

export function createMetrics(
  store: PlayerStore,
  engine: StreamingEngine,
  onEvent: (event: PlayerMetricEvent) => void,
  now: () => number = () => performance.now(),
): Metrics {
  let previous: PlayerState = store.getState();
  let loadStartedAt: number | null = null;
  let hasFirstFrame = false;
  let playingSince: number | null = null;
  let watchedMs = 0;
  let rebufferStartedAt: number | null = null;
  let rebufferCount = 0;
  let rebufferMs = 0;
  let lastSeekAt = -Infinity;
  let currentHeight: number | null = null;

  function watchedSoFar(): number {
    return watchedMs + (playingSince === null ? 0 : now() - playingSince);
  }

  function sendHeartbeat() {
    onEvent({
      type: "heartbeat",
      watchedMs: Math.round(watchedSoFar()),
      rebufferCount,
      rebufferMs: Math.round(rebufferMs),
    });
  }

  function handleChange() {
    const state = store.getState();
    const from = previous.status;
    const to = state.status;
    const retries = state.retries;
    const hadRetries = previous.retries;
    previous = state;

    if (retries > hadRetries) {
      onEvent({ type: "error", kind: "network", retry: retries });
    }
    if (from === to) {
      return;
    }

    if (from === "playing") {
      watchedMs = watchedSoFar();
      playingSince = null;
    }

    if (to === "playing") {
      playingSince = now();
      if (!hasFirstFrame && loadStartedAt !== null) {
        hasFirstFrame = true;
        onEvent({ type: "first_frame", ms: Math.round(now() - loadStartedAt) });
      }
      if (rebufferStartedAt !== null) {
        const ms = now() - rebufferStartedAt;
        rebufferMs += ms;
        rebufferStartedAt = null;
        onEvent({ type: "rebuffer_end", ms: Math.round(ms), totalMs: Math.round(rebufferMs) });
      }
    } else if (to === "buffering" && from === "playing") {
      rebufferStartedAt = now();
      rebufferCount += 1;
      onEvent({
        type: "rebuffer_start",
        count: rebufferCount,
        afterSeek: now() - lastSeekAt <= SEEK_WINDOW_MS,
      });
    } else if (to === "error" && state.errorKind !== null) {
      onEvent({ type: "error", kind: state.errorKind, retry: 0 });
    } else if (to === "ended") {
      onEvent({ type: "ended" });
      sendHeartbeat();
    }

    // A wait that ends in a pause or an error is over, but it is not a "rebuffer_end".
    if (to !== "buffering" && to !== "playing") {
      if (rebufferStartedAt !== null) {
        rebufferMs += now() - rebufferStartedAt;
        rebufferStartedAt = null;
      }
    }
  }

  const stopStore = store.subscribe(handleChange);
  const stopEngine = engine.subscribe((event) => {
    if (event.type === "level_switched") {
      const toHeight = engine.levels()[event.index]?.height;
      if (toHeight !== undefined && toHeight !== currentHeight) {
        onEvent({ type: "quality_switch", fromHeight: currentHeight, toHeight, auto: event.auto });
        currentHeight = toHeight;
      }
    }
  });
  const heartbeatTimer = setInterval(() => {
    if (playingSince !== null) {
      sendHeartbeat();
    }
  }, HEARTBEAT_MS);

  return {
    loadStarted() {
      // A new source, or a retry by the user: the first frame is measured again.
      loadStartedAt = now();
      hasFirstFrame = false;
    },
    autoplayBlocked: () => onEvent({ type: "autoplay_blocked" }),
    stallDetected: () => onEvent({ type: "stall_detected" }),
    seeked() {
      lastSeekAt = now();
    },
    stop() {
      stopStore();
      stopEngine();
      clearInterval(heartbeatTimer);
      // The last numbers, for a viewer who leaves in the middle.
      if (hasFirstFrame && store.getState().status !== "ended") {
        sendHeartbeat();
      }
    },
  };
}
