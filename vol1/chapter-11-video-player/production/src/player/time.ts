/*
 * NOT PART OF THE INTERVIEW: production version.
 * Small pure functions for showing and reading out a time.
 * The production version adds `timeAtPointer` for the preview of the seek bar.
 */

function splitSeconds(totalSeconds: number) {
  // The duration is NaN before the video has loaded.
  const whole = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
  };
}

/** 80 becomes "1:20". 3723 becomes "1:02:03". */
export function formatTime(totalSeconds: number): string {
  const { hours, minutes, seconds } = splitSeconds(totalSeconds);
  const twoDigits = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${minutes}:${twoDigits(seconds)}`;
}

/**
 * 80 becomes "1 minute 20 seconds", in the words and plural forms of the
 * given language. A screen reader reads "1:20" badly.
 */
export function spokenTime(totalSeconds: number, locale: string): string {
  const { hours, minutes, seconds } = splitSeconds(totalSeconds);
  // The browser knows the unit names and plural rules of every language.
  const part = (count: number, unit: string) =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(count);
  const parts = [
    hours > 0 ? part(hours, "hour") : "",
    minutes > 0 ? part(minutes, "minute") : "",
    seconds > 0 ? part(seconds, "second") : "",
  ].filter((text) => text !== "");

  return parts.length > 0 ? parts.join(" ") : part(0, "second");
}

/** Half the width of the thumb of the seek bar, in pixels. The CSS uses the same number. */
export const THUMB_RADIUS_PX = 9;

/**
 * The time in the video for a pointer over the seek bar. The middle of the
 * thumb cannot reach the two ends of the bar: it stops half a thumb before
 * each. `isRtl` is true in a right-to-left page, where the bar starts on the right.
 */
export function timeAtPointer(
  pointerX: number,
  barLeft: number,
  barWidth: number,
  duration: number,
  isRtl: boolean,
): number {
  const usableWidth = barWidth - 2 * THUMB_RADIUS_PX;
  if (usableWidth <= 0 || duration <= 0) {
    return 0;
  }
  const part = Math.min(Math.max((pointerX - barLeft - THUMB_RADIUS_PX) / usableWidth, 0), 1);
  return (isRtl ? 1 - part : part) * duration;
}
