/*
 * NOT PART OF THE INTERVIEW.
 * These tests drive the whole player with a simulated video element. The
 * clock is fake, so a stall, a blocked autoplay and a failed load are forced
 * at an exact moment.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SimulatedStage } from "../demo/SimulatedStage";
import type { SimulatedMedia, SimulatedMediaOptions } from "../demo/simulatedMedia";
import { flush, wait } from "../testUtils";
import { DEFAULT_MESSAGES } from "./messages";
import type { PlayerMessages } from "./messages";
import { Player } from "./Player";
import type { PlayerProps } from "./Player";
import * as timeModule from "./time";
import * as usePlayerModule from "./usePlayer";

const LOAD_MS = 400;
const TICK_MS = 250;

interface Setup {
  props?: Partial<PlayerProps>;
  options?: SimulatedMediaOptions;
  /** Runs before the player loads its source, as a browser setting would. */
  before?: (media: SimulatedMedia) => void;
}

function renderPlayer({ props, options, before }: Setup = {}) {
  let media: SimulatedMedia | undefined;
  let video: HTMLVideoElement | undefined;

  const view = (playerProps: Partial<PlayerProps> = {}) => (
    <SimulatedStage
      options={{ durationSeconds: 60, loadMs: LOAD_MS, tickMs: TICK_MS, ...options }}
      onMedia={(simulated, element) => {
        media = simulated;
        video = element;
        before?.(simulated);
      }}
    >
      <Player src="video.mp4" title="Test video" {...props} {...playerProps} />
    </SimulatedStage>
  );
  const { rerender, unmount } = render(view());

  if (media === undefined || video === undefined) {
    throw new Error("The simulated video was not set up.");
  }

  const player = screen.getByRole("group", { name: "Test video" });
  return {
    media,
    video,
    player,
    unmount,
    setProps: (playerProps: Partial<PlayerProps>) => rerender(view(playerProps)),
    status: () => player.dataset.status,
    playButton: () => screen.getByRole("button", { name: /^(Play|Pause)$/ }),
    muteButton: () => screen.getByRole("button", { name: "Mute" }),
    seekBar: () => screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement,
    volumeBar: () => screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement,
    captionsButton: () => screen.getByRole("button", { name: "Captions" }),
    captionText: () => document.querySelector(".player__captions")?.textContent ?? null,
    /** A key press on the player itself, or on a control inside it. */
    async press(key: string, target: Element = player, init: KeyboardEventInit = {}) {
      const wasNotStopped = fireEvent.keyDown(target, { key, ...init });
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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Player: loading and playing", () => {
  it("is loading first, and ready with a Play button when the video can play", async () => {
    const { status, playButton, seekBar } = renderPlayer();

    expect(status()).toBe("loading");
    expect(seekBar()).toBeDisabled();

    await wait(LOAD_MS);

    expect(status()).toBe("ready");
    expect(playButton()).toHaveTextContent("Play");
    expect(seekBar()).toBeEnabled();
  });

  it("marks the player as busy while it loads or buffers", async () => {
    const { player, media, click, playButton } = renderPlayer();
    expect(player).toHaveAttribute("aria-busy", "true");

    await wait(LOAD_MS);
    expect(player).toHaveAttribute("aria-busy", "false");

    await click(playButton());
    media.stallFor(1000);
    await flush();
    expect(player).toHaveAttribute("aria-busy", "true");
  });

  it("plays when the user presses Play, and the button becomes Pause", async () => {
    const { status, playButton, click } = renderPlayer();
    await wait(LOAD_MS);

    await click(playButton());

    expect(status()).toBe("playing");
    expect(playButton()).toHaveTextContent("Pause");
  });

  it("pauses when the user presses Pause", async () => {
    const { status, playButton, click, video } = await renderPlaying();

    await click(playButton());

    expect(status()).toBe("paused");
    expect(video.paused).toBe(true);
    expect(playButton()).toHaveTextContent("Play");
  });

  it("plays and pauses on a click on the picture", async () => {
    const { status, video, click } = renderPlayer();
    await wait(LOAD_MS);

    await click(video);
    expect(status()).toBe("playing");

    await click(video);
    expect(status()).toBe("paused");
  });

  it("follows the time of the video element", async () => {
    const { seekBar, video } = await renderPlaying();

    await wait(5000);

    expect(video.currentTime).toBe(5);
    expect(seekBar().value).toBe("5");
    expect(screen.getByText("0:05 / 1:00")).toBeInTheDocument();
  });

  it("goes to ended at the end, and plays from the start on the next Play", async () => {
    const { status, playButton, click, video } = await renderPlaying({
      options: { durationSeconds: 3 },
    });

    await wait(3000);
    expect(status()).toBe("ended");
    expect(playButton()).toHaveTextContent("Play");
    expect(screen.getByText("0:03 / 0:03")).toBeInTheDocument();

    await click(playButton());
    expect(status()).toBe("playing");
    expect(video.currentTime).toBe(0);
  });

  it("pauses when the user presses Play and then Pause before the video has started", async () => {
    const { status, playButton, media } = renderPlayer();
    await wait(LOAD_MS);
    media.stallFor(1000);

    // Two presses with nothing in between: the play() promise is still open.
    fireEvent.click(playButton());
    fireEvent.click(playButton());
    await flush();

    expect(status()).toBe("paused");

    // The data arrives. The player must not start by itself, and shows no error.
    await wait(1000);
    expect(status()).toBe("paused");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Player: autoplay", () => {
  it("starts by itself with autoPlay when the browser allows it", async () => {
    const { status } = renderPlayer({ props: { autoPlay: true } });

    await wait(LOAD_MS);

    expect(status()).toBe("playing");
  });

  it("stays on the Play button, with no error, when the browser blocks autoplay", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { status, playButton, video } = renderPlayer({
      props: { autoPlay: true },
      before: (media) => media.setBlockAutoplay(true),
    });
    await wait(LOAD_MS);
    await wait(2000);

    expect(status()).toBe("ready");
    expect(video.paused).toBe(true);
    expect(playButton()).toHaveTextContent("Play");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    // Vitest also fails this run if the rejected play() promise is left unhandled.
  });

  it("plays after a blocked autoplay when the user presses Play", async () => {
    const { status, playButton, click } = renderPlayer({
      props: { autoPlay: true },
      before: (media) => media.setBlockAutoplay(true),
    });
    await wait(LOAD_MS);

    await click(playButton());

    expect(status()).toBe("playing");
  });

  it("goes back to the Play button when play is refused after the video was ready", async () => {
    const { status, playButton, video } = renderPlayer();
    await wait(LOAD_MS);
    vi.spyOn(video, "play").mockRejectedValue(new DOMException("blocked", "NotAllowedError"));

    // The test presses the button itself, without the event that counts as a user press.
    await act(async () => {
      playButton().click();
    });

    expect(status()).toBe("paused");
    expect(playButton()).toHaveTextContent("Play");
  });

  it("works in an old browser where play() returns nothing", async () => {
    const { playButton, click, video } = renderPlayer();
    await wait(LOAD_MS);
    const play = vi.spyOn(video, "play").mockReturnValue(undefined as unknown as Promise<void>);

    await click(playButton());

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Player: buffering", () => {
  it("goes to buffering when the network stalls, and back to playing when data arrives", async () => {
    const { status, media, video } = await renderPlaying();
    await wait(1000);

    media.stallFor(3000);
    await flush();
    expect(status()).toBe("buffering");

    const timeAtStall = video.currentTime;
    await wait(2900);
    expect(status()).toBe("buffering");
    expect(video.currentTime).toBe(timeAtStall);

    await wait(100);
    expect(status()).toBe("playing");
  });

  it("keeps the Pause button while buffering, because the user still wants to play", async () => {
    const { media, playButton } = await renderPlaying();

    media.stallFor(3000);
    await flush();

    expect(playButton()).toHaveTextContent("Pause");
  });

  it("stays paused when the user pauses during a stall and the data arrives later", async () => {
    const { status, media, playButton, click } = await renderPlaying();
    media.stallFor(3000);
    await flush();

    await click(playButton());
    expect(status()).toBe("paused");

    await wait(3000);
    expect(status()).toBe("paused");
  });

  it("buffers when the download is slower than the video, and plays again later", async () => {
    // One second of video needs two seconds to download.
    const { status } = renderPlayer({ options: { downloadSpeed: 0.5 }, props: { autoPlay: true } });
    const seen = new Set<string | undefined>();

    for (let step = 0; step < 40; step++) {
      await wait(TICK_MS);
      seen.add(status());
    }

    expect(seen).toContain("buffering");
    expect(seen).toContain("playing");
  });
});

describe("Player: a failed load", () => {
  async function renderFailed() {
    const view = renderPlayer({ before: (media) => media.setFailLoads(true) });
    await wait(LOAD_MS);
    return view;
  }

  it("shows an error with Try again when the video cannot be loaded", async () => {
    const { status, seekBar } = await renderFailed();

    expect(status()).toBe("error");
    expect(screen.getByRole("alert")).toHaveTextContent("The video could not be loaded.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(seekBar()).toBeDisabled();
  });

  it("loads and plays when the user presses Try again and the network is back", async () => {
    const { status, media, click } = await renderFailed();
    media.setFailLoads(false);

    await click(screen.getByRole("button", { name: "Try again" }));
    expect(status()).toBe("loading");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await wait(LOAD_MS);
    expect(status()).toBe("playing");
  });

  it("shows the error again when Try again fails too, and never tries by itself", async () => {
    const { status, video, click } = await renderFailed();
    const load = vi.spyOn(video, "load");

    await click(screen.getByRole("button", { name: "Try again" }));
    await wait(LOAD_MS);
    expect(status()).toBe("error");

    await wait(60_000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("moves the focus to the player when Try again is pressed, so the keyboard is not lost", async () => {
    const { player, click } = await renderFailed();
    const retryButton = screen.getByRole("button", { name: "Try again" });
    retryButton.focus();

    await click(retryButton);

    expect(document.activeElement).toBe(player);
  });

  it("does not play or seek while the error is shown", async () => {
    const { status, press, playButton, click, video } = await renderFailed();
    const play = vi.spyOn(video, "play");

    await press(" ");
    await press("ArrowRight");
    await click(playButton());

    expect(status()).toBe("error");
    expect(video.currentTime).toBe(0);
    await expect(play.mock.results[0].value).rejects.toThrow();
  });

  it("goes to error when the video breaks in the middle of playing", async () => {
    const { status, media } = await renderPlaying();
    await wait(2000);

    media.failNow(2);
    await flush();

    expect(status()).toBe("error");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("Player: keyboard shortcuts", () => {
  it("can be focused, so the shortcuts have a place to work", async () => {
    const { player } = renderPlayer();

    player.focus();

    expect(document.activeElement).toBe(player);
  });

  it.each([" ", "k", "K"])("plays and pauses with the key '%s'", async (key) => {
    const { status, press } = renderPlayer();
    await wait(LOAD_MS);

    expect((await press(key)).defaultPrevented).toBe(true);
    expect(status()).toBe("playing");

    await press(key);
    expect(status()).toBe("paused");
  });

  it("seeks 5 seconds with ArrowRight and ArrowLeft", async () => {
    const { press, video } = await renderPlaying();
    await wait(10_000);

    await press("ArrowRight");
    expect(video.currentTime).toBe(15);

    await press("ArrowLeft");
    await press("ArrowLeft");
    expect(video.currentTime).toBe(5);
  });

  it("does not seek before the start or after the end", async () => {
    const { press, video } = renderPlayer();
    await wait(LOAD_MS);

    await press("ArrowLeft");
    expect(video.currentTime).toBe(0);

    await press("End");
    await press("ArrowRight");
    expect(video.currentTime).toBe(60);
  });

  it("jumps to the start with Home and to the end with End", async () => {
    const { press, video, status } = await renderPlaying();
    await wait(10_000);

    await press("Home");
    expect(video.currentTime).toBe(0);

    await press("End");
    await wait(TICK_MS);
    expect(status()).toBe("ended");
  });

  it("changes the volume with ArrowUp and ArrowDown", async () => {
    const { press, video, volumeBar } = renderPlayer();
    await wait(LOAD_MS);

    await press("ArrowDown");
    await press("ArrowDown");
    expect(video.volume).toBeCloseTo(0.8);
    expect(volumeBar().value).toBe("80");

    await press("ArrowUp");
    expect(video.volume).toBeCloseTo(0.9);
  });

  it("keeps the volume between 0 and 1", async () => {
    const { press, video } = renderPlayer();
    await wait(LOAD_MS);

    await press("ArrowUp");
    expect(video.volume).toBe(1);

    for (let count = 0; count < 12; count++) {
      await press("ArrowDown");
    }
    expect(video.volume).toBe(0);
  });

  it("mutes and unmutes with M", async () => {
    const { press, video, muteButton } = renderPlayer();
    await wait(LOAD_MS);

    await press("m");
    expect(video.muted).toBe(true);
    expect(muteButton()).toHaveAttribute("aria-pressed", "true");

    await press("M");
    expect(video.muted).toBe(false);
    expect(muteButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores a shortcut key pressed with Ctrl, Alt or Cmd, so browser shortcuts still work", async () => {
    const { status, press, player } = renderPlayer();
    await wait(LOAD_MS);

    for (const modifier of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      expect((await press("k", player, modifier)).defaultPrevented).toBe(false);
    }

    expect(status()).toBe("ready");
  });

  it("does not stop a key that is not a shortcut", async () => {
    const { press } = renderPlayer();
    await wait(LOAD_MS);

    expect((await press("Tab")).defaultPrevented).toBe(false);
    expect((await press("a")).defaultPrevented).toBe(false);
  });

  it("does nothing for a key pressed outside the player", async () => {
    const { status } = renderPlayer();
    await wait(LOAD_MS);

    fireEvent.keyDown(document.body, { key: " " });
    await flush();

    expect(status()).toBe("ready");
  });

  it("only mutes when Space is pressed on the Mute button, and does not also play", async () => {
    const { status, press, muteButton } = renderPlayer();
    await wait(LOAD_MS);

    // The key press reaches the player, which must leave it to the button.
    expect((await press(" ", muteButton())).defaultPrevented).toBe(false);
    expect(status()).toBe("ready");
  });

  it("still plays with K while the Mute button or a slider has the focus", async () => {
    const { status, press, muteButton, seekBar } = renderPlayer();
    await wait(LOAD_MS);

    await press("k", muteButton());
    expect(status()).toBe("playing");

    await press(" ", seekBar());
    expect(status()).toBe("paused");
  });

  it("leaves the arrows to the volume slider when it has the focus", async () => {
    const { press, video, volumeBar } = await renderPlaying();
    await wait(10_000);

    expect((await press("ArrowRight", volumeBar())).defaultPrevented).toBe(false);
    expect(video.currentTime).toBe(10);
  });
});

describe("Player: the seek bar", () => {
  it("is a slider that reads the time in words", async () => {
    const { seekBar } = await renderPlaying({ options: { durationSeconds: 300 } });
    await wait(80_000);

    expect(seekBar()).toHaveAttribute("aria-valuetext", "1 minute 20 seconds of 5 minutes");
    expect(seekBar()).toHaveAttribute("max", "300");
    expect(seekBar().value).toBe("80");
  });

  it("seeks when the user moves the slider", async () => {
    const { seekBar, video } = renderPlayer();
    await wait(LOAD_MS);

    fireEvent.change(seekBar(), { target: { value: "42" } });
    await flush();

    expect(video.currentTime).toBe(42);
    expect(seekBar().value).toBe("42");
  });

  it("moves exactly 5 seconds for one arrow key on the focused slider, not twice", async () => {
    const { seekBar, press, video } = await renderPlaying();
    await wait(10_000);

    expect((await press("ArrowRight", seekBar())).defaultPrevented).toBe(true);
    expect(video.currentTime).toBe(15);

    await press("ArrowUp", seekBar());
    expect(video.currentTime).toBe(20);

    await press("ArrowDown", seekBar());
    await press("ArrowLeft", seekBar());
    expect(video.currentTime).toBe(10);
  });

  it("jumps to the start and the end with Home and End on the focused slider", async () => {
    const { seekBar, press, video } = renderPlayer();
    await wait(LOAD_MS);

    await press("End", seekBar());
    expect(video.currentTime).toBe(60);

    await press("Home", seekBar());
    expect(video.currentTime).toBe(0);
  });

  it("keeps playing after a seek to a part that is already downloaded", async () => {
    const { status, press } = await renderPlaying();
    await wait(4000);

    await press("ArrowRight");
    await wait(TICK_MS);

    expect(status()).toBe("playing");
  });

  it("buffers after a seek to a part that is not downloaded yet, then plays", async () => {
    const { status, seekBar } = await renderPlaying({ options: { downloadSpeed: 2 } });

    fireEvent.change(seekBar(), { target: { value: "50" } });
    await flush();
    expect(status()).toBe("buffering");

    await wait(2 * TICK_MS);
    expect(status()).toBe("playing");
  });

  it("is paused, not ended, after a seek back from the end", async () => {
    const { status, seekBar, video } = await renderPlaying({ options: { durationSeconds: 3 } });
    await wait(3000);
    expect(status()).toBe("ended");

    fireEvent.change(seekBar(), { target: { value: "1" } });
    await flush();

    expect(status()).toBe("paused");
    expect(video.currentTime).toBe(1);
  });

  it("sets how much of the bar is filled", async () => {
    const { seekBar } = await renderPlaying();
    await wait(15_000);

    expect(seekBar().style.getPropertyValue("--played")).toBe("25%");
  });
});

describe("Player: volume", () => {
  it("sets the volume of the video when the user moves the volume slider", async () => {
    const { video, volumeBar } = renderPlayer();
    await wait(LOAD_MS);

    fireEvent.change(volumeBar(), { target: { value: "30" } });
    await flush();

    expect(video.volume).toBeCloseTo(0.3);
    expect(volumeBar().value).toBe("30");
  });

  it("mutes with the Mute button, and keeps the volume for later", async () => {
    const { video, muteButton, click, volumeBar } = renderPlayer();
    await wait(LOAD_MS);
    fireEvent.change(volumeBar(), { target: { value: "30" } });

    await click(muteButton());

    expect(video.muted).toBe(true);
    expect(video.volume).toBeCloseTo(0.3);
    expect(muteButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the sound back on when the user moves the volume", async () => {
    const { video, muteButton, click, volumeBar } = renderPlayer();
    await wait(LOAD_MS);
    await click(muteButton());

    fireEvent.change(volumeBar(), { target: { value: "50" } });
    await flush();

    expect(video.muted).toBe(false);
    expect(muteButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("follows a change of the volume that did not come from its own controls", async () => {
    const { video, volumeBar, muteButton } = renderPlayer();
    await wait(LOAD_MS);

    video.volume = 0.2;
    video.muted = true;
    await flush();

    expect(volumeBar().value).toBe("20");
    expect(muteButton()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Player: what React draws again", () => {
  it("draws only the seek bar again while the video plays, not the whole player", async () => {
    const usePlayer = vi.spyOn(usePlayerModule, "usePlayer");
    const spokenTime = vi.spyOn(timeModule, "spokenTime");
    await renderPlaying();
    usePlayer.mockClear();
    spokenTime.mockClear();

    // 10 seconds of video: 40 "timeupdate" events. React draws after each of them.
    for (let tick = 0; tick < 40; tick++) {
      await wait(TICK_MS);
    }

    // The player calls usePlayer once each time it is drawn.
    expect(usePlayer).toHaveBeenCalledTimes(0);
    // The seek bar calls spokenTime twice each time it is drawn.
    expect(spokenTime).toHaveBeenCalledTimes(2 * 40);
  });

  it("draws the player again when the status changes", async () => {
    const usePlayer = vi.spyOn(usePlayerModule, "usePlayer");
    const { media } = await renderPlaying();
    usePlayer.mockClear();

    media.stallFor(1000);
    await flush();

    expect(usePlayer).toHaveBeenCalledTimes(1);
  });
});

describe("Player: a new source and removal", () => {
  it("starts from zero in loading when the source changes", async () => {
    const { status, setProps, video } = await renderPlaying();
    await wait(5000);

    setProps({ src: "other-video.mp4" });
    await flush();

    expect(status()).toBe("loading");
    expect(video.src).toBe("other-video.mp4");
    expect(screen.getByText("0:00 / 0:00")).toBeInTheDocument();

    await wait(LOAD_MS);
    expect(status()).toBe("ready");
  });

  it("stops the download and every timer when it is removed while playing", async () => {
    const { unmount, video } = await renderPlaying();
    const removeEventListener = vi.spyOn(video, "removeEventListener");

    unmount();

    expect(video.src).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    // Six signals, "loadedmetadata" and "timeupdate".
    expect(removeEventListener).toHaveBeenCalledTimes(8);
  });

  it("is removed while loading without an error or a late update", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderPlayer({ props: { autoPlay: true } });

    unmount();
    await wait(LOAD_MS + 1000);

    expect(consoleError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

const CUES = [
  { start: 1, end: 4, text: "First line" },
  { start: 5, end: 8, text: "Second line\nwith a break" },
];

describe("Player: captions", () => {
  const withCaptions: Setup = { props: { captionsSrc: "captions.vtt" }, options: { cues: CUES } };

  it("has no captions button when there is no captions file", async () => {
    renderPlayer();
    await wait(LOAD_MS);

    expect(screen.queryByRole("button", { name: "Captions" })).not.toBeInTheDocument();
    expect(document.querySelector("track")).not.toBeInTheDocument();
  });

  it("puts a <track> for the captions file in the video, with the language", async () => {
    renderPlayer({ props: { captionsSrc: "captions.vtt", locale: "hi" } });
    const track = document.querySelector("video > track");

    expect(track).toHaveAttribute("kind", "captions");
    expect(track).toHaveAttribute("src", "captions.vtt");
    expect(track).toHaveAttribute("srclang", "hi");
  });

  it("does not load the captions file while captions are off", async () => {
    const { video, captionsButton } = renderPlayer(withCaptions);
    await wait(LOAD_MS);

    // A browser does not fetch the file of a track in the "disabled" mode.
    expect(video.textTracks[0].mode).toBe("disabled");
    expect(captionsButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("asks the browser for the cues but not to draw them, when captions are on", async () => {
    const { video, captionsButton, click } = renderPlayer(withCaptions);
    await wait(LOAD_MS);

    await click(captionsButton());

    expect(video.textTracks[0].mode).toBe("hidden");
    expect(captionsButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the caption of the current time, and removes it when its time is over", async () => {
    const { captionsButton, captionText, click } = await renderPlaying(withCaptions);
    await click(captionsButton());
    expect(captionText()).toBeNull();

    await wait(1000);
    expect(captionText()).toBe("First line");

    await wait(3000);
    expect(captionText()).toBeNull();

    await wait(1000);
    expect(captionText()).toBe("Second line\nwith a break");
  });

  it("shows no caption while captions are off", async () => {
    const { captionText } = await renderPlaying(withCaptions);

    await wait(2000);

    expect(captionText()).toBeNull();
  });

  it("shows the caption at once when captions are switched on in the middle of a line", async () => {
    const { captionsButton, captionText, click } = await renderPlaying(withCaptions);
    await wait(2000);

    await click(captionsButton());

    expect(captionText()).toBe("First line");
  });

  it("removes the caption when captions are switched off", async () => {
    const { captionsButton, captionText, click } = await renderPlaying(withCaptions);
    await click(captionsButton());
    await wait(2000);
    expect(captionText()).toBe("First line");

    await click(captionsButton());

    expect(captionText()).toBeNull();
  });

  it("follows a seek to another line", async () => {
    const { captionsButton, captionText, click, seekBar } = await renderPlaying(withCaptions);
    await click(captionsButton());

    fireEvent.change(seekBar(), { target: { value: "6" } });
    await flush();

    expect(captionText()).toBe("Second line\nwith a break");
  });

  it("stops listening for cues when the player is removed", async () => {
    const { captionsButton, click, video, unmount } = await renderPlaying(withCaptions);
    await click(captionsButton());
    const removeEventListener = vi.spyOn(video.textTracks[0], "removeEventListener");

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("cuechange", expect.any(Function));
  });
});

describe("Player: dragging the seek bar", () => {
  function countSeeks(video: HTMLVideoElement) {
    const onSeeking = vi.fn();
    video.addEventListener("seeking", onSeeking);
    return onSeeking;
  }

  it("does not seek on every move of a drag, and seeks once when the user lets go", async () => {
    const { seekBar, video } = renderPlayer();
    await wait(LOAD_MS);
    const onSeeking = countSeeks(video);

    fireEvent.pointerDown(seekBar());
    for (const value of ["10", "20", "30", "40"]) {
      fireEvent.change(seekBar(), { target: { value } });
    }
    await flush();
    expect(onSeeking).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0);

    fireEvent.pointerUp(seekBar());
    await flush();
    expect(onSeeking).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(40);
  });

  it("shows the time under the thumb while the user drags, as text and for screen readers", async () => {
    const { seekBar } = renderPlayer();
    await wait(LOAD_MS);

    fireEvent.pointerDown(seekBar());
    fireEvent.change(seekBar(), { target: { value: "42" } });

    expect(screen.getByText("0:42 / 1:00")).toBeInTheDocument();
    expect(seekBar()).toHaveAttribute("aria-valuetext", "42 seconds of 1 minute");
    expect(seekBar().style.getPropertyValue("--played")).toBe("70%");
  });

  it("keeps the thumb under the finger while the video plays on during a drag", async () => {
    const { seekBar, video } = await renderPlaying();

    fireEvent.pointerDown(seekBar());
    fireEvent.change(seekBar(), { target: { value: "30" } });
    await wait(2000);

    expect(video.currentTime).toBe(2);
    expect(seekBar().value).toBe("30");
  });

  it("does not seek when the drag is cancelled, and shows the real time again", async () => {
    const { seekBar, video } = renderPlayer();
    await wait(LOAD_MS);
    const onSeeking = countSeeks(video);

    fireEvent.pointerDown(seekBar());
    fireEvent.change(seekBar(), { target: { value: "42" } });
    fireEvent.pointerCancel(seekBar());
    await flush();

    expect(onSeeking).not.toHaveBeenCalled();
    expect(seekBar().value).toBe("0");
  });

  it("seeks to the place of a click, which is a drag that does not move", async () => {
    const { seekBar, video } = renderPlayer();
    await wait(LOAD_MS);

    fireEvent.pointerDown(seekBar());
    fireEvent.change(seekBar(), { target: { value: "25" } });
    fireEvent.pointerUp(seekBar());
    await flush();

    expect(video.currentTime).toBe(25);
  });

  it("seeks at once for a change that is not part of a drag", async () => {
    const { seekBar, video } = renderPlayer();
    await wait(LOAD_MS);

    fireEvent.change(seekBar(), { target: { value: "12" } });
    await flush();

    expect(video.currentTime).toBe(12);
  });
});

describe("Player: texts and language", () => {
  const HINDI: PlayerMessages = {
    play: "चलाएँ",
    pause: "रोकें",
    mute: "आवाज़ बंद",
    volume: "आवाज़",
    seek: "समय",
    position: (current, total) => `${total} में से ${current}`,
    error: "वीडियो लोड नहीं हो सका।",
    retry: "फिर कोशिश करें",
    captions: "कैप्शन",
  };

  it("has a default for every text", () => {
    for (const [key, text] of Object.entries(DEFAULT_MESSAGES)) {
      expect(typeof text === "function" ? text("a", "b") : text, key).not.toBe("");
    }
  });

  it("uses the texts of the caller for every control, with no English left", async () => {
    const { player, video } = renderPlayer({
      props: { messages: HINDI, locale: "hi", captionsSrc: "captions.vtt" },
      options: { durationSeconds: 300 },
    });
    await wait(LOAD_MS);

    expect(screen.getByRole("button", { name: "चलाएँ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "आवाज़ बंद" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "कैप्शन" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "आवाज़" })).toBeInTheDocument();
    const seekBar = screen.getByRole("slider", { name: "समय" });

    video.currentTime = 80;
    await flush();
    expect(seekBar).toHaveAttribute("aria-valuetext", "5 मिनट में से 1 मिनट 20 सेकंड");

    const labels = Array.from(player.querySelectorAll("[aria-label]"), (element) =>
      element.getAttribute("aria-label"),
    ).filter((label) => label !== "Test video");
    // The title comes from the caller. Digits and ":" in the time are not words.
    expect(`${player.textContent} ${labels.join(" ")}`).not.toMatch(/[A-Za-z]/);
  });

  it("uses the texts of the caller for the error and for Pause", async () => {
    const { media, click } = renderPlayer({ props: { messages: HINDI } });
    await wait(LOAD_MS);

    await click(screen.getByRole("button", { name: "चलाएँ" }));
    expect(screen.getByRole("button", { name: "रोकें" })).toBeInTheDocument();

    media.failNow(2);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("वीडियो लोड नहीं हो सका।");
    expect(screen.getByRole("button", { name: "फिर कोशिश करें" })).toBeInTheDocument();
  });

  it("keeps the default for a text that the caller did not replace", async () => {
    renderPlayer({ props: { messages: { play: "Start" } } });
    await wait(LOAD_MS);

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
  });
});
