/*
 * PART OF THE INTERVIEW: yes (about 5 minutes).
 * The adaptive-bitrate decision, as one pure function. A streaming engine
 * calls a function like this after every segment it downloads.
 *
 * Why it holds at scale: the rule for going up is stricter than the rule for
 * staying. A speed that moves a little around the limit of a level does not
 * make the picture switch up and down every few seconds. And a full buffer
 * gives time: we do not drop the quality for a short dip in speed.
 */

export interface QualityLevel {
  /** The height of the picture in pixels, for example 720. Used as the name: "720p". */
  height: number;
  /** How many kilobits one second of this level needs. */
  kbps: number;
}

/** Go up only when the next level needs at most this part of the measured speed. */
const UP_SHARE = 0.7;
/** Stay as long as the current level needs at most this part of the measured speed. */
const STAY_SHARE = 0.9;
/** With this much video downloaded ahead, a slow moment is not a reason to go down. */
const SAFE_BUFFER_SECONDS = 10;

/**
 * Returns the index of the level to load next.
 * `levels` is sorted from the lowest quality to the highest.
 */
export function chooseQuality(
  levels: QualityLevel[],
  measuredKbps: number,
  bufferSeconds: number,
  currentIndex: number,
): number {
  const hasSafeBuffer = bufferSeconds >= SAFE_BUFFER_SECONDS;
  const next = levels[currentIndex + 1];

  // Up: one step at a time, and only with a safe buffer.
  if (next !== undefined && hasSafeBuffer && next.kbps <= measuredKbps * UP_SHARE) {
    return currentIndex + 1;
  }
  if (hasSafeBuffer || levels[currentIndex].kbps <= measuredKbps * STAY_SHARE) {
    return currentIndex;
  }
  // Down: straight to the best level the network can carry, to save the buffer.
  let index = currentIndex;
  while (index > 0 && levels[index].kbps > measuredKbps * STAY_SHARE) {
    index -= 1;
  }
  return index;
}
