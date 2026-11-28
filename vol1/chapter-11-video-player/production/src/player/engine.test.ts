/* NOT PART OF THE INTERVIEW. */
import { simulateMedia } from "../demo/simulatedMedia";
import { wait } from "../testUtils";
import { createNativeEngine, errorKindOfCode } from "./engine";
import type { EngineEvent } from "./engine";

describe("errorKindOfCode", () => {
  it.each([
    [2, "network"],
    [3, "decode"],
    [4, "unsupported"],
  ])("reads MediaError code %d as %s", (code, kind) => {
    expect(errorKindOfCode(code)).toBe(kind);
  });

  it("does not treat code 1, a load stopped by the user, as an error", () => {
    expect(errorKindOfCode(1)).toBeNull();
  });

  it("returns null when there is no code or an unknown one", () => {
    expect(errorKindOfCode(undefined)).toBeNull();
    expect(errorKindOfCode(99)).toBeNull();
  });
});

describe("createNativeEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const video = document.createElement("video");
    const media = simulateMedia(video, { loadMs: 100 });
    const engine = createNativeEngine();
    const events: EngineEvent[] = [];
    engine.subscribe((event) => events.push(event));
    return { video, media, engine, events };
  }

  it("gives the source to the video element", () => {
    const { video, engine } = setup();

    engine.loadSource(video, "film.mp4");

    expect(video.src).toBe("film.mp4");
  });

  it("has no quality levels, and ignores a request for one", () => {
    const { engine } = setup();

    expect(engine.levels()).toEqual([]);
    expect(() => engine.setLevel(2)).not.toThrow();
  });

  it("reports an error of the element with its kind", async () => {
    const { video, media, engine, events } = setup();
    engine.loadSource(video, "film.mp4");
    await wait(100);

    media.failNow(2);
    await wait(0);

    expect(events).toEqual([{ type: "error", kind: "network" }]);
  });

  it("starts the load again when the same source is given again", async () => {
    const { video, engine } = setup();
    const onLoadStart = vi.fn();
    video.addEventListener("loadstart", onLoadStart);

    engine.loadSource(video, "film.mp4");
    engine.loadSource(video, "film.mp4");
    await wait(0);

    expect(onLoadStart).toHaveBeenCalledTimes(2);
  });

  it("stops the download and the listening on unload", async () => {
    const { video, media, engine, events } = setup();
    engine.loadSource(video, "film.mp4");
    await wait(100);

    engine.unload();
    media.failNow(2);
    await wait(0);

    expect(video.src).toBe("");
    expect(events).toEqual([]);
  });

  it("does nothing on unload when nothing was loaded", () => {
    expect(() => createNativeEngine().unload()).not.toThrow();
  });

  it("stops telling a listener that has unsubscribed", async () => {
    const { video, media, engine } = setup();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    engine.loadSource(video, "film.mp4");
    await wait(100);

    unsubscribe();
    media.failNow(3);
    await wait(0);

    expect(listener).not.toHaveBeenCalled();
  });
});
