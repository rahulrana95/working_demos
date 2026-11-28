/*
 * NOT PART OF THE INTERVIEW: production version.
 * Gives the time, and gives it again every `intervalMs`. A text like
 * "Updated 2 minutes ago" must change while nothing else on the page does.
 */
import { useEffect, useState } from "react";

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timerId = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timerId);
  }, [intervalMs]);

  return now;
}
