/* NOT PART OF THE INTERVIEW. */
import { watchForStalls } from "./stallDetector";
import { createPlayerStore } from "./store";
import type { PlayerStore } from "./store";

const TIMEOUT_MS = 5000;

/** A store that is playing at second 0. */
function playingStore(): PlayerStore {
  const store = createPlayerStore();
  store.dispatch({ type: "load" });
  store.dispatch({ type: "loadedmetadata", duration: 300 });
  store.dispatch({ type: "playing" });
  return store;
}

/** Lets the video play: one "timeupdate" every 250 ms. */
function playFor(store: PlayerStore, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 250) {
    vi.advanceTimersByTime(250);
    store.dispatch({ type: "timeupdate", currentTime: store.getState().currentTime + 0.25 });
  }
}

describe("watchForStalls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says nothing while the time moves", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);

    playFor(store, 60_000);

    expect(onStall).not.toHaveBeenCalled();
  });

  it("reports a stall when the time stands still for the whole timeout while playing", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);
    playFor(store, 2000);

    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(onStall).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("reports a video that is playing from the start but never moves", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);

    vi.advanceTimersByTime(TIMEOUT_MS);

    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("is not fooled by other news from the element while the time stands still", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);

    // Data keeps arriving, and the same time is reported again and again.
    for (let second = 1; second <= 5; second++) {
      vi.advanceTimersByTime(1000);
      store.dispatch({ type: "progress", buffered: [[0, second * 4]] });
      store.dispatch({ type: "timeupdate", currentTime: 0 });
    }

    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("does not report a paused video", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);

    store.dispatch({ type: "pause" });
    vi.advanceTimersByTime(60_000);

    expect(onStall).not.toHaveBeenCalled();
  });

  it("does not report a video that buffers: the element has already said so", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);

    store.dispatch({ type: "waiting" });
    vi.advanceTimersByTime(60_000);

    expect(onStall).not.toHaveBeenCalled();
  });

  it("does not report a video that stands still on purpose, at speed 0", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);

    store.dispatch({ type: "ratechange", playbackRate: 0 });
    vi.advanceTimersByTime(60_000);

    expect(onStall).not.toHaveBeenCalled();
  });

  it("starts watching again when the video plays again after a pause", () => {
    const store = playingStore();
    const onStall = vi.fn();
    watchForStalls(store, TIMEOUT_MS, onStall);
    store.dispatch({ type: "pause" });
    vi.advanceTimersByTime(60_000);

    store.dispatch({ type: "playing" });
    vi.advanceTimersByTime(TIMEOUT_MS);

    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("stops watching and leaves no timer when it is stopped", () => {
    const store = playingStore();
    const onStall = vi.fn();
    const stop = watchForStalls(store, TIMEOUT_MS, onStall);

    stop();
    vi.advanceTimersByTime(60_000);

    expect(onStall).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
