/*
 * NOT PART OF THE INTERVIEW: production version.
 * Runs a request with a time limit. A request that never answers becomes a
 * failure the user can see and retry.
 */

export class TimeoutError extends Error {
  constructor() {
    super("The request took too long");
    this.name = "TimeoutError";
  }
}

/**
 * Calls `run` with a signal that is aborted when `parent` is aborted or when
 * the time is over. After the time limit the promise rejects with a
 * TimeoutError, also when `run` does not stop on abort.
 */
export function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent: AbortSignal,
): Promise<T> {
  const request = new AbortController();
  const abort = () => request.abort();
  parent.addEventListener("abort", abort);

  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => {
      request.abort();
      reject(new TimeoutError());
    }, timeoutMs);

    run(request.signal)
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timerId);
        parent.removeEventListener("abort", abort);
      });
  });
}
