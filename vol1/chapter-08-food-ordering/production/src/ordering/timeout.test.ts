/* NOT PART OF THE INTERVIEW: production version. */
import { TimeoutError, withTimeout } from "./timeout";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("gives the answer when it comes in time", async () => {
    const result = withTimeout(() => Promise.resolve("ok"), 1000, new AbortController().signal);

    await expect(result).resolves.toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes on the failure of the request", async () => {
    const result = withTimeout(
      () => Promise.reject(new Error("500")),
      1000,
      new AbortController().signal,
    );

    await expect(result).rejects.toThrow("500");
  });

  it("rejects with a TimeoutError and aborts the request when the time is over", async () => {
    let signal: AbortSignal | undefined;
    const result = withTimeout(
      (requestSignal) => {
        signal = requestSignal;
        return new Promise(() => {});
      },
      1000,
      new AbortController().signal,
    );
    const outcome = expect(result).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await outcome;
    expect(signal?.aborted).toBe(true);
  });

  it("aborts the request when the caller aborts", () => {
    const caller = new AbortController();
    let signal: AbortSignal | undefined;
    void withTimeout(
      (requestSignal) => {
        signal = requestSignal;
        return new Promise(() => {});
      },
      1000,
      caller.signal,
    );

    caller.abort();

    expect(signal?.aborted).toBe(true);
  });
});
