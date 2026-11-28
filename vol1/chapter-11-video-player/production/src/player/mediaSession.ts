/*
 * NOT PART OF THE INTERVIEW: production version.
 * The Media Session API: the play, pause and seek buttons of the lock screen,
 * of a headset and of the media keys of a keyboard. Not every browser has it,
 * and a browser that has it does not know every action, so each step checks
 * first or catches the error.
 */
import { wantsToPlay } from "./playerMachine";
import type { PlayerStore } from "./store";

export interface MediaSessionActions {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
}

const SKIP_SECONDS = 10;

/** Connects the player to the media keys. Returns a function that disconnects it. */
export function connectMediaSession(
  store: PlayerStore,
  actions: MediaSessionActions,
  title: string,
): () => void {
  if (!("mediaSession" in navigator)) {
    return () => undefined;
  }
  const session = navigator.mediaSession;

  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", actions.play],
    ["pause", actions.pause],
    [
      "seekbackward",
      (details) =>
        actions.seek(store.getState().currentTime - (details.seekOffset ?? SKIP_SECONDS)),
    ],
    [
      "seekforward",
      (details) =>
        actions.seek(store.getState().currentTime + (details.seekOffset ?? SKIP_SECONDS)),
    ],
    ["seekto", (details) => actions.seek(details.seekTime ?? store.getState().currentTime)],
  ];

  function setHandlers(isConnected: boolean) {
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, isConnected ? handler : null);
      } catch {
        // This browser does not know this action. The others still work.
      }
    }
  }

  let lastStatus = "";
  let lastDuration = -1;

  function sync() {
    const { status, duration, currentTime, playbackRate } = store.getState();
    // The time changes many times a second. We only tell the system when
    // something else changes; it counts the seconds in between by itself.
    if (status === lastStatus && duration === lastDuration) {
      return;
    }
    lastStatus = status;
    lastDuration = duration;

    session.playbackState = wantsToPlay(status) ? "playing" : status === "idle" ? "none" : "paused";
    if (duration > 0 && typeof session.setPositionState === "function") {
      try {
        session.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          // The system does not accept a speed of 0.
          playbackRate: playbackRate > 0 ? playbackRate : 1,
        });
      } catch {
        // Wrong numbers throw. The buttons still work without the position.
      }
    }
  }

  if (typeof MediaMetadata === "function") {
    session.metadata = new MediaMetadata({ title });
  }
  setHandlers(true);
  const unsubscribe = store.subscribe(sync);
  sync();

  return () => {
    unsubscribe();
    setHandlers(false);
    session.metadata = null;
    session.playbackState = "none";
  };
}
