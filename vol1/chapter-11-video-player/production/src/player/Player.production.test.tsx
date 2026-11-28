/*
 * NOT PART OF THE INTERVIEW.
 * Tests for what the production version adds to the 60-minute answer. The
 * tests of the 60-minute answer are in Player.test.tsx and also run here.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createFakeEngine } from "../demo/fakeEngine";
import { SimulatedStage } from "../demo/SimulatedStage";
import type { SimulatedMedia, SimulatedMediaOptions } from "../demo/simulatedMedia";
import { flush, wait } from "../testUtils";
import type { StreamingEngine } from "./engine";
import { DEFAULT_MESSAGES } from "./messages";
import type { PlayerMetricEvent } from "./metrics";
import { Player } from "./Player";
import type { PlayerProps } from "./Player";

const LOAD_MS = 400;
const TICK_MS = 250;
const SRC = "https://videos.example/secret-film.mp4";
const TITLE = "A private film";
const VIDEO_ID = "film-42";

const LEVELS = [
  { height: 240, kbps: 400 },
  { height: 480, kbps: 1400 },
  { height: 720, kbps: 2800 },
];

interface Setup {
  props?: Partial<PlayerProps>;
  options?: SimulatedMediaOptions;
  /** Runs before the player loads its source, as a browser setting would. */
  before?: (media: SimulatedMedia, video: HTMLVideoElement) => void;
}

function renderPlayer({ props, options, before }: Setup = {}) {
  let media: SimulatedMedia | undefined;
  let video: HTMLVideoElement | undefined;
  const events: PlayerMetricEvent[] = [];

  const view = (playerProps: Partial<PlayerProps> = {}) => (
    <SimulatedStage
      options={{ durationSeconds: 300, loadMs: LOAD_MS, tickMs: TICK_MS, ...options }}
      onMedia={(simulated, element) => {
        media = simulated;
        video = element;
        before?.(simulated, element);
      }}
    >
      <Player
        src={SRC}
        title={TITLE}
        onEvent={(event) => events.push(event)}
        {...props}
        {...playerProps}
      />
    </SimulatedStage>
  );
  const { rerender, unmount } = render(view());

  if (media === undefined || video === undefined) {
    throw new Error("The simulated video was not set up.");
  }

  const player = screen.getByRole("group", { name: TITLE });
  return {
    media,
    video,
    player,
    events,
    unmount,
    setProps: (playerProps: Partial<PlayerProps>) => rerender(view(playerProps)),
    status: () => player.dataset.status,
    isIdle: () => player.dataset.idle === "true",
    playButton: () => screen.getByRole("button", { name: /^(Play|Pause)$/ }),
    seekBar: () => screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement,
    ofType: <T extends PlayerMetricEvent["type"]>(type: T) =>
      events.filter(
        (event): event is Extract<PlayerMetricEvent, { type: T }> => event.type === type,
      ),
    async press(key: string, target: Element = player) {
      const wasNotStopped = fireEvent.keyDown(target, { key });
      await flush();
      return { defaultPrevented: !wasNotStopped };
    },
    async click(target: Element) {
      fireEvent.click(target);
      await flush();
    },
  };
}

/** Renders, waits for the load, presses Play and waits until the video moves. */
async function renderPlaying(setup: Setup = {}) {
  const view = renderPlayer(setup);
  await wait(LOAD_MS);
  await view.click(view.playButton());
  expect(view.status()).toBe("playing");
  return view;
}

function fakeEngine(getMedia: () => SimulatedMedia | null, speedKbps = 8000): StreamingEngine {
  return createFakeEngine({ levels: LEVELS, getSpeedKbps: () => speedKbps, getMedia });
}

/** Defines a property on an object for one test, and removes it afterwards. */
const restores: (() => void)[] = [];
function define(target: object, name: string, value: unknown) {
  const before = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
  restores.push(() => {
    if (before === undefined) {
      Reflect.deleteProperty(target, name);
    } else {
      Object.defineProperty(target, name, before);
    }
  });
}

beforeEach(() => {
  // `performance.now()` is faked too: the playback quality events measure time with it.
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
  });
  window.localStorage.clear();
  // No random part in the wait before a retry: 1, 2 and 4 seconds exactly.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // The last change is taken back first.
  restores
    .splice(0)
    .reverse()
    .forEach((restore) => restore());
});

