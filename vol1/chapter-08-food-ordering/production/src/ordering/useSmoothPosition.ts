/*
 * NOT PART OF THE INTERVIEW: production version.
 * The courier's position arrives every few seconds. Drawn as it arrives, the
 * marker jumps. This hook moves the marker from where it is now to the new
 * position, one small step for each frame the browser paints.
 *
 * Why it holds at scale:
 *   1. requestAnimationFrame runs only when the browser paints. A hidden tab
 *      paints nothing, so it uses no CPU and no battery.
 *   2. A new position while the marker moves starts from where the marker
 *      is, so the marker never jumps back.
 *   3. A user who asked for less motion gets the new position at once.
 */
import { useEffect, useRef, useState } from "react";
import { positionBetween } from "./geo";
import type { Position } from "./types";

export const MOVE_MS = 1000;

export function useSmoothPosition(target: Position | null, moveMs = MOVE_MS): Position | null {
  const [drawn, setDrawn] = useState(target);
  // Where the marker is now. It is written in a frame callback, never during render.
  const drawnRef = useRef(target);
  const lat = target?.lat;
  const lng = target?.lng;

  useEffect(() => {
    const from = drawnRef.current;
    const to = lat === undefined || lng === undefined ? null : { lat, lng };
    const wantsLessMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    function draw(position: Position | null): void {
      drawnRef.current = position;
      setDrawn(position);
    }

    // Nothing to move from, nothing to move to, or no motion wanted: no animation.
    if (from === null || to === null || wantsLessMotion) {
      draw(to);
      return;
    }

    const startedAt = performance.now();
    let frameId = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - startedAt) / moveMs);
      draw(positionBetween(from, to, progress));
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    });

    return () => cancelAnimationFrame(frameId);
    // The numbers are the dependencies, not the object: the parent makes a
    // new object for the same place on every update of the order.
  }, [lat, lng, moveMs]);

  return drawn;
}
