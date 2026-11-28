/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * Write it after the state machine. It joins the video element to the machine.
 *
 * Why it holds at scale:
 *   1. The video element is the source of truth. We never keep a second
 *      clock. We copy what the element reports.
 *   2. The state lives in a small store outside React. A component reads one
 *      value from it, and React draws that component again only when that
 *      value changes. "timeupdate" fires 4 to 66 times a second, and only the
 *      seek bar reads the time, so only the seek bar is drawn again.
 *   3. play() returns a promise. When the browser blocks autoplay, the
 *      promise rejects. We catch it, and the player stays paused.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { INITIAL_STATE, MEDIA_SIGNALS, reducePlayer } from "./playerMachine";
import type { PlayerEvent, PlayerState } from "./playerMachine";

export function createPlayerStore() {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispatch(event: PlayerEvent) {
      const nextState = reducePlayer(state, event);
      // The machine returns the same object when the event changes nothing.
      if (nextState !== state) {
        state = nextState;
        listeners.forEach((listener) => listener());
      }
    },
  };
}

export type PlayerStore = ReturnType<typeof createPlayerStore>;

/** Reads one value from the store. The component is drawn again only when that value changes. */
export function usePlayerValue<T>(store: PlayerStore, select: (state: PlayerState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

export function usePlayer(videoRef: RefObject<HTMLVideoElement>, src: string, autoPlay = false) {
  // useState with a function creates the store once, on the first render.
  const [store] = useState(createPlayerStore);

  function play() {
    store.dispatch({ type: "play" });
    // An old browser returns nothing from play(), so we wrap the result.
    // A rejection means: autoplay was blocked, or a pause came first.
    Promise.resolve(videoRef.current?.play()).catch(() =>
      store.dispatch({ type: "play_rejected" }),
    );
  }

  function togglePlay() {
    const { status } = store.getState();
    // "buffering" also means that the user wants to play, so we pause there too.
    status === "playing" || status === "buffering" ? videoRef.current?.pause() : play();
  }

  /** Jumps to a time in seconds. The machine keeps it inside the video. */
  function seek(time: number) {
    const before = store.getState();
    store.dispatch({ type: "seek", time });
    const after = store.getState();
    // We write to the element only when the machine accepted the seek.
    if (after !== before && videoRef.current !== null) {
      videoRef.current.currentTime = after.currentTime;
    }
  }

  /** Loads the same source again. Only the "Try again" button of the error state calls it. */
  function retry() {
    store.dispatch({ type: "retry" });
    videoRef.current?.load();
    play();
  }

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    const handlers: Record<string, () => void> = {
      loadedmetadata: () => store.dispatch({ type: "loadedmetadata", duration: video.duration }),
      timeupdate: () => store.dispatch({ type: "timeupdate", currentTime: video.currentTime }),
    };
    MEDIA_SIGNALS.forEach((type) => (handlers[type] = () => store.dispatch({ type })));
    Object.entries(handlers).forEach(([type, handle]) => video.addEventListener(type, handle));

    store.dispatch({ type: "load" });
    video.src = src;
    if (autoPlay) {
      play();
    }

    // When the source changes or the player is removed: stop listening, stop the download.
    return () => {
      Object.entries(handlers).forEach(([type, handle]) => video.removeEventListener(type, handle));
      video.removeAttribute("src");
      video.load();
    };
    // `autoPlay` is read once for each source, and `play` only uses the store
    // and the ref, which never change. So neither is in the list.
  }, [videoRef, store, src]);

  return { store, togglePlay, seek, retry };
}
