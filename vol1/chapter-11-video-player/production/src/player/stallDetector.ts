/*
 * NOT PART OF THE INTERVIEW: production version.
 * The stall detector. Sometimes a video element stays "playing" and sends no
 * "waiting", but the picture does not move: a decoder is stuck, or a stream
 * has a gap. The user sees a frozen picture and no spinner.
 *
 * So we watch the clock ourselves. If the status is "playing" and the
 * current time has not changed for `timeoutMs`, we call `onStall`.
 */
import type { PlayerStore } from "./store";

/** Starts watching. Returns a function that stops it. */
export function watchForStalls(
  store: PlayerStore,
  timeoutMs: number,
  onStall: () => void,
): () => void {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let lastTime = -1;
  let wasPlaying = false;

  function check() {
    const { status, currentTime, playbackRate } = store.getState();
    // A video at speed 0 stands still on purpose.
    const isPlaying = status === "playing" && playbackRate > 0;

    if (!isPlaying) {
      clearTimeout(timerId);
      wasPlaying = false;
      return;
    }
    // The timer starts again only when the time moves. Other changes of the
    // state, for example new downloaded data, must not hide a stall.
    if (!wasPlaying || currentTime !== lastTime) {
      wasPlaying = true;
      lastTime = currentTime;
      clearTimeout(timerId);
      timerId = setTimeout(onStall, timeoutMs);
    }
  }

  const unsubscribe = store.subscribe(check);
  check();
  return () => {
    unsubscribe();
    clearTimeout(timerId);
  };
}
