/* NOT PART OF THE INTERVIEW: production version. */
import { TimeoutError, withTimeout } from "./timeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the answer of a request that is fast enough", async () => {
    await expect(withTimeout(async () => "answer", 1000)).resolves.toBe("answer");
  });

  it("rejects with the error of the request", async () => {
    const failing = () => Promise.reject(new Error("500"));

    await expect(withTimeout(failing, 1000)).rejects.toThrow("500");
  });

  it("rejects with a TimeoutError when the time runs out, and aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const never = (requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<string>(() => {});
    };
    const result = withTimeout(never, 1000);
    const outcome = expect(result).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await outcome;
    expect(signal?.aborted).toBe(true);
  });

  it("does not wait for a request that ignores the signal", async () => {
    const ignoresSignal = () => new Promise<string>(() => {});
    const outcome = expect(withTimeout(ignoresSignal, 500)).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(500);

    await outcome;
  });

  it("aborts the request when the outer signal is aborted", async () => {
    const outer = new AbortController();
    let signal: AbortSignal | undefined;
    void withTimeout(
      (requestSignal) => {
        signal = requestSignal;
        return new Promise<string>(() => {});
      },
      1000,
      outer.signal,
    ).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);

    outer.abort();

    expect(signal?.aborted).toBe(true);
  });

  it("rejects at once when the outer signal is aborted, without waiting for the request", async () => {
    const outer = new AbortController();
    const result = withTimeout(() => new Promise<string>(() => {}), 1000, outer.signal);
    const outcome = expect(result).rejects.toMatchObject({ name: "AbortError" });

    outer.abort();

    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the request with an aborted signal when the outer signal was aborted before", async () => {
    const outer = new AbortController();
    outer.abort();
    let wasAborted: boolean | undefined;
    const result = withTimeout(
      async (signal) => {
        wasAborted = signal.aborted;
      },
      1000,
      outer.signal,
    );

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(wasAborted).toBe(true);
  });

  it("leaves no timer behind after the request has answered", async () => {
    await withTimeout(async () => "answer", 1000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("turns a request function that throws at once into a rejected promise", async () => {
    const throwing = () => {
      throw new Error("bad");
    };

    await expect(withTimeout(throwing, 1000)).rejects.toThrow("bad");
  });
});
