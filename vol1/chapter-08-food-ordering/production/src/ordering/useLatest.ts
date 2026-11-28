/*
 * NOT PART OF THE INTERVIEW: production version.
 * The parent may pass a new function on every render. This keeps the latest
 * one in a ref, so a new function does not restart a request or a timer.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  // A ref is written in an effect, never during render.
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
