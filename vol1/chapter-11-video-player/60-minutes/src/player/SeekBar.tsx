/*
 * PART OF THE INTERVIEW: yes (about 8 minutes).
 * The seek bar and the time text. Write it after the hook.
 *
 * Why it holds at scale:
 *   1. This is the only component that reads the current time from the
 *      store. So it is the only one that React draws again while the video
 *      plays.
 *   2. While the user drags, we only move the thumb and the time text. We
 *      seek once, when the user lets go. With streaming, every seek is a
 *      network request for a new segment, so a seek on every pixel of a drag
 *      would send hundreds of requests.
 */
import { useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { PlayerMessages } from "./messages";
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
  messages: PlayerMessages;
  /** The language of the spoken time, for example "en" or "hi". */
  locale: string;
}

export function SeekBar({ store, onSeek, messages, locale }: SeekBarProps) {
  const currentTime = usePlayerValue(store, (state) => state.currentTime);
  const duration = usePlayerValue(store, (state) => state.duration);
  const status = usePlayerValue(store, (state) => state.status);
  // The time under the thumb while the user drags it. null means: no drag.
  const [dragTime, setDragTime] = useState<number | null>(null);
  // During a drag, the bar and the text show the time the user would jump to.
  const shownTime = dragTime ?? currentTime;
  const played = duration > 0 ? (shownTime / duration) * 100 : 0;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = KEY_STEPS[event.key];
    if (step !== undefined) {
      // We move by 5 seconds ourselves, so the browser must not move the slider too.
      event.preventDefault();
      onSeek(currentTime + step);
    }
  }

  function endDrag(shouldSeek: boolean) {
    if (dragTime !== null && shouldSeek) {
      onSeek(dragTime);
    }
    setDragTime(null);
  }

  return (
    <>
      <input
        type="range"
        className="player__seek"
        aria-label={messages.seek}
        aria-valuetext={messages.position(
          spokenTime(shownTime, locale),
          spokenTime(duration, locale),
        )}
        max={duration}
        step="any"
        value={shownTime}
        disabled={duration === 0 || status === "loading" || status === "error"}
        // The CSS draws the played part of the bar from this number.
        style={{ "--played": `${played}%` } as CSSProperties}
        onPointerDown={() => setDragTime(currentTime)}
        // A change that is not part of a drag (Page Up, a screen reader) seeks at once.
        onChange={({ target }) => (dragTime === null ? onSeek : setDragTime)(Number(target.value))}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        onKeyDown={handleKeyDown}
      />
      <span className="player__time">
        {formatTime(shownTime)} / {formatTime(duration)}
      </span>
    </>
  );
}
