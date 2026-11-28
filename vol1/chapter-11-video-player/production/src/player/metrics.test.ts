/*
 * NOT PART OF THE INTERVIEW.
 * The playback quality events, tested with a clock that the test moves by hand.
 */
import type { EngineEvent, StreamingEngine } from "./engine";
import { HEARTBEAT_MS, createMetrics } from "./metrics";
import type { PlayerMetricEvent } from "./metrics";
import { createPlayerStore } from "./store";

const LEVELS = [
  { height: 360, kbps: 800 },
  { height: 720, kbps: 2800 },
];

/** The last item of a list. */
function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

function setup() {
  let clock = 0;
  const store = createPlayerStore();
  const events: PlayerMetricEvent[] = [];
  let tellEngineListener: (event: EngineEvent) => void = () => undefined;
  const engine: StreamingEngine = {
    loadSource: () => undefined,
    levels: () => LEVELS,
    setLevel: () => undefined,
    subscribe(listener) {
      tellEngineListener = listener;
      return () => {
        tellEngineListener = () => undefined;
      };
    },
    unload: () => undefined,
  };
  const metrics = createMetrics(
    store,
    engine,
    (event) => events.push(event),
    () => clock,
  );

  return {
    store,
    events,
    metrics,
    engineSays: (event: EngineEvent) => tellEngineListener(event),
    /** Moves the hand-made clock and the timers together. */
    pass(ms: number) {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    ofType: <T extends PlayerMetricEvent["type"]>(type: T) =>
      events.filter(
        (event): event is Extract<PlayerMetricEvent, { type: T }> => event.type === type,
      ),
    /** Loads a video and plays it. The first frame comes 800 ms after the load. */
    startPlaying(this: { pass: (ms: number) => void }) {
      store.dispatch({ type: "load" });
      metrics.loadStarted();
      this.pass(800);
      store.dispatch({ type: "loadedmetadata", duration: 300 });
      store.dispatch({ type: "canplay" });
      store.dispatch({ type: "playing" });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("metrics: the first frame", () => {
  it("reports the time from the start of the load to the first moving picture", () => {
    const test = setup();

    test.startPlaying();

    expect(test.events).toEqual([{ type: "first_frame", ms: 800 }]);
  });

  it("reports it once, not again after a pause or a rebuffer", () => {
    const test = setup();
    test.startPlaying();

    test.store.dispatch({ type: "pause" });
    test.store.dispatch({ type: "playing" });
    test.store.dispatch({ type: "waiting" });
    test.store.dispatch({ type: "playing" });

    expect(test.ofType("first_frame")).toHaveLength(1);
  });

  it("includes the time the user waited before pressing Play only from the load, not before", () => {
    const test = setup();
    test.pass(60_000);

    test.startPlaying();

    expect(test.ofType("first_frame")).toEqual([{ type: "first_frame", ms: 800 }]);
  });

  it("measures the first frame again after the user pressed Try again", () => {
    const test = setup();
    test.startPlaying();
    test.store.dispatch({ type: "error", kind: "decode" });

    test.store.dispatch({ type: "retry" });
    test.metrics.loadStarted();
    test.pass(1200);
    test.store.dispatch({ type: "canplay" });
    test.store.dispatch({ type: "playing" });

    expect(test.ofType("first_frame").map((event) => event.ms)).toEqual([800, 1200]);
  });
});

describe("metrics: rebuffering", () => {
  it("counts a stop after the start, and reports how long it took", () => {
    const test = setup();
    test.startPlaying();
    test.pass(5000);

    test.store.dispatch({ type: "waiting" });
    test.pass(1500);
    test.store.dispatch({ type: "playing" });

    expect(test.ofType("rebuffer_start")).toEqual([
      { type: "rebuffer_start", count: 1, afterSeek: false },
    ]);
    expect(test.ofType("rebuffer_end")).toEqual([
      { type: "rebuffer_end", ms: 1500, totalMs: 1500 },
    ]);
  });

  it("adds up the count and the total time over several stops", () => {
    const test = setup();
    test.startPlaying();

    for (const ms of [1000, 2000, 500]) {
      test.store.dispatch({ type: "waiting" });
      test.pass(ms);
      test.store.dispatch({ type: "playing" });
      test.pass(3000);
    }

    expect(test.ofType("rebuffer_start").map((event) => event.count)).toEqual([1, 2, 3]);
    expect(last(test.ofType("rebuffer_end"))).toEqual({
      type: "rebuffer_end",
      ms: 500,
      totalMs: 3500,
    });
  });

  it("does not count the wait before the first frame as a rebuffer", () => {
    const test = setup();
    test.store.dispatch({ type: "load" });
    test.metrics.loadStarted();
    test.store.dispatch({ type: "canplay" });
    test.store.dispatch({ type: "play" });
    test.pass(900);
    test.store.dispatch({ type: "playing" });

    expect(test.ofType("rebuffer_start")).toEqual([]);
    expect(test.ofType("rebuffer_end")).toEqual([]);
  });

  it("marks a stop right after a seek, so it can be told apart from a network problem", () => {
    const test = setup();
    test.startPlaying();

    test.metrics.seeked();
    test.pass(100);
    test.store.dispatch({ type: "waiting" });

    expect(test.ofType("rebuffer_start")).toEqual([
      { type: "rebuffer_start", count: 1, afterSeek: true },
    ]);
  });

  it("does not mark a stop that comes long after a seek", () => {
    const test = setup();
    test.startPlaying();

    test.metrics.seeked();
    test.pass(5000);
    test.store.dispatch({ type: "waiting" });

    expect(test.ofType("rebuffer_start")[0].afterSeek).toBe(false);
  });

  it("counts the time of a stop that ends in a pause, without a rebuffer_end", () => {
    const test = setup();
    test.startPlaying();
    test.store.dispatch({ type: "waiting" });
    test.pass(2000);

    test.store.dispatch({ type: "pause" });
    test.pass(60_000);
    test.metrics.stop();

    expect(test.ofType("rebuffer_end")).toEqual([]);
    expect(last(test.ofType("heartbeat"))).toMatchObject({ rebufferCount: 1, rebufferMs: 2000 });
  });
});

describe("metrics: watch time in a heartbeat", () => {
  it("sends a heartbeat every 10 seconds while the video plays", () => {
    const test = setup();
    test.startPlaying();

    // One second at a time, so the hand-made clock and the timers stay together.
    for (let second = 0; second < 30; second++) {
      test.pass(1000);
    }

    expect(test.ofType("heartbeat").map((event) => event.watchedMs)).toEqual([
      10_000, 20_000, 30_000,
    ]);
  });

  it("sends no heartbeat while the video is paused, and does not count that time", () => {
    const test = setup();
    test.startPlaying();
    test.pass(4000);
    test.store.dispatch({ type: "pause" });

    test.pass(10 * HEARTBEAT_MS);
    expect(test.ofType("heartbeat")).toEqual([]);

    test.store.dispatch({ type: "playing" });
    test.pass(HEARTBEAT_MS);
    expect(last(test.ofType("heartbeat"))?.watchedMs).toBeLessThanOrEqual(14_000);
  });

  it("does not count buffering as watching", () => {
    const test = setup();
    test.startPlaying();
    test.pass(2000);
    test.store.dispatch({ type: "waiting" });
    test.pass(3000);
    test.store.dispatch({ type: "playing" });
    test.pass(1000);

    test.metrics.stop();

    expect(last(test.ofType("heartbeat"))).toEqual({
      type: "heartbeat",
      watchedMs: 3000,
      rebufferCount: 1,
      rebufferMs: 3000,
    });
  });

  it("sends the last numbers when the player is removed in the middle of the video", () => {
    const test = setup();
    test.startPlaying();
    test.pass(4321);

    test.metrics.stop();

    expect(test.ofType("heartbeat")).toEqual([
      { type: "heartbeat", watchedMs: 4321, rebufferCount: 0, rebufferMs: 0 },
    ]);
  });

  it("sends ended and one last heartbeat at the end, and no second one on removal", () => {
    const test = setup();
    test.startPlaying();
    test.pass(5000);

    test.store.dispatch({ type: "ended" });
    test.metrics.stop();

    expect(test.events.slice(-2)).toEqual([
      { type: "ended" },
      { type: "heartbeat", watchedMs: 5000, rebufferCount: 0, rebufferMs: 0 },
    ]);
  });

  it("sends nothing on removal when the video never started", () => {
    const test = setup();
    test.store.dispatch({ type: "load" });
    test.metrics.loadStarted();

    test.metrics.stop();

    expect(test.events).toEqual([]);
  });

  it("stops its timer when it is stopped", () => {
    const test = setup();
    test.startPlaying();

    test.metrics.stop();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("metrics: errors and quality", () => {
  it("reports each try after a network error with its number", () => {
    const test = setup();
    test.startPlaying();

    test.store.dispatch({ type: "error", kind: "network" });
    test.store.dispatch({ type: "error", kind: "network" });

    expect(test.ofType("error")).toEqual([
      { type: "error", kind: "network", retry: 1 },
      { type: "error", kind: "network", retry: 2 },
    ]);
  });

  it("reports the error that the user sees with retry 0", () => {
    const test = setup();
    test.startPlaying();

    test.store.dispatch({ type: "error", kind: "decode" });

    expect(test.ofType("error")).toEqual([{ type: "error", kind: "decode", retry: 0 }]);
  });

  it("reports a network error that is shown after the last try", () => {
    const test = setup();
    test.startPlaying();

    for (let attempt = 0; attempt < 4; attempt++) {
      test.store.dispatch({ type: "error", kind: "network" });
    }

    expect(test.ofType("error").map((event) => event.retry)).toEqual([1, 2, 3, 0]);
  });

  it("reports a quality switch with the two heights and who decided", () => {
    const test = setup();

    test.engineSays({ type: "level_switched", index: 0, auto: true });
    test.engineSays({ type: "level_switched", index: 1, auto: false });

    expect(test.ofType("quality_switch")).toEqual([
      { type: "quality_switch", fromHeight: null, toHeight: 360, auto: true },
      { type: "quality_switch", fromHeight: 360, toHeight: 720, auto: false },
    ]);
  });

  it("does not report the same level twice, or a level that does not exist", () => {
    const test = setup();

    test.engineSays({ type: "level_switched", index: 1, auto: true });
    test.engineSays({ type: "level_switched", index: 1, auto: true });
    test.engineSays({ type: "level_switched", index: 7, auto: true });

    expect(test.ofType("quality_switch")).toHaveLength(1);
  });

  it("passes on what the controller tells it: a blocked autoplay and a detected stall", () => {
    const test = setup();

    test.metrics.autoplayBlocked();
    test.metrics.stallDetected();

    expect(test.events).toEqual([{ type: "autoplay_blocked" }, { type: "stall_detected" }]);
  });

  it("stops listening to the engine and the store when it is stopped", () => {
    const test = setup();
    test.metrics.stop();

    test.engineSays({ type: "level_switched", index: 1, auto: true });
    test.store.dispatch({ type: "load" });
    test.store.dispatch({ type: "playing" });

    expect(test.events).toEqual([]);
  });
});
