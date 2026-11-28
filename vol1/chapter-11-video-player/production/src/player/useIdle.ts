/*
 * NOT PART OF THE INTERVIEW: production version.
 * Says when the user has done nothing for a while, so the controls can hide.
 *
 * Why it holds at scale: a mouse sends "move" events many times a second.
 * Each one only starts a timer again. React state changes only when "idle"
 * flips, so moving the mouse over the player does not draw it again.
 */
import { useEffect, useRef, useState } from "react";

export const IDLE_AFTER_MS = 3000;

/**
 * `isEnabled` is false while the controls must stay, for example while the
 * video is paused. `wake` is called on every sign of life of the user.
 */
export function useIdle(isEnabled: boolean, delayMs = IDLE_AFTER_MS) {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function wake() {
    setIsIdle(false);
    clearTimeout(timerRef.current);
    if (isEnabled) {
      timerRef.current = setTimeout(() => setIsIdle(true), delayMs);
    }
  }

  useEffect(() => {
    // Enabled just now: the 3 seconds start. Disabled: show the controls and stop the timer.
    wake();
    return () => clearTimeout(timerRef.current);
    // `wake` is a new function on every render but does the same thing.
  }, [isEnabled, delayMs]);

  return { isIdle: isEnabled && isIdle, wake };
}
