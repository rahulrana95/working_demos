/*
 * NOT PART OF THE INTERVIEW: production version.
 * The controller joins the video element, the streaming engine and the state
 * machine. It is plain TypeScript with no React, made once for each source.
 *
 * On top of the interview hook it adds:
 *   1. Errors by kind. After a network error it loads the source again by
 *      itself, with a longer wait each time, and goes back to the place and
 *      the play state the user was in.
 *   2. The stall detector and the playback quality events.
 *   3. `preload="none"`: nothing is loaded until the user presses Play.
 *   4. A muted video that started by itself is paused while its tab is hidden.
 */
import type { StreamingEngine } from "./engine";
import { createMetrics } from "./metrics";
import type { PlayerMetricEvent } from "./metrics";
import { MEDIA_SIGNALS, backoffMs, wantsToPlay } from "./playerMachine";
import type { BufferedRange, ErrorKind } from "./playerMachine";
import { watchForStalls } from "./stallDetector";
import type { PlayerStore } from "./store";

export interface ControllerOptions {
  src: string;
  engine: StreamingEngine;
  autoPlay: boolean;
  /** False for `preload="none"`: the source is loaded when the user presses Play. */
  loadAtOnce: boolean;
  /** Seconds. Where to start, for "continue watching". 0 for the beginning. */
  startTime: number;
  /** How long the time may stand still while "playing" before we call it a stall. */
  stallTimeoutMs: number;
  onEvent: (event: PlayerMetricEvent) => void;
  /** A number from 0 to 1, for the wait before a retry. A test passes a fixed one. */
  random: () => number;
}

export interface PlayerController {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  /** Jumps to a time in seconds. The machine keeps it inside the video. */
  seek: (time: number) => void;
  /** Loads the source again after an error that the user saw. */
  retry: () => void;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
}

function readBuffered(video: HTMLVideoElement): BufferedRange[] {
  const ranges: BufferedRange[] = [];
  for (let index = 0; index < video.buffered.length; index++) {
    ranges.push([video.buffered.start(index), video.buffered.end(index)]);
  }
  return ranges;
}

export function createController(
  video: HTMLVideoElement,
  store: PlayerStore,
  options: ControllerOptions,
): PlayerController {
  const { engine, src } = options;
  // One signal removes every listener at once.
  const listeners = new AbortController();
  const { signal } = listeners;
  const metrics = createMetrics(store, engine, options.onEvent);

  // Where to go, and whether to play, once the source has loaded (again).
  const resume = { time: options.startTime, play: options.autoPlay };
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let startedByItself = false;
  let pausedWhileHidden = false;

  function requestPlay() {
    store.dispatch({ type: "play" });
    // An old browser returns nothing from play(), so we wrap the result.
    Promise.resolve(video.play()).catch((error: unknown) => {
      store.dispatch({ type: "play_rejected" });
      // "NotAllowedError" is the browser blocking autoplay. Other rejections
      // (a pause came first, a new load started) are normal and not reported.
      if ((error as { name?: unknown } | null)?.name === "NotAllowedError") {
        metrics.autoplayBlocked();
      }
    });
  }

  function load() {
    engine.loadSource(video, src);
    if (resume.play) {
      requestPlay();
    }
  }

  function start() {
    store.dispatch({ type: "load" });
    metrics.loadStarted();
    load();
  }

  function handleError(kind: ErrorKind) {
    const before = store.getState();
    if (before.status !== "loading") {
      // The video was in use. Remember the place and whether it was playing.
      resume.time = before.currentTime;
      resume.play = wantsToPlay(before.status);
    }

    store.dispatch({ type: "error", kind });
    const after = store.getState();
    // The machine says whether this error gets one more try by ourselves.
    if (after.status === "loading" && after.retries > before.retries) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(load, backoffMs(after.retries, options.random()));
    }
  }

  function play() {
    startedByItself = false;
    resume.play = true;
    if (store.getState().status === "idle") {
      // `preload="none"`: the first press of Play starts the load.
      start();
    } else {
      requestPlay();
    }
  }

  function pause() {
    startedByItself = false;
    resume.play = false;
    video.pause();
  }

  const listen = (type: string, handler: () => void) =>
    video.addEventListener(type, handler, { signal });

  MEDIA_SIGNALS.forEach((type) => listen(type, () => store.dispatch({ type })));
  listen("loadedmetadata", () => {
    store.dispatch({ type: "loadedmetadata", duration: video.duration });
    if (resume.time > 0) {
      video.currentTime = Math.min(resume.time, video.duration);
    }
  });
  listen("timeupdate", () =>
    store.dispatch({ type: "timeupdate", currentTime: video.currentTime }),
  );
  listen("progress", () => store.dispatch({ type: "progress", buffered: readBuffered(video) }));
  listen("seeking", metrics.seeked);
  listen("ratechange", () =>
    store.dispatch({ type: "ratechange", playbackRate: video.playbackRate }),
  );

  const stopEngineEvents = engine.subscribe((event) => {
    if (event.type === "error") {
      handleError(event.kind);
    }
  });

  const stopStallDetector = watchForStalls(store, options.stallTimeoutMs, () => {
    store.dispatch({ type: "stalled" });
    metrics.stallDetected();
  });

  // A muted video that started by itself is decoration, for example a preview
  // in a feed. Nobody watches it in a hidden tab, so it must not use data and
  // battery there. A video the user started keeps playing: they may be listening.
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        if (startedByItself && video.muted && wantsToPlay(store.getState().status)) {
          pausedWhileHidden = true;
          video.pause();
        }
      } else if (pausedWhileHidden) {
        pausedWhileHidden = false;
        requestPlay();
      }
    },
    { signal },
  );

  if (options.loadAtOnce) {
    startedByItself = options.autoPlay;
    start();
  }

  return {
    play,
    pause,
    togglePlay: () => (wantsToPlay(store.getState().status) ? pause() : play()),
    seek(time) {
      const before = store.getState();
      store.dispatch({ type: "seek", time });
      const after = store.getState();
      // We write to the element only when the machine accepted the seek.
      if (after !== before) {
        video.currentTime = after.currentTime;
      }
    },
    retry() {
      if (store.getState().status === "error") {
        store.dispatch({ type: "retry" });
        metrics.loadStarted();
        // The user pressed a button, so they want to watch.
        resume.play = true;
        load();
      }
    },
    setPlaybackRate(rate) {
      video.playbackRate = rate;
    },
    destroy() {
      listeners.abort();
      clearTimeout(retryTimer);
      stopEngineEvents();
      stopStallDetector();
      metrics.stop();
      engine.unload();
    },
  };
}
