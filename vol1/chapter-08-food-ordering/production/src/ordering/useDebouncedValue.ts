/*
 * NOT PART OF THE INTERVIEW: production version.
 * Gives back the value after it stopped changing for a while. It is the
 * debounce of Chapter 4.
 */
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timerId = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timerId);
  }, [value, delayMs]);

  return settled;
}
