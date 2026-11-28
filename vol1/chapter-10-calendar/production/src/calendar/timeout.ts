/*
 * NOT PART OF THE INTERVIEW: production version.
 * A request that never answers must still end. This gives any request a
 * time limit, also when the function that makes it ignores the AbortSignal.
 */

export class TimeoutError extends Error {
  constructor() {
    super("The request took too long.");
    this.name = "TimeoutError";
  }
}

/**
 * Runs `request` with a signal that is aborted after `timeoutMs`, or when
 * `outerSignal` is aborted. If the time runs out, the promise rejects with a
 * TimeoutError at once: it does not wait for the request to notice.
 */
export function withTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => {
      cleanUp();
      reject(new TimeoutError());
      controller.abort();
    }, timeoutMs);
    // The caller no longer wants the answer. We do not wait for the request to notice.
    const abort = () => {
      cleanUp();
      reject(new DOMException("The request was aborted.", "AbortError"));
      controller.abort();
    };
    const cleanUp = () => {
      clearTimeout(timerId);
      outerSignal?.removeEventListener("abort", abort);
    };
    if (outerSignal?.aborted) {
      abort();
    } else {
      outerSignal?.addEventListener("abort", abort, { once: true });
    }

    // The request starts now, not a moment later. A request function that
    // throws before it returns a promise becomes a rejected promise.
    let answer: Promise<T>;
    try {
      answer = request(controller.signal);
    } catch (error) {
      answer = Promise.reject(error);
    }
    answer.then(
      (value) => {
        cleanUp();
        resolve(value);
      },
      (error: unknown) => {
        cleanUp();
        reject(error);
      },
    );
  });
}
