/*
 * NOT PART OF THE INTERVIEW: production version.
 * The seek bar and the time text. On top of the 60-minute version it draws
 * every downloaded range, and it shows the time under the mouse, under the
 * thumb during a drag, and at the thumb while the keyboard is used.
 *
 * Why it holds at scale:
 *   1. This is the only component that reads the current time from the
 *      store. So it is the only one that React draws again while the video
 *      plays.
 *   2. While the user drags, we only move the thumb and the time text. We
 *      seek once, when the user lets go. With streaming, every seek is a
 *      network request for a new segment.
 */
import { useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import type { PlayerMessages } from "./messages";
import { usePlayerValue } from "./store";
import type { PlayerStore } from "./store";
import { formatTime, spokenTime, timeAtPointer } from "./time";

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
  const buffered = usePlayerValue(store, (state) => state.buffered);
  const status = usePlayerValue(store, (state) => state.status);
  // The time under the thumb while the user drags it. null means: no drag.
  const [dragTime, setDragTime] = useState<number | null>(null);
  // The time under the mouse. null means: the mouse is not over the bar.
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  // True while the slider has the focus from the keyboard.
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);

  const isDisabled =
    duration === 0 || status === "idle" || status === "loading" || status === "error";
  // During a drag, the bar and the text show the time the user would jump to.
  const shownTime = dragTime ?? currentTime;
  const previewTime = dragTime ?? hoverTime ?? (hasKeyboardFocus ? currentTime : null);
  const percent = (seconds: number) => `${duration > 0 ? (seconds / duration) * 100 : 0}%`;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // A key press on the slider is keyboard use for sure, so the preview is shown.
    setHasKeyboardFocus(true);
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

  // A real movement of the mouse, not the bar moving under a still mouse.
  function handleMouseMove(event: MouseEvent<HTMLInputElement>) {
    const bar = event.currentTarget;
    const { left, width } = bar.getBoundingClientRect();
    const isRtl = getComputedStyle(bar).direction === "rtl";
    setHoverTime(timeAtPointer(event.clientX, left, width, duration, isRtl));
  }

  return (
    <>
      <div className="player__seek-area">
        {/* Decoration only. A screen reader gets the time from the slider. */}
        <div className="player__ranges" aria-hidden="true">
          {buffered.map(([start, end]) => (
            <span
              key={start}
              className="player__buffered"
              style={{ insetInlineStart: percent(start), inlineSize: percent(end - start) }}
            />
          ))}
          {previewTime !== null && !isDisabled && (
            <span className="player__preview" style={{ insetInlineStart: percent(previewTime) }}>
              {formatTime(previewTime)}
            </span>
          )}
        </div>
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
          disabled={isDisabled}
          // The CSS draws the played part of the bar from this number.
          style={{ "--played": percent(shownTime) } as CSSProperties}
          onPointerDown={() => setDragTime(currentTime)}
          // A change that is not part of a drag (Page Up, a screen reader) seeks at once.
          onChange={({ target }) =>
            (dragTime === null ? onSeek : setDragTime)(Number(target.value))
          }
          onPointerUp={() => endDrag(true)}
          onPointerCancel={() => endDrag(false)}
          onKeyDown={handleKeyDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverTime(null)}
          // ":focus-visible" is true for focus by keyboard, not by a mouse click.
          onFocus={(event) => setHasKeyboardFocus(event.target.matches(":focus-visible"))}
          onBlur={() => setHasKeyboardFocus(false)}
        />
      </div>
      <span className="player__time">
        {formatTime(shownTime)} / {formatTime(duration)}
      </span>
    </>
  );
}