describe("production: a network error is tried again by itself", () => {
  it("loads again after 1 second, and goes on at the same second, still playing", async () => {
    const { status, media, video, seekBar } = await renderPlaying();
    await wait(20_000);
    const onLoadStart = vi.fn();
    video.addEventListener("loadstart", onLoadStart);

    media.failNow(2);
    await flush();
    expect(status()).toBe("loading");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The connection was lost. Trying again (1 of 3)…",
    );
    // The bar does not jump to zero while we wait.
    expect(seekBar().value).toBe("20");

    await wait(999);
    expect(onLoadStart).not.toHaveBeenCalled();
    await wait(1);
    expect(onLoadStart).toHaveBeenCalledTimes(1);

    // The load, and one tick to download the first data at second 20.
    await wait(LOAD_MS + TICK_MS);
    expect(status()).toBe("playing");
    expect(video.currentTime).toBe(20);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("stays paused after the recovery when the user had paused", async () => {
    const { status, media, video, click, playButton } = await renderPlaying();
    await wait(20_000);
    await click(playButton());

    media.failNow(2);
    await wait(1000 + LOAD_MS);
    await wait(2000);

    expect(status()).toBe("ready");
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(20);
  });

  it("waits 1, 2 and 4 seconds, then shows the error with Try again", async () => {
    const { status, media, video } = await renderPlaying();
    await wait(20_000);
    const loadTimes: number[] = [];
    const startedAt = Date.now();
    video.addEventListener("loadstart", () => loadTimes.push(Date.now() - startedAt));

    media.setFailLoads(true, 2);
    media.failNow(2);
    await wait(60_000);

    // Each load fails 400 ms after it started, and the next wait starts then.
    expect(loadTimes).toEqual([
      1000,
      1000 + LOAD_MS + 2000,
      1000 + LOAD_MS + 2000 + LOAD_MS + 4000,
    ]);
    expect(status()).toBe("error");
    expect(screen.getByRole("alert")).toHaveTextContent(DEFAULT_MESSAGES.errorNetwork);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("goes on at the same second when the user presses Try again after the network is back", async () => {
    const { status, media, video, click } = await renderPlaying();
    await wait(20_000);
    media.setFailLoads(true, 2);
    media.failNow(2);
    await wait(60_000);
    media.setFailLoads(false);

    await click(screen.getByRole("button", { name: "Try again" }));
    await wait(LOAD_MS + TICK_MS);

    expect(status()).toBe("playing");
    expect(video.currentTime).toBe(20);
  });

  it("tries a failing first load again too, and plays when the user had asked to", async () => {
    const view = renderPlayer({
      props: { autoPlay: true },
      before: (media) => media.setFailLoads(true, 2),
    });
    await wait(LOAD_MS);
    expect(view.status()).toBe("loading");

    view.media.setFailLoads(false);
    await wait(1000 + LOAD_MS);

    expect(view.status()).toBe("playing");
  });

  it("gives a later network error its three tries again, once the video has played", async () => {
    const { status, media } = await renderPlaying();
    media.failNow(2);
    await wait(1000 + LOAD_MS);
    expect(status()).toBe("playing");

    media.failNow(2);
    await flush();

    expect(screen.getByRole("status")).toHaveTextContent("Trying again (1 of 3)…");
  });

  it("cancels the waiting retry when the player is removed", async () => {
    const { media, video, unmount } = await renderPlaying();
    const onLoadStart = vi.fn();
    video.addEventListener("loadstart", onLoadStart);
    media.failNow(2);
    await flush();

    unmount();
    await wait(60_000);

    expect(onLoadStart).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not try a decode error again by itself", async () => {
    const { status, media, video } = await renderPlaying();
    const onLoadStart = vi.fn();
    video.addEventListener("loadstart", onLoadStart);

    media.failNow(3);
    await wait(60_000);

    expect(status()).toBe("error");
    expect(onLoadStart).not.toHaveBeenCalled();
  });
});

describe("production: the stall detector", () => {
  it("shows buffering when the picture stands still for 5 seconds although the element plays", async () => {
    const { status, media, video, ofType } = await renderPlaying();
    await wait(2000);

    media.freezeFor(9000);
    await wait(4999);
    expect(status()).toBe("playing");

    await wait(1);
    expect(status()).toBe("buffering");
    // The element never said "waiting": it still claims to play.
    expect(video.paused).toBe(false);
    expect(ofType("stall_detected")).toHaveLength(1);
  });

  it("goes back to playing by itself when the picture moves again", async () => {
    const { status, media } = await renderPlaying();
    media.freezeFor(9000);
    await wait(5000);
    expect(status()).toBe("buffering");

    await wait(4000 + TICK_MS);

    expect(status()).toBe("playing");
  });

  it("uses the timeout that the caller gives", async () => {
    const { status, media } = await renderPlaying({ props: { stallTimeoutMs: 1000 } });

    media.freezeFor(9000);
    await wait(1000);

    expect(status()).toBe("buffering");
  });

  it("does not call a paused video stalled", async () => {
    const { status, click, playButton, ofType } = await renderPlaying();
    await click(playButton());

    await wait(60_000);

    expect(status()).toBe("paused");
    expect(ofType("stall_detected")).toEqual([]);
  });
});

describe("production: playback quality events", () => {
  it("reports the first frame, a rebuffer, heartbeats and the end of one viewing", async () => {
    const { media, ofType, events } = renderPlayer({
      props: { autoPlay: true },
      options: { durationSeconds: 25 },
    });
    await wait(LOAD_MS);
    expect(events).toEqual([{ type: "first_frame", ms: LOAD_MS }]);

    await wait(5000);
    media.stallFor(2000);
    await wait(2000);
    expect(ofType("rebuffer_start")).toEqual([
      { type: "rebuffer_start", count: 1, afterSeek: false },
    ]);
    expect(ofType("rebuffer_end")).toEqual([{ type: "rebuffer_end", ms: 2000, totalMs: 2000 }]);

    await wait(30_000);
    expect(ofType("ended")).toHaveLength(1);
    expect(ofType("heartbeat").map((event) => event.watchedMs)).toEqual([7600, 17_600, 25_000]);
    expect(ofType("heartbeat").every((event) => event.rebufferCount === 1)).toBe(true);
  });

  it("reports a blocked autoplay", async () => {
    const { ofType } = renderPlayer({
      props: { autoPlay: true },
      before: (media) => media.setBlockAutoplay(true),
    });

    await wait(LOAD_MS);

    expect(ofType("autoplay_blocked")).toHaveLength(1);
  });

  it("does not report a play that a pause interrupted as a blocked autoplay", async () => {
    const { ofType, playButton, media } = renderPlayer();
    await wait(LOAD_MS);
    media.stallFor(1000);

    fireEvent.click(playButton());
    fireEvent.click(playButton());
    await wait(2000);

    expect(ofType("autoplay_blocked")).toEqual([]);
  });

  it("reports errors by kind, with the number of the try", async () => {
    const { media, ofType } = await renderPlaying();
    media.setFailLoads(true, 2);

    media.failNow(2);
    await wait(60_000);

    expect(ofType("error")).toEqual([
      { type: "error", kind: "network", retry: 1 },
      { type: "error", kind: "network", retry: 2 },
      { type: "error", kind: "network", retry: 3 },
      { type: "error", kind: "network", retry: 0 },
    ]);
  });

  it("reports quality switches of the engine", async () => {
    let media: SimulatedMedia | null = null;
    const engine = fakeEngine(() => media);
    const view = renderPlayer({ props: { engine, autoPlay: true }, before: (m) => (media = m) });

    await wait(30_000);

    expect(view.ofType("quality_switch")).toEqual([
      { type: "quality_switch", fromHeight: null, toHeight: 240, auto: true },
      { type: "quality_switch", fromHeight: 240, toHeight: 480, auto: true },
      { type: "quality_switch", fromHeight: 480, toHeight: 720, auto: true },
    ]);
  });

  it("uses the newest onEvent function without loading the video again", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { video, setProps, media } = await renderPlaying({ props: { onEvent: first } });
    const onLoadStart = vi.fn();
    video.addEventListener("loadstart", onLoadStart);

    setProps({ onEvent: second });
    media.stallFor(500);
    await flush();

    expect(onLoadStart).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ type: "rebuffer_start", count: 1, afterSeek: false });
  });

  it("never puts the address, the title, the id or the captions of the video in an event", async () => {
    let media: SimulatedMedia | null = null;
    const engine = fakeEngine(() => media);
    const view = renderPlayer({
      props: { engine, autoPlay: true, videoId: VIDEO_ID, captionsSrc: "captions-secret.vtt" },
      options: { cues: [{ start: 1, end: 50, text: "A secret line" }], durationSeconds: 60 },
      before: (m) => (media = m),
    });

    // One long viewing with everything in it: captions, a seek, a stall, a
    // frozen picture, a network error with retries, a decode error, the end.
    await wait(LOAD_MS);
    await view.click(screen.getByRole("button", { name: "Captions" }));
    await wait(3000);
    fireEvent.change(view.seekBar(), { target: { value: "12" } });
    view.media.stallFor(1000);
    await wait(3000);
    view.media.freezeFor(7000);
    await wait(8000);
    view.media.failNow(2);
    await wait(3000);
    view.media.failNow(3);
    await wait(1000);
    await view.click(screen.getByRole("button", { name: "Try again" }));
    await wait(80_000);
    view.unmount();

    const types = new Set(view.events.map((event) => event.type));
    expect(types).toEqual(
      new Set([
        "first_frame",
        "rebuffer_start",
        "rebuffer_end",
        "stall_detected",
        "quality_switch",
        "error",
        "heartbeat",
        "ended",
      ]),
    );

    const allowedWords = new Set([...types, "network", "decode", "unsupported", "render"]);
    for (const event of view.events) {
      for (const value of Object.values(event)) {
        // A value is a number, a yes or no, nothing, or one of a few fixed words.
        const isSafe =
          typeof value === "number" ||
          typeof value === "boolean" ||
          value === null ||
          allowedWords.has(value);
        expect(isSafe, JSON.stringify(event)).toBe(true);
      }
    }

    const everything = JSON.stringify(view.events);
    for (const secret of [SRC, "secret", TITLE, "private", VIDEO_ID, "A secret line", "vtt"]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe("production: preload and data saving", () => {
  it("loads nothing with preload none, and shows a Play button", async () => {
    const { status, video, playButton } = renderPlayer({ props: { preload: "none" } });
    const onLoadStart = vi.fn();
    video.addEventListener("loadstart", onLoadStart);

    await wait(10_000);

    expect(status()).toBe("idle");
    expect(onLoadStart).not.toHaveBeenCalled();
    expect(video).toHaveAttribute("preload", "none");
    expect(playButton()).toBeEnabled();
  });

  it("loads and plays on the first press of Play with preload none", async () => {
    const { status, click, playButton, ofType } = renderPlayer({ props: { preload: "none" } });
    await wait(10_000);

    await click(playButton());
    expect(status()).toBe("loading");

    await wait(LOAD_MS);
    expect(status()).toBe("playing");
    // The first frame is measured from the press, not from the opening of the page.
    expect(ofType("first_frame")).toEqual([{ type: "first_frame", ms: LOAD_MS }]);
  });

  it("uses metadata by default, and passes auto on", async () => {
    const { video, setProps } = renderPlayer();
    expect(video).toHaveAttribute("preload", "metadata");

    setProps({ preload: "auto" });
    expect(video).toHaveAttribute("preload", "auto");
  });

  it("loads nothing and does not autoplay for a user who asked the browser to save data", async () => {
    define(navigator, "connection", { saveData: true });

    const { status, video } = renderPlayer({ props: { preload: "auto", autoPlay: true } });
    await wait(10_000);

    expect(status()).toBe("idle");
    expect(video).toHaveAttribute("preload", "none");
  });

  it("still autoplays with preload none when the user does not save data", async () => {
    const { status } = renderPlayer({ props: { preload: "none", autoPlay: true } });

    await wait(LOAD_MS);

    expect(status()).toBe("playing");
  });
});

describe("production: what the player remembers", () => {
  it("goes on where the user stopped, when the video has an id", async () => {
    const first = await renderPlaying({ props: { videoId: VIDEO_ID } });
    await wait(42_000);
    first.unmount();

    const second = renderPlayer({ props: { videoId: VIDEO_ID } });
    await wait(LOAD_MS);

    expect(second.video.currentTime).toBe(42);
    expect(second.seekBar().value).toBe("42");
    expect(second.status()).toBe("ready");
  });

  it("measures the first frame at the remembered place, and counts no rebuffer for getting there", async () => {
    window.localStorage.setItem(`video-player:position:${VIDEO_ID}`, "120");

    const { ofType, video } = renderPlayer({ props: { videoId: VIDEO_ID, autoPlay: true } });
    await wait(LOAD_MS + TICK_MS);

    expect(video.currentTime).toBe(120);
    expect(ofType("first_frame")).toEqual([{ type: "first_frame", ms: LOAD_MS + TICK_MS }]);
    expect(ofType("rebuffer_start")).toEqual([]);
  });

  it("remembers each video on its own", async () => {
    const first = await renderPlaying({ props: { videoId: "film-a" } });
    await wait(30_000);
    first.unmount();

    const second = renderPlayer({ props: { videoId: "film-b" } });
    await wait(LOAD_MS);

    expect(second.video.currentTime).toBe(0);
  });

  it("starts from the beginning after the video was watched to the end", async () => {
    const first = await renderPlaying({
      props: { videoId: VIDEO_ID },
      options: { durationSeconds: 30 },
    });
    await wait(31_000);
    expect(first.status()).toBe("ended");
    first.unmount();

    const second = renderPlayer({ props: { videoId: VIDEO_ID }, options: { durationSeconds: 30 } });
    await wait(LOAD_MS);

    expect(second.video.currentTime).toBe(0);
  });

  it("stores no place without an id", async () => {
    const { unmount } = await renderPlaying();
    await wait(42_000);

    unmount();

    expect(Object.keys(window.localStorage)).toEqual(["video-player:settings"]);
  });

  it("uses the place of the new video when the source and the id change", async () => {
    window.localStorage.setItem("video-player:position:film-b", "77");
    const { video, setProps } = await renderPlaying({ props: { videoId: "film-a" } });

    setProps({ src: "other.mp4", videoId: "film-b" });
    await wait(LOAD_MS);

    expect(video.currentTime).toBe(77);
  });

  it("remembers the volume, mute and captions for the next visit", async () => {
    const first = renderPlayer({ props: { captionsSrc: "captions.vtt" } });
    await wait(LOAD_MS);
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "30" } });
    await flush();
    await first.press("m");
    await first.click(screen.getByRole("button", { name: "Captions" }));
    first.unmount();

    const second = renderPlayer({ props: { captionsSrc: "captions.vtt" } });
    await wait(LOAD_MS);

    expect(second.video.volume).toBeCloseTo(0.3);
    expect(second.video.muted).toBe(true);
    expect(screen.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Captions" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(second.video.textTracks[0].mode).toBe("hidden");
  });

  it("works with its defaults when the storage throws on every call", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const { status, video, press } = await renderPlaying({ props: { videoId: VIDEO_ID } });
    await press("m");
    await wait(20_000);

    expect(status()).toBe("playing");
    expect(video.muted).toBe(true);
  });
});

describe("production: caption size and speed", () => {
  const withCaptions: Setup = {
    props: { captionsSrc: "captions.vtt" },
    options: { cues: [{ start: 0, end: 100, text: "<v Asha>Hello <i>there</i>" }] },
  };

  it("shows a caption as plain text, without the marks of the file", async () => {
    const { click } = await renderPlaying(withCaptions);

    await click(screen.getByRole("button", { name: "Captions" }));
    await wait(TICK_MS);

    expect(document.querySelector(".player__captions")).toHaveTextContent("Hello there");
  });

  it("sets the size of the caption text, and remembers it", async () => {
    const first = await renderPlaying(withCaptions);
    await first.click(screen.getByRole("button", { name: "Captions" }));
    await wait(TICK_MS);
    expect(document.querySelector<HTMLElement>(".player__captions")?.style.fontSize).toBe(
      "1.25rem",
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Caption size" }), {
      target: { value: "2" },
    });
    expect(document.querySelector<HTMLElement>(".player__captions")?.style.fontSize).toBe("2.5rem");
    first.unmount();

    await renderPlaying(withCaptions);
    await wait(TICK_MS);
    expect(document.querySelector<HTMLElement>(".player__captions")?.style.fontSize).toBe("2.5rem");
  });

  it("offers the caption sizes as percentages in the language of the player", async () => {
    renderPlayer({ ...withCaptions, props: { ...withCaptions.props, locale: "en" } });

    const options = screen
      .getByRole("combobox", { name: "Caption size" })
      .querySelectorAll("option");

    expect(Array.from(options, (option) => option.textContent)).toEqual([
      "75%",
      "100%",
      "150%",
      "200%",
    ]);
  });

  it("changes the speed of the video, and the video then moves faster", async () => {
    const { video } = await renderPlaying();
    const speed = screen.getByRole("combobox", { name: "Speed" }) as HTMLSelectElement;
    expect(speed.value).toBe("1");

    fireEvent.change(speed, { target: { value: "2" } });
    await flush();
    expect(video.playbackRate).toBe(2);
    expect(speed.value).toBe("2");

    const before = video.currentTime;
    await wait(1000);
    expect(video.currentTime - before).toBe(2);
  });

  it("follows a change of speed that did not come from its own menu", async () => {
    const { video } = await renderPlaying();

    video.playbackRate = 1.5;
    await flush();

    expect((screen.getByRole("combobox", { name: "Speed" }) as HTMLSelectElement).value).toBe(
      "1.5",
    );
  });

  it("does not use shortcuts while a menu has the focus, so its own keys work", async () => {
    const { status, press } = await renderPlaying();
    const speed = screen.getByRole("combobox", { name: "Speed" });

    expect((await press(" ", speed)).defaultPrevented).toBe(false);
    expect((await press("ArrowDown", speed)).defaultPrevented).toBe(false);
    expect((await press("k", speed)).defaultPrevented).toBe(false);

    expect(status()).toBe("playing");
  });
});

describe("production: the quality menu and the engine", () => {
  function renderWithEngine(speedKbps = 8000) {
    let media: SimulatedMedia | null = null;
    const engine = fakeEngine(() => media, speedKbps);
    const view = renderPlayer({
      props: { engine, autoPlay: true },
      options: { maxBufferSeconds: 30 },
      before: (m) => (media = m),
    });
    const menu = () => screen.getByRole("combobox", { name: "Quality" }) as HTMLSelectElement;
    const optionTexts = () => Array.from(menu().options, (option) => option.textContent);
    return { ...view, engine, menu, optionTexts };
  }

  it("has no quality menu for a plain video file, which has one quality", async () => {
    renderPlayer();
    await wait(LOAD_MS);

    expect(screen.queryByRole("combobox", { name: "Quality" })).not.toBeInTheDocument();
  });

  it("lists Auto with the level in use, and every level of the engine", async () => {
    const { optionTexts, menu } = renderWithEngine();
    await wait(LOAD_MS);

    expect(menu().value).toBe("auto");
    expect(optionTexts()).toEqual(["Auto (240p)", "240p", "480p", "720p"]);
  });

  it("shows in Auto how the engine climbs on a fast network", async () => {
    const { optionTexts } = renderWithEngine();

    await wait(30_000);

    expect(optionTexts()[0]).toBe("Auto (720p)");
  });

  it("tells the engine the level the user picks, and stays on it", async () => {
    const { engine, menu, ofType } = renderWithEngine();
    const setLevel = vi.spyOn(engine, "setLevel");
    await wait(LOAD_MS);

    fireEvent.change(menu(), { target: { value: "1" } });
    await wait(30_000);

    expect(setLevel).toHaveBeenCalledWith(1);
    expect(menu().value).toBe("1");
    expect(ofType("quality_switch").slice(-1)).toEqual([
      { type: "quality_switch", fromHeight: 240, toHeight: 480, auto: false },
    ]);
  });

  it("goes back to Auto when the user picks it again", async () => {
    const { engine, menu, optionTexts } = renderWithEngine();
    const setLevel = vi.spyOn(engine, "setLevel");
    await wait(LOAD_MS);
    fireEvent.change(menu(), { target: { value: "0" } });
    await wait(20_000);

    fireEvent.change(menu(), { target: { value: "auto" } });
    await wait(30_000);

    expect(setLevel).toHaveBeenLastCalledWith("auto");
    expect(optionTexts()[0]).toBe("Auto (720p)");
  });

  it("asks the engine to load, not the video element, and unloads it on removal", async () => {
    const { engine, unmount, video } = renderWithEngine();
    const unload = vi.spyOn(engine, "unload");
    await wait(LOAD_MS);
    expect(video.src).toBe(SRC);

    unmount();

    expect(unload).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows an error that the engine reports, by its kind", async () => {
    const listeners = new Set<Parameters<StreamingEngine["subscribe"]>[0]>();
    const engine: StreamingEngine = {
      loadSource: (video, src) => (video.src = src),
      levels: () => [],
      setLevel: () => undefined,
      subscribe(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      unload: () => undefined,
    };
    const { status } = await renderPlaying({ props: { engine } });

    act(() => listeners.forEach((listener) => listener({ type: "error", kind: "decode" })));

    expect(status()).toBe("error");
    expect(screen.getByRole("alert")).toHaveTextContent(DEFAULT_MESSAGES.errorDecode);
  });
});

describe("production: full screen and picture-in-picture", () => {
  // These two throw when the button is not there, so a test never clicks nothing.
  const fullscreenButton = () => screen.getByRole("button", { name: "Full screen" });
  const pipButton = () => screen.getByRole("button", { name: "Picture in picture" });

  it("has no full screen and no picture-in-picture button where the browser cannot do it", async () => {
    renderPlayer();
    await wait(LOAD_MS);

    expect(screen.queryByRole("button", { name: "Full screen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Picture in picture" })).not.toBeInTheDocument();
  });

  it("puts the whole player in full screen, so its own controls stay", async () => {
    define(document, "fullscreenEnabled", true);
    const requestFullscreen = vi.fn(() => Promise.resolve());
    define(Element.prototype, "requestFullscreen", requestFullscreen);
    const { player, click } = renderPlayer();
    await wait(LOAD_MS);

    await click(fullscreenButton());

    expect(requestFullscreen.mock.contexts).toEqual([player]);
  });

  it("shows the button as pressed while the player is in full screen, and leaves on a second press", async () => {
    define(document, "fullscreenEnabled", true);
    define(Element.prototype, "requestFullscreen", () => Promise.resolve());
    const exitFullscreen = vi.fn(() => Promise.resolve());
    define(document, "exitFullscreen", exitFullscreen);
    const { player, click } = renderPlayer();
    await wait(LOAD_MS);

    define(document, "fullscreenElement", player);
    act(() => void document.dispatchEvent(new Event("fullscreenchange")));
    expect(fullscreenButton()).toHaveAttribute("aria-pressed", "true");

    await click(fullscreenButton());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    // The user can also leave with Escape. The browser then only sends the event.
    define(document, "fullscreenElement", null);
    act(() => void document.dispatchEvent(new Event("fullscreenchange")));
    expect(fullscreenButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("goes to full screen with the F key, and does nothing where it is not supported", async () => {
    const first = renderPlayer();
    await wait(LOAD_MS);
    await first.press("f");
    first.unmount();

    define(document, "fullscreenEnabled", true);
    const requestFullscreen = vi.fn(() => Promise.resolve());
    define(Element.prototype, "requestFullscreen", requestFullscreen);
    const second = renderPlayer();
    await wait(LOAD_MS);
    await second.press("f");

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("stays as it is, with no error, when the browser refuses full screen", async () => {
    define(document, "fullscreenEnabled", true);
    define(Element.prototype, "requestFullscreen", () =>
      Promise.reject(new TypeError("Fullscreen request denied")),
    );
    const { click } = renderPlayer();
    await wait(LOAD_MS);

    await click(fullscreenButton());
    await wait(1000);

    // Vitest fails this run if the rejected promise is left unhandled.
    expect(fullscreenButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("uses the video's own full screen on an iPhone, which cannot show a whole element", async () => {
    const webkitEnterFullscreen = vi.fn();
    const { click } = renderPlayer({
      before: (_media, video) => define(video, "webkitEnterFullscreen", webkitEnterFullscreen),
    });
    await wait(LOAD_MS);

    await click(fullscreenButton());

    expect(webkitEnterFullscreen).toHaveBeenCalledTimes(1);
  });

  it("asks for picture-in-picture on the video, and follows the events of the browser", async () => {
    define(document, "pictureInPictureEnabled", true);
    define(document, "pictureInPictureElement", null);
    const requestPictureInPicture = vi.fn(() => Promise.resolve());
    const { click, video } = renderPlayer({
      before: (_media, element) =>
        define(element, "requestPictureInPicture", requestPictureInPicture),
    });
    await wait(LOAD_MS);

    await click(pipButton());
    expect(requestPictureInPicture).toHaveBeenCalledTimes(1);

    act(() => void video.dispatchEvent(new Event("enterpictureinpicture")));
    expect(pipButton()).toHaveAttribute("aria-pressed", "true");

    const exitPictureInPicture = vi.fn(() => Promise.resolve());
    define(document, "exitPictureInPicture", exitPictureInPicture);
    define(document, "pictureInPictureElement", video);
    await click(pipButton());
    expect(exitPictureInPicture).toHaveBeenCalledTimes(1);

    act(() => void video.dispatchEvent(new Event("leavepictureinpicture")));
    expect(pipButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("stays as it is when the browser refuses picture-in-picture", async () => {
    define(document, "pictureInPictureEnabled", true);
    define(document, "pictureInPictureElement", null);
    const { click } = renderPlayer({
      before: (_media, element) =>
        define(element, "requestPictureInPicture", () =>
          Promise.reject(new DOMException("not loaded", "InvalidStateError")),
        ),
    });
    await wait(LOAD_MS);

    await click(pipButton());
    await wait(1000);

    expect(pipButton()).toHaveAttribute("aria-pressed", "false");
  });
});

describe("production: the controls hide", () => {
  it("hides the controls after 3 seconds with no sign of the user, while the video plays", async () => {
    const { isIdle } = await renderPlaying();
    expect(isIdle()).toBe(false);

    await wait(2999);
    expect(isIdle()).toBe(false);

    await wait(1);
    expect(isIdle()).toBe(true);
  });

  it.each([
    ["a move of the pointer", (player: Element) => fireEvent.pointerMove(player)],
    ["a press of the pointer", (player: Element) => fireEvent.pointerDown(player)],
    ["a key", (player: Element) => fireEvent.keyDown(player, { key: "Tab" })],
    ["focus moving into the player", (player: Element) => fireEvent.focusIn(player)],
  ])("shows the controls again on %s, and starts the 3 seconds again", async (_name, act) => {
    const { isIdle, player } = await renderPlaying();
    await wait(3000);
    expect(isIdle()).toBe(true);

    act(player);
    expect(isIdle()).toBe(false);

    await wait(2999);
    expect(isIdle()).toBe(false);
    await wait(1);
    expect(isIdle()).toBe(true);
  });

  it("never hides the controls while the video is paused, ready or ended", async () => {
    const { isIdle, click, playButton } = renderPlayer({ options: { durationSeconds: 20 } });
    await wait(LOAD_MS);
    await wait(60_000);
    expect(isIdle()).toBe(false);

    await click(playButton());
    await wait(1000);
    await click(playButton());
    await wait(60_000);
    expect(isIdle()).toBe(false);

    await click(playButton());
    await wait(60_000);
    expect(isIdle()).toBe(false);
  });

  it("shows the controls at once when the video stops to buffer or fails", async () => {
    const { isIdle, media } = await renderPlaying();
    await wait(3000);
    expect(isIdle()).toBe(true);

    media.stallFor(5000);
    await flush();
    expect(isIdle()).toBe(false);

    await wait(60_000);
    media.failNow(3);
    await flush();
    expect(isIdle()).toBe(false);
  });

  it("only brings the controls back on a tap while they are hidden, and pauses on the next tap", async () => {
    const { isIdle, status, click, video } = await renderPlaying();
    await wait(3000);

    // A phone has no pointer to move first. The first tap must not pause.
    await click(video);
    expect(isIdle()).toBe(false);
    expect(status()).toBe("playing");

    await click(video);
    expect(status()).toBe("paused");
  });

  it("keeps the controls while the keyboard help is open", async () => {
    const { isIdle, press } = await renderPlaying();

    await press("?");
    await wait(60_000);

    expect(isIdle()).toBe(false);
  });
});

describe("production: the keyboard help", () => {
  it("opens with the ? key and moves the focus to its Close button", async () => {
    const { press } = renderPlayer();
    await wait(LOAD_MS);

    await press("?");

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    expect(dialog).toHaveTextContent("Back or forward 5 seconds");
  });

  it("opens with its button, which says that it opens a dialog", async () => {
    const { click } = renderPlayer();
    await wait(LOAD_MS);
    const helpButton = screen.getByRole("button", { name: "Keyboard shortcuts" });
    expect(helpButton).toHaveAttribute("aria-haspopup", "dialog");

    await click(helpButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes with Escape and gives the focus back to the help button", async () => {
    const { press } = renderPlayer();
    await wait(LOAD_MS);
    await press("?");

    await press("Escape", screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keyboard shortcuts" }));
  });

  it("closes with its Close button", async () => {
    const { press, click } = renderPlayer();
    await wait(LOAD_MS);
    await press("?");

    await click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab inside the dialog", async () => {
    const { press } = renderPlayer();
    await wait(LOAD_MS);
    await press("?");

    const result = await press("Tab", screen.getByRole("button", { name: "Close" }));

    expect(result.defaultPrevented).toBe(true);
  });

  it("does not let a key pressed in the dialog play, seek or mute the video behind it", async () => {
    const { press, status, video } = renderPlayer();
    await wait(LOAD_MS);
    await press("?");
    const closeButton = screen.getByRole("button", { name: "Close" });

    await press("k", closeButton);
    await press("ArrowRight", closeButton);
    await press("m", closeButton);

    expect(status()).toBe("ready");
    expect(video.currentTime).toBe(0);
    expect(video.muted).toBe(false);
  });
});

describe("production: a failure in the player itself", () => {
  it("shows a message in place of the player, reports it, and keeps the page alive", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onEvent = vi.fn();
    const brokenMessages = {
      position: () => {
        throw new Error("A bug in a translation, with a secret address in it");
      },
    };

    render(
      <>
        <p>The rest of the page</p>
        <Player src={SRC} title={TITLE} messages={brokenMessages} onEvent={onEvent} />
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The player stopped working.");
    expect(screen.getByText("The rest of the page")).toBeInTheDocument();
    expect(onEvent).toHaveBeenCalledWith({ type: "error", kind: "render", retry: 0 });
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain("secret");
  });

  it("makes the player again from nothing when the user asks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // This test has no simulated video, and jsdom cannot load a real one.
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    let isBroken = true;
    const messages = {
      position: (current: string, total: string) => {
        if (isBroken) {
          throw new Error("broken once");
        }
        return `${current} of ${total}`;
      },
    };
    const { unmount } = render(<Player src={SRC} title={TITLE} messages={messages} />);
    isBroken = false;

    fireEvent.click(screen.getByRole("button", { name: "Load the player again" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: TITLE })).toBeInTheDocument();
    // Removed here, while `load` is still replaced.
    unmount();
  });
});

describe("production: a hidden tab", () => {
  function setHidden(isHidden: boolean) {
    define(document, "hidden", isHidden);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
  }

  function rememberMuted() {
    window.localStorage.setItem(
      "video-player:settings",
      JSON.stringify({ volume: 1, muted: true, captionsOn: false, captionScale: 1 }),
    );
  }

  it("pauses a muted video that started by itself while its tab is hidden, and plays it again after", async () => {
    rememberMuted();
    const { status, video } = renderPlayer({ props: { autoPlay: true } });
    await wait(LOAD_MS + 2000);
    expect(status()).toBe("playing");
    expect(video.muted).toBe(true);

    setHidden(true);
    await wait(10_000);
    expect(status()).toBe("paused");
    expect(video.currentTime).toBe(2);

    setHidden(false);
    await flush();
    expect(status()).toBe("playing");
  });

  it("keeps playing in a hidden tab when the video has sound: the user may be listening", async () => {
    const { status } = renderPlayer({ props: { autoPlay: true } });
    await wait(LOAD_MS + 2000);

    setHidden(true);
    await wait(5000);

    expect(status()).toBe("playing");
  });

  it("keeps playing in a hidden tab when the user started the video", async () => {
    rememberMuted();
    const { status } = await renderPlaying();

    setHidden(true);
    await wait(5000);

    expect(status()).toBe("playing");
  });

  it("does not start a video in a tab that becomes visible when the user had paused it", async () => {
    rememberMuted();
    const { status, click, playButton } = renderPlayer({ props: { autoPlay: true } });
    await wait(LOAD_MS + 2000);
    await click(playButton());

    setHidden(true);
    setHidden(false);
    await wait(1000);

    expect(status()).toBe("paused");
  });
});

describe("production: the seek bar", () => {
  it("draws every downloaded range, also one the user jumped to", async () => {
    const { seekBar } = await renderPlaying({ options: { downloadSpeed: 2 } });
    await wait(10_000);

    fireEvent.change(seekBar(), { target: { value: "150" } });
    await wait(5000);

    const ranges = Array.from(
      document.querySelectorAll<HTMLElement>(".player__buffered"),
      (range) => [range.style.insetInlineStart, range.style.inlineSize],
    );
    // 300 seconds of video. Downloaded: 0 to 20.5 seconds, and 150 to 160 seconds.
    expect(ranges).toEqual([
      ["0%", `${(20.5 / 300) * 100}%`],
      ["50%", `${(10 / 300) * 100}%`],
    ]);
  });

  it("shows the time under the mouse, and removes it when the mouse leaves", async () => {
    const { seekBar } = renderPlayer();
    await wait(LOAD_MS);
    // jsdom does no layout, so the test gives the bar a place: x from 100 to 500.
    vi.spyOn(seekBar(), "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 400, 44));

    fireEvent.mouseMove(seekBar(), { clientX: 300 });
    const preview = document.querySelector<HTMLElement>(".player__preview");
    expect(preview).toHaveTextContent("2:30");
    expect(preview?.style.insetInlineStart).toBe("50%");

    fireEvent.mouseLeave(seekBar());
    expect(document.querySelector(".player__preview")).not.toBeInTheDocument();
  });

  it("shows the time under the thumb during a drag, not the time under the mouse", async () => {
    const { seekBar } = renderPlayer();
    await wait(LOAD_MS);
    vi.spyOn(seekBar(), "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 400, 44));

    fireEvent.mouseMove(seekBar(), { clientX: 300 });
    fireEvent.pointerDown(seekBar());
    fireEvent.change(seekBar(), { target: { value: "60" } });

    expect(document.querySelector(".player__preview")).toHaveTextContent("1:00");
  });

  it("shows the time at the thumb while the keyboard is used on the slider", async () => {
    const { seekBar, press } = renderPlayer();
    await wait(LOAD_MS);

    await press("ArrowRight", seekBar());
    expect(document.querySelector(".player__preview")).toHaveTextContent("0:05");

    fireEvent.blur(seekBar());
    expect(document.querySelector(".player__preview")).not.toBeInTheDocument();
  });

  it("shows no preview while the bar cannot be used", async () => {
    const { seekBar } = renderPlayer();

    fireEvent.mouseMove(seekBar(), { clientX: 300 });

    expect(document.querySelector(".player__preview")).not.toBeInTheDocument();
  });

  it("hides the decoration from screen readers: the slider already says the time", async () => {
    await renderPlaying();

    expect(document.querySelector(".player__ranges")).toHaveAttribute("aria-hidden", "true");
  });
});
