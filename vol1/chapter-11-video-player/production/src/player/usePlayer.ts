/*
 * NOT PART OF THE INTERVIEW: production version.
 * The React side of the player logic. It makes the store once, and a new
 * controller for each source. The logic itself is in `controller.ts`.
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createController } from "./controller";
import type { PlayerController } from "./controller";
import type { StreamingEngine } from "./engine";
import type { PlayerMetricEvent } from "./metrics";
import { loadPosition, rememberPosition } from "./storage";
import { createPlayerStore } from "./store";

export interface UsePlayerOptions {
  src: string;
  engine: StreamingEngine;
  autoPlay: boolean;
  loadAtOnce: boolean;
  /** With an id, the player remembers the place in this video on this device. */
  videoId: string | undefined;
  stallTimeoutMs: number;
  onEvent?: (event: PlayerMetricEvent) => void;
}

/** The actions never change, so a component that gets them is not drawn again for them. */
export type PlayerActions = Omit<PlayerController, "destroy">;

export function usePlayer(videoRef: RefObject<HTMLVideoElement>, options: UsePlayerOptions) {
  const { src, engine, autoPlay, loadAtOnce, videoId, stallTimeoutMs, onEvent } = options;
  // useState with a function creates the store once, on the first render.
  const [store] = useState(createPlayerStore);
  const controllerRef = useRef<PlayerController | null>(null);

  // The parent may pass a new `onEvent` function on every render. We keep the
  // latest one in a ref, so a new function does not load the video again.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    const controller = createController(video, store, {
      src,
      engine,
      autoPlay,
      loadAtOnce,
      startTime: videoId === undefined ? 0 : loadPosition(videoId),
      stallTimeoutMs,
      onEvent: (event) => onEventRef.current?.(event),
      random: Math.random,
    });
    controllerRef.current = controller;
    const stopRemembering =
      videoId === undefined ? () => undefined : rememberPosition(store, videoId);

    return () => {
      // The place is saved before the controller empties the video.
      stopRemembering();
      controller.destroy();
      controllerRef.current = null;
    };
    // A new source, engine or video id makes a new controller. `autoPlay` and
    // `loadAtOnce` are read once for each source, so a change of them alone
    // does not load the video again.
  }, [videoRef, store, src, engine, videoId, stallTimeoutMs]);

  // Made once. Each action goes to the controller of the current source.
  const [actions] = useState<PlayerActions>(() => ({
    play: () => controllerRef.current?.play(),
    pause: () => controllerRef.current?.pause(),
    togglePlay: () => controllerRef.current?.togglePlay(),
    seek: (time) => controllerRef.current?.seek(time),
    retry: () => controllerRef.current?.retry(),
    setPlaybackRate: (rate) => controllerRef.current?.setPlaybackRate(rate),
  }));

  return { store, actions };
}
