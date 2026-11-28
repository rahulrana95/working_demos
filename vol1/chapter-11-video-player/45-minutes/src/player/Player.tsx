/*
 * PART OF THE INTERVIEW: yes (about 11 minutes).
 * Write it last. Order:
 *   1. The video element, the play button and the seek bar.   (3 minutes)
 *   2. Mute, volume, the error with "Try again", the spinner. (4 minutes)
 *   3. The keyboard shortcuts.                                (4 minutes)
 *
 * Why it holds at scale: this component reads the status from the store,
 * never the time. So it is not drawn again while the video plays.
 */
import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { SEEK_STEP_SECONDS, SeekBar } from "./SeekBar";
import { controlOwnsKey } from "./shortcuts";
import { usePlayer, usePlayerValue } from "./usePlayer";

export interface PlayerProps {
  /** The address of the video file. */
  src: string;
  /** The name of the video. Screen readers read it as the name of the player. */
  title: string;
  /** Try to start at once. The browser may block it. Then the play button stays. */
  autoPlay?: boolean;
}

const VOLUME_STEP = 0.1;

export function Player({ src, title, autoPlay = false }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { store, togglePlay, seek, retry } = usePlayer(videoRef, src, autoPlay);
  const status = usePlayerValue(store, (state) => state.status);
  // The element owns the volume too. This is a copy, updated by "volumechange".
  const [sound, setSound] = useState({ volume: 1, muted: false });

  /** Changes the sound on the element, which owns it. Its "volumechange" event updates our copy. */
  function changeSound(nextVolume: (volume: number) => number, toggleMuted = false) {
    const video = videoRef.current;
    if (video !== null) {
      video.volume = Math.min(Math.max(nextVolume(video.volume), 0), 1);
      // A change of the volume also switches the sound back on.
      video.muted = toggleMuted && !video.muted;
    }
  }
  const toggleMute = () => changeSound((volume) => volume, true);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const hasModifier = event.altKey || event.ctrlKey || event.metaKey;
    if (hasModifier || controlOwnsKey(event.target as Element, event.key)) {
      return;
    }

    const { currentTime } = store.getState();
    const shortcuts: Record<string, () => void> = {
      " ": togglePlay,
      k: togglePlay,
      m: toggleMute,
      arrowleft: () => seek(currentTime - SEEK_STEP_SECONDS),
      arrowright: () => seek(currentTime + SEEK_STEP_SECONDS),
      arrowup: () => changeSound((volume) => volume + VOLUME_STEP),
      arrowdown: () => changeSound((volume) => volume - VOLUME_STEP),
      home: () => seek(0),
      end: () => seek(Infinity),
    };
    const shortcut = shortcuts[event.key.toLowerCase()];

    if (shortcut !== undefined) {
      // Stops Space and the arrows from scrolling the page.
      event.preventDefault();
      shortcut();
    }
  }

  function handleRetry(event: MouseEvent<HTMLButtonElement>) {
    retry();
    // The button is removed now. Without this, the keyboard focus would be lost.
    event.currentTarget.closest<HTMLElement>(".player")?.focus();
  }

  return (
    // The shortcuts work only while the focus is inside this element.
    <div
      className="player"
      role="group"
      aria-label={title}
      aria-busy={status === "loading" || status === "buffering"}
      // The CSS draws a spinner for "loading" and "buffering", but only after 300 ms.
      data-status={status}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <video
        ref={videoRef}
        className="player__video"
        playsInline
        onClick={togglePlay}
        // The element owns the volume. We copy it when the element says it changed.
        onVolumeChange={({ currentTarget: { volume, muted } }) => setSound({ volume, muted })}
      />

      {status === "error" && (
        <div className="player__error" role="alert">
          <p>The video could not be loaded.</p>
          <button type="button" onClick={handleRetry}>
            Try again
          </button>
        </div>
      )}

      <div className="player__controls">
        <button type="button" onClick={togglePlay}>
          {status === "playing" || status === "buffering" ? "Pause" : "Play"}
        </button>
        <SeekBar store={store} onSeek={seek} />
        <button type="button" aria-pressed={sound.muted} onClick={toggleMute}>
          Mute
        </button>
        <input
          type="range"
          aria-label="Volume"
          // A range input goes from 0 to 100, the video element from 0 to 1.
          value={sound.volume * 100}
          onChange={(event) => changeSound(() => Number(event.target.value) / 100)}
        />
      </div>
    </div>
  );
}
