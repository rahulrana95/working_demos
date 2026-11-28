/*
 * NOT PART OF THE INTERVIEW.
 * A fake streaming engine for the demo and the tests. It has the same
 * interface as an adapter for a real engine, so the player cannot tell the
 * difference.
 *
 * What it does: it lets the simulated video load, offers quality levels, and
 * in "auto" asks `chooseQuality` once a second, as a real engine does after
 * each segment. A higher level needs more kilobits for one second of video,
 * so at the same network speed it downloads more slowly.
 *
 * What it does not do: it loads no segments and uses no Media Source Extensions.
 */
import { chooseQuality, createNativeEngine } from "../player";
import type { EngineEvent, QualityLevel, StreamingEngine } from "../player";
import type { SimulatedMedia } from "./simulatedMedia";

export interface FakeEngineOptions {
  /** Sorted from the lowest quality to the highest. */
  levels: QualityLevel[];
  /** The speed of the simulated network, in kilobits a second. */
  getSpeedKbps: () => number;
  /** The simulated video, to set how fast it downloads. */
  getMedia: () => SimulatedMedia | null;
  /** How often the quality is decided again. */
  decideEveryMs?: number;
}

function bufferAhead(video: HTMLVideoElement): number {
  for (let index = 0; index < video.buffered.length; index++) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index);
    if (start <= video.currentTime && video.currentTime <= end) {
      return end - video.currentTime;
    }
  }
  return 0;
}

export function createFakeEngine(options: FakeEngineOptions): StreamingEngine {
  const { levels, getSpeedKbps, getMedia, decideEveryMs = 1000 } = options;
  // The fake engine lets the browser (here: the simulated video) do the loading.
  const native = createNativeEngine();
  const listeners = new Set<(event: EngineEvent) => void>();
  let timerId: ReturnType<typeof setInterval> | undefined;
  let currentIndex = 0;
  let isAuto = true;

  const emit = (event: EngineEvent) => listeners.forEach((listener) => listener(event));

  function useLevel(index: number, auto: boolean) {
    if (index !== currentIndex) {
      currentIndex = index;
      emit({ type: "level_switched", index, auto });
    }
    getMedia()?.setDownloadSpeed(getSpeedKbps() / levels[currentIndex].kbps);
  }

  function decide(video: HTMLVideoElement) {
    const index = isAuto
      ? chooseQuality(levels, getSpeedKbps(), bufferAhead(video), currentIndex)
      : currentIndex;
    useLevel(index, true);
  }

  return {
    loadSource(video, src) {
      clearInterval(timerId);
      native.loadSource(video, src);
      emit({ type: "levels", levels });
      emit({ type: "level_switched", index: currentIndex, auto: isAuto });
      timerId = setInterval(() => decide(video), decideEveryMs);
    },
    levels: () => levels,
    setLevel(level) {
      isAuto = level === "auto";
      if (level !== "auto") {
        useLevel(level, false);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      const stopNative = native.subscribe(listener);
      return () => {
        listeners.delete(listener);
        stopNative();
      };
    },
    unload() {
      clearInterval(timerId);
      native.unload();
    },
  };
}
