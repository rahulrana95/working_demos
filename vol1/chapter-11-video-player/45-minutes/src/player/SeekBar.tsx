/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * The seek bar and the time text. Write it after the hook.
 *
 * Why it holds at scale: this is the only component that reads the current
 * time from the store. So it is the only one that React draws again while the
 * video plays. The rest of the player is drawn again only when the status changes.
 */
import type { CSSProperties, KeyboardEvent } from "react";
import { formatTime, spokenTime } from "./time";
import { usePlayerValue } from "./usePlayer";
import type { PlayerStore } from "./usePlayer";

export const SEEK_STEP_SECONDS = 5;

/** The slider pattern: Right and Up go forward, Left and Down go back. */
const KEY_STEPS: Record<string, number> = {
  ArrowRight: SEEK_STEP_SECONDS,
  ArrowUp: SEEK_STEP_SECONDS,
  ArrowLeft: -SEEK_STEP_SECONDS,
  ArrowDown: -SEEK_STEP_SECONDS,
  // The machine keeps the time inside the video, so these mean "start" and "end".
  Home: -Infinity,
  End: Infinity,
};

export interface SeekBarProps {
  store: PlayerStore;
  onSeek: (time: number) => void;
}

export function SeekBar({ store, onSeek }: SeekBarProps) {
  const currentTime = usePlayerValue(store, (state) => state.currentTime);
  const duration = usePlayerValue(store, (state) => state.duration);
  const status = usePlayerValue(store, (state) => state.status);
  const played = duration > 0 ? (currentTime / duration) * 100 : 0;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = KEY_STEPS[event.key];
    if (step !== undefined) {
      // We move by 5 seconds ourselves, so the browser must not move the slider too.
      event.preventDefault();
      onSeek(currentTime + step);
    }
  }

  return (
    <>
      <input
        type="range"
        className="player__seek"
        aria-label="Seek"
        aria-valuetext={`${spokenTime(currentTime)} of ${spokenTime(duration)}`}
        max={duration}
        step="any"
        value={currentTime}
        disabled={duration === 0 || status === "loading" || status === "error"}
        // The CSS draws the played part of the bar from this number.
        style={{ "--played": `${played}%` } as CSSProperties}
        onChange={(event) => onSeek(Number(event.target.value))}
        onKeyDown={handleKeyDown}
      />
      <span className="player__time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </>
  );
}
