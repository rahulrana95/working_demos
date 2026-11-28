/*
 * NOT PART OF THE INTERVIEW: production version.
 * The thin interface between the player and a streaming engine.
 *
 * A browser can play one MP4 file by itself. For adaptive streaming (HLS or
 * DASH) a library downloads the video in segments and feeds them to the
 * <video> element through Media Source Extensions. Nobody on a product team
 * writes that library. The player only needs these few things from it, so a
 * real engine is plugged in by writing one small adapter for this interface.
 *
 * `createNativeEngine` below is the adapter for "no library": one file, one
 * quality, the browser does the loading.
 */
import type { QualityLevel } from "./chooseQuality";
import type { ErrorKind } from "./playerMachine";

export type EngineEvent =
  /** The list of quality levels is known, or has changed. */
  | { type: "levels"; levels: QualityLevel[] }
  /** The engine now loads this level. `auto` is false when the user picked it. */
  | { type: "level_switched"; index: number; auto: boolean }
  /** The engine cannot go on. Small errors that the engine repairs itself are not sent. */
  | { type: "error"; kind: ErrorKind };

export interface StreamingEngine {
  /**
   * Starts loading `src` into the element. The player calls it again with the
   * same source to try again after an error.
   */
  loadSource: (video: HTMLVideoElement, src: string) => void;
  /** Sorted from the lowest quality to the highest. Empty when there is only one. */
  levels: () => QualityLevel[];
  /** A level index, or "auto" to let the engine choose by network speed and buffer. */
  setLevel: (level: number | "auto") => void;
  /** Returns a function that stops the listening. */
  subscribe: (listener: (event: EngineEvent) => void) => () => void;
  /** Stops every download and lets go of the element. `loadSource` can be called again later. */
  unload: () => void;
}

/** The meaning of `MediaError.code`. Code 1 is "the user stopped the load", which is no error. */
export function errorKindOfCode(code: number | undefined): ErrorKind | null {
  switch (code) {
    case 2:
      return "network";
    case 3:
      return "decode";
    case 4:
      // The browser also reports this when the first request for the file fails.
      // We cannot tell the two apart, so we do not try again by ourselves.
      return "unsupported";
    default:
      return null;
  }
}

/** The engine for one plain video file. The browser loads it; there are no levels. */
export function createNativeEngine(): StreamingEngine {
  const listeners = new Set<(event: EngineEvent) => void>();
  let attached: HTMLVideoElement | null = null;

  function handleError() {
    const kind = errorKindOfCode(attached?.error?.code);
    if (kind !== null) {
      listeners.forEach((listener) => listener({ type: "error", kind }));
    }
  }

  function detach() {
    if (attached !== null) {
      attached.removeEventListener("error", handleError);
      // This is how a page tells the browser to stop downloading a video.
      attached.removeAttribute("src");
      attached.load();
      attached = null;
    }
  }

  return {
    loadSource(video, src) {
      if (attached !== video) {
        detach();
        attached = video;
        video.addEventListener("error", handleError);
      }
      // Setting `src` starts the load, also when the value is the same as before.
      video.src = src;
    },
    levels: () => [],
    setLevel: () => undefined,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    unload: detach,
  };
}
