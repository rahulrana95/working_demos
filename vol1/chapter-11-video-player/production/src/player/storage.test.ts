/* NOT PART OF THE INTERVIEW. */
import {
  DEFAULT_SETTINGS,
  loadPosition,
  loadSettings,
  rememberPosition,
  savePosition,
  saveSettings,
} from "./storage";
import { createPlayerStore } from "./store";

const SETTINGS_KEY = "video-player:settings";
const POSITION_KEY = "video-player:position:film-1";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings", () => {
  it("gives the defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("reads back what was saved", () => {
    const settings = { volume: 0.4, muted: true, captionsOn: true, captionScale: 1.5 };

    saveSettings(settings);

    expect(loadSettings()).toEqual(settings);
  });

  it("uses the default for each field that is missing or has a wrong type", () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ volume: "loud", muted: true, captionScale: 99 }),
    );

    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, muted: true });
  });

  it.each(["not json {", "null", "42", '"text"', "[]"])(
    "gives the defaults when the stored text is %s",
    (text) => {
      window.localStorage.setItem(SETTINGS_KEY, text);

      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    },
  );

  it("gives the defaults when reading the storage throws, as in some private modes", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("does not throw when the storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe("the place in a video", () => {
  it("is 0 when nothing is stored", () => {
    expect(loadPosition("film-1")).toBe(0);
  });

  it("is saved in whole seconds, for each video on its own", () => {
    savePosition("film-1", 95.7, 600);
    savePosition("film-2", 200, 600);

    expect(loadPosition("film-1")).toBe(95);
    expect(loadPosition("film-2")).toBe(200);
  });

  it("is not kept in the first 10 seconds: the user has hardly started", () => {
    savePosition("film-1", 95, 600);
    savePosition("film-1", 9.9, 600);

    expect(loadPosition("film-1")).toBe(0);
    expect(window.localStorage.getItem(POSITION_KEY)).toBeNull();
  });

  it("is not kept in the last 10 seconds: the user has finished", () => {
    savePosition("film-1", 95, 600);
    savePosition("film-1", 591, 600);

    expect(loadPosition("film-1")).toBe(0);
  });

  it("is 0 when the stored value is not a sensible number", () => {
    for (const text of ['"12"', "-5", "null", "{}", "broken"]) {
      window.localStorage.setItem(POSITION_KEY, text);

      expect(loadPosition("film-1")).toBe(0);
    }
  });
});

describe("rememberPosition", () => {
  // Each test stops what it started, so no listener of one test hears the next.
  const stops: (() => void)[] = [];
  function remember(store: ReturnType<typeof createPlayerStore>, videoId: string) {
    const stop = rememberPosition(store, videoId);
    stops.push(stop);
    return stop;
  }

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  function playingStore() {
    const store = createPlayerStore();
    store.dispatch({ type: "load" });
    store.dispatch({ type: "loadedmetadata", duration: 600 });
    store.dispatch({ type: "canplay" });
    store.dispatch({ type: "playing" });
    return store;
  }

  it("saves once in 5 seconds of video while it plays, not on every time update", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const store = playingStore();
    remember(store, "film-1");

    for (let time = 20; time < 40; time += 0.25) {
      store.dispatch({ type: "timeupdate", currentTime: time });
    }

    // Seconds 20, 25, 30 and 35.
    expect(setItem).toHaveBeenCalledTimes(4);
    expect(loadPosition("film-1")).toBe(35);
  });

  it("saves at once when the user pauses", () => {
    const store = playingStore();
    remember(store, "film-1");
    store.dispatch({ type: "timeupdate", currentTime: 20 });
    store.dispatch({ type: "timeupdate", currentTime: 23 });

    store.dispatch({ type: "pause" });

    expect(loadPosition("film-1")).toBe(23);
  });

  it("saves when the page is closed", () => {
    const store = playingStore();
    remember(store, "film-1");
    store.dispatch({ type: "timeupdate", currentTime: 20 });
    store.dispatch({ type: "timeupdate", currentTime: 24 });

    window.dispatchEvent(new Event("pagehide"));

    expect(loadPosition("film-1")).toBe(24);
  });

  it("saves one last time when it is stopped, and then no more", () => {
    const store = playingStore();
    const stop = remember(store, "film-1");
    store.dispatch({ type: "timeupdate", currentTime: 20 });
    store.dispatch({ type: "timeupdate", currentTime: 22 });

    stop();
    expect(loadPosition("film-1")).toBe(22);

    store.dispatch({ type: "timeupdate", currentTime: 100 });
    window.dispatchEvent(new Event("pagehide"));
    expect(loadPosition("film-1")).toBe(22);
  });

  it("forgets the place when the video has ended", () => {
    const store = playingStore();
    remember(store, "film-1");
    store.dispatch({ type: "timeupdate", currentTime: 300 });

    store.dispatch({ type: "ended" });

    expect(loadPosition("film-1")).toBe(0);
  });

  it("keeps the saved place while the video loads again or shows an error", () => {
    const store = playingStore();
    remember(store, "film-1");
    store.dispatch({ type: "timeupdate", currentTime: 120 });

    store.dispatch({ type: "error", kind: "decode" });
    expect(loadPosition("film-1")).toBe(120);

    store.dispatch({ type: "retry" });
    store.dispatch({ type: "timeupdate", currentTime: 0 });
    expect(loadPosition("film-1")).toBe(120);
  });

  it("does not forget the place when a new load starts from zero", () => {
    savePosition("film-1", 120, 600);
    const store = createPlayerStore();
    remember(store, "film-1");

    store.dispatch({ type: "load" });
    store.dispatch({ type: "loadedmetadata", duration: 600 });

    expect(loadPosition("film-1")).toBe(120);
  });
});
