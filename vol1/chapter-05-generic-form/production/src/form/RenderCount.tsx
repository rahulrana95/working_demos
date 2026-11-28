/*
 * NOT PART OF THE INTERVIEW: production version.
 * Debug help for the demo and for the speed test.
 */
import { useEffect, useRef } from "react";

/**
 * Debug help: shows how many times the field around it was drawn. It counts
 * in an effect, after React has drawn, and writes the number into the page by
 * hand. A state update here would draw the field one more time, for ever.
 */
export function RenderCount() {
  const countRef = useRef(0);
  const outputRef = useRef<HTMLSpanElement>(null);

  // No list of dependencies: the effect runs after every draw.
  useEffect(() => {
    countRef.current += 1;
    if (outputRef.current !== null) {
      outputRef.current.textContent = String(countRef.current);
    }
  });

  return (
    <p className="field__renders">
      Drawn <span ref={outputRef}>0</span> times
    </p>
  );
}
