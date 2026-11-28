/*
 * NOT PART OF THE INTERVIEW.
 * Debug help for the demo and for the speed test: each field can show how
 * many times it was drawn.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";

let isOn = false;
const listeners = new Set<() => void>();

/** Turns the counters of every form on the page on or off. */
export function showRenderCounts(show: boolean): void {
  isOn = show;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Counts how many times the field around it was drawn. It counts in an
 * effect, after React has drawn, and writes the number into the page by hand.
 * A state update here would draw the field one more time, for ever.
 */
export function RenderCount() {
  const countRef = useRef(0);
  const outputRef = useRef<HTMLSpanElement>(null);

  // No list of dependencies: the effect runs after every draw of the field.
  // It also counts while the number is hidden, so the number is right when it appears.
  useEffect(() => {
    countRef.current += 1;
    if (outputRef.current !== null) {
      outputRef.current.textContent = String(countRef.current);
    }
  });

  return <RenderCountOutput countRef={countRef} outputRef={outputRef} />;
}

interface RenderCountOutputProps {
  countRef: RefObject<number>;
  outputRef: RefObject<HTMLSpanElement>;
}

/**
 * The visible part. It is its own component, so that turning the counters on
 * draws only this part again, and is not counted as a draw of the field.
 */
function RenderCountOutput({ countRef, outputRef }: RenderCountOutputProps) {
  const isShown = useSyncExternalStore(subscribe, () => isOn);

  // When the counters are turned on later, show what was counted so far.
  useEffect(() => {
    if (isShown && outputRef.current !== null) {
      outputRef.current.textContent = String(countRef.current);
    }
  }, [isShown, countRef, outputRef]);

  if (!isShown) {
    return null;
  }
  return (
    <p className="field__renders">
      Drawn <span ref={outputRef}>0</span> times
    </p>
  );
}
