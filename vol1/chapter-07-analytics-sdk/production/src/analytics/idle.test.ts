/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove that work waits for an idle moment, with and without
 * `requestIdleCallback`.
 */
import { IDLE_TIMEOUT_MS, whenIdle } from "./idle";

type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

function stubRequestIdleCallback() {
  const callbacks: IdleCallback[] = [];
  const request = vi.fn((callback: IdleCallback) => callbacks.push(callback));
  const cancel = vi.fn();
  vi.stubGlobal("requestIdleCallback", request);
  vi.stubGlobal("cancelIdleCallback", cancel);
  return { callbacks, request, cancel };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("whenIdle with requestIdleCallback", () => {
  it("does not run the work at once, and gives the browser a time limit", () => {
    const idle = stubRequestIdleCallback();
    const work = vi.fn();

    whenIdle(work);

    expect(work).not.toHaveBeenCalled();
    expect(idle.request).toHaveBeenCalledWith(expect.any(Function), { timeout: IDLE_TIMEOUT_MS });
  });

  it("tells the work when the idle time is used up", () => {
    const idle = stubRequestIdleCallback();
    const answers: boolean[] = [];
    let remaining = 5;
    whenIdle((hasTime) => {
      answers.push(hasTime());
      remaining = 0;
      answers.push(hasTime());
    });

    idle.callbacks[0]({ didTimeout: false, timeRemaining: () => remaining });

    expect(answers).toEqual([true, false]);
  });

  it("lets the work finish when the browser was busy until the time limit", () => {
    const idle = stubRequestIdleCallback();
    let answer = false;
    whenIdle((hasTime) => {
      answer = hasTime();
    });

    idle.callbacks[0]({ didTimeout: true, timeRemaining: () => 0 });

    expect(answer).toBe(true);
  });

  it("can be cancelled", () => {
    const idle = stubRequestIdleCallback();
    idle.request.mockReturnValue(7);

    whenIdle(vi.fn())();

    expect(idle.cancel).toHaveBeenCalledWith(7);
  });
});

describe("whenIdle without requestIdleCallback, as in Safari", () => {
  it("runs the work in a later task, not at once", () => {
    const work = vi.fn();

    whenIdle(work);
    expect(work).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("gives the work 8 milliseconds", () => {
    const answers: boolean[] = [];
    whenIdle((hasTime) => {
      answers.push(hasTime());
      vi.setSystemTime(Date.now() + 7);
      answers.push(hasTime());
      vi.setSystemTime(Date.now() + 1);
      answers.push(hasTime());
    });

    vi.advanceTimersByTime(0);

    expect(answers).toEqual([true, true, false]);
  });

  it("can be cancelled", () => {
    const work = vi.fn();

    whenIdle(work)();
    vi.advanceTimersByTime(1000);

    expect(work).not.toHaveBeenCalled();
  });
});
