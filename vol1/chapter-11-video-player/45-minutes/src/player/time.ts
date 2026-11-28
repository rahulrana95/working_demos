/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Small pure functions for showing and reading out a time.
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

/** 80 becomes "1 minute 20 seconds". A screen reader reads "1:20" badly. */
export function spokenTime(totalSeconds: number): string {
  const { hours, minutes, seconds } = splitSeconds(totalSeconds);
  const part = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  const parts = [
    hours > 0 ? part(hours, "hour") : "",
    minutes > 0 ? part(minutes, "minute") : "",
    seconds > 0 ? part(seconds, "second") : "",
  ].filter((text) => text !== "");

  return parts.length > 0 ? parts.join(" ") : "0 seconds";
}
