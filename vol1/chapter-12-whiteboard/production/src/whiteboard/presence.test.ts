/* NOT PART OF THE INTERVIEW. Tests for the throttle that limits presence messages. */
import { PRESENCE_INTERVAL_MS, createThrottle } from "./presence";

describe("createThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the first value at once", () => {
    const send = vi.fn();
    const throttle = createThrottle(send, 50);

    throttle.call("a");

    expect(send).toHaveBeenCalledWith("a");
  });

  it("sends only the last of the values that arrive during the wait, when the wait ends", () => {
    const send = vi.fn();
    const throttle = createThrottle(send, 50);

    throttle.call("a");
    throttle.call("b");
    throttle.call("c");
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);

    expect(send.mock.calls).toEqual([["a"], ["c"]]);
  });

  it("sends at most 21 messages for 1,000 pointer moves in one second", () => {
    const send = vi.fn();
    const throttle = createThrottle(send, PRESENCE_INTERVAL_MS);

    for (let move = 0; move < 1000; move++) {
      throttle.call(move);
      vi.advanceTimersByTime(1);
    }
    vi.advanceTimersByTime(PRESENCE_INTERVAL_MS);

    expect(PRESENCE_INTERVAL_MS).toBe(50);
    expect(send.mock.calls.length).toBeLessThanOrEqual(21);
    // The others always get the final position.
    expect(send).toHaveBeenLastCalledWith(999);
  });

  it("sends at once again after a quiet time", () => {
    const send = vi.fn();
    const throttle = createThrottle(send, 50);
    throttle.call("a");
    vi.advanceTimersByTime(500);

    throttle.call("b");

    expect(send.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("drops the waiting value and its timer on cancel", () => {
    const send = vi.fn();
    const throttle = createThrottle(send, 50);
    throttle.call("a");
    throttle.call("b");

    throttle.cancel();
    vi.advanceTimersByTime(500);

    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
