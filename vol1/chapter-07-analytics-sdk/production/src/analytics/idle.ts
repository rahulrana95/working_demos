/* NOT PART OF THE INTERVIEW: production version. */

/** How long the work may wait for an idle moment before it runs anyway. */
export const IDLE_TIMEOUT_MS = 1000;
/** Without `requestIdleCallback`, one run of the work may take this long. */
const FALLBACK_BUDGET_MS = 8;

/**
 * Runs `work` when the browser has nothing more urgent to do, so that the
 * SDK never makes a click or a key press of the host page slower.
 *
 * `work` gets a function that says whether there is still time. It must
 * stop when the answer is false, and ask to be called again.
 *
 * `requestIdleCallback` does not exist in every browser (Safari has not
 * shipped it), so a short timer is the fallback. Returns a function that
 * cancels the call.
 */
export function whenIdle(work: (hasTime: () => boolean) => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(
      // After the timeout the browser calls us even when it is busy. Then we finish the work.
      (deadline) => work(() => deadline.didTimeout || deadline.timeRemaining() > 0),
      { timeout: IDLE_TIMEOUT_MS },
    );
    return () => cancelIdleCallback(id);
  }

  const id = setTimeout(() => {
    const start = Date.now();
    work(() => Date.now() - start < FALLBACK_BUDGET_MS);
  }, 0);
  return () => clearTimeout(id);
}
