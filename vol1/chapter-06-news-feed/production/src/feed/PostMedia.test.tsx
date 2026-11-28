/*
 * NOT PART OF THE INTERVIEW: production version.
 * Responsive images and video. jsdom cannot play a video, so the test
 * replaces `play` and `pause` and checks when the feed calls them.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_MESSAGES } from "./messages";
import { PostMedia, buildSrcSet } from "./PostMedia";
import { FakeIntersectionObserver } from "./testHelpers";
import type { PostMedia as PostMediaData } from "./types";

const IMAGE: PostMediaData = { url: "/wide.jpg", width: 1200, height: 800, alt: "A lake" };
const VIDEO: PostMediaData = {
  kind: "video",
  url: "/clip.mp4",
  posterUrl: "/clip.jpg",
  width: 320,
  height: 180,
  alt: "A boat on the lake",
};
const SIZES = "(min-width: 592px) 560px, 100vw";

function renderMedia(media: PostMediaData) {
  return render(<PostMedia media={media} imageSizes={SIZES} text={DEFAULT_MESSAGES} />);
}

describe("buildSrcSet", () => {
  it("lists every file with its width", () => {
    const sources = [
      { url: "/wide-480.jpg", width: 480 },
      { url: "/wide-960.jpg", width: 960 },
    ];

    expect(buildSrcSet(sources)).toBe("/wide-480.jpg 480w, /wide-960.jpg 960w");
  });

  it("gives nothing when the server sent no other widths", () => {
    expect(buildSrcSet(undefined)).toBeUndefined();
    expect(buildSrcSet([])).toBeUndefined();
  });
});

describe("PostMedia: an image", () => {
  it("keeps the shape of the image before it loads, and loads it only near the screen", () => {
    renderMedia(IMAGE);

    const image = screen.getByRole("img", { name: "A lake" });
    expect((image.parentElement as HTMLElement).style.aspectRatio).toBe("1200 / 800");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("offers the browser the other widths, with the width of the picture on screen", () => {
    renderMedia({ ...IMAGE, sources: [{ url: "/wide-480.jpg", width: 480 }] });

    const image = screen.getByRole("img", { name: "A lake" });
    expect(image).toHaveAttribute("srcset", "/wide-480.jpg 480w");
    expect(image).toHaveAttribute("sizes", SIZES);
    // The plain address stays, for a browser that does not know `srcset`.
    expect(image).toHaveAttribute("src", "/wide.jpg");
  });

  it("sets no srcset and no sizes for an image with one file", () => {
    renderMedia(IMAGE);

    const image = screen.getByRole("img", { name: "A lake" });
    expect(image).not.toHaveAttribute("srcset");
    expect(image).not.toHaveAttribute("sizes");
  });
});

describe("PostMedia: a video", () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  let prefersReducedMotion: boolean;

  beforeEach(() => {
    FakeIntersectionObserver.install();
    prefersReducedMotion = false;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion") && prefersReducedMotion,
    }));
    // A real video sends "play" and "pause" events. The fakes do the same.
    play = vi.fn(function (this: HTMLVideoElement) {
      fireEvent.play(this);
      return Promise.resolve();
    });
    pause = vi.fn(function (this: HTMLVideoElement) {
      fireEvent.pause(this);
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function getVideo(): HTMLVideoElement {
    return screen.getByLabelText("A boat on the lake") as HTMLVideoElement;
  }

  /** Reports how much of the video is on screen. */
  function show(ratio: number) {
    act(() => FakeIntersectionObserver.live[0].triggerFor(getVideo(), ratio));
  }

  function setTabHidden(isHidden: boolean) {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(isHidden ? "hidden" : "visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }

  it("is muted, plays inline, downloads nothing before it plays, and keeps its shape", () => {
    renderMedia(VIDEO);

    const video = getVideo();
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("poster", "/clip.jpg");
    expect((video.parentElement as HTMLElement).style.aspectRatio).toBe("320 / 180");
  });

  it("does not play while it is not on screen", () => {
    renderMedia(VIDEO);

    expect(play).not.toHaveBeenCalled();
  });

  it("plays when at least half of it is on screen", () => {
    renderMedia(VIDEO);

    show(0.4);
    expect(play).not.toHaveBeenCalled();

    show(0.5);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("pauses when it leaves the screen", () => {
    renderMedia(VIDEO);
    show(1);

    show(0.2);

    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();
  });

  it("pauses when the tab is hidden, and plays again when the tab is shown", () => {
    renderMedia(VIDEO);
    show(1);

    setTabHidden(true);
    expect(pause).toHaveBeenCalled();

    setTabHidden(false);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("never plays by itself when the user asked for reduced motion", () => {
    prefersReducedMotion = true;
    renderMedia(VIDEO);

    show(1);

    expect(play).not.toHaveBeenCalled();
  });

  it("always shows a button, which plays the video also with reduced motion", () => {
    prefersReducedMotion = true;
    renderMedia(VIDEO);
    show(1);

    fireEvent.click(screen.getByRole("button", { name: "Play video" }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Pause video" })).toBeInTheDocument();
  });

  it("pauses from the button, and then does not start again by itself", () => {
    renderMedia(VIDEO);
    show(1);

    fireEvent.click(screen.getByRole("button", { name: "Pause video" }));
    show(0);
    show(1);

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();
  });

  it("starts by itself again after the user pressed play", () => {
    renderMedia(VIDEO);
    show(1);
    fireEvent.click(screen.getByRole("button", { name: "Pause video" }));
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));

    show(0);
    show(1);

    expect(play).toHaveBeenCalledTimes(3);
  });

  it("does not break when the browser refuses to play", async () => {
    play.mockImplementation(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    renderMedia(VIDEO);

    show(1);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();
  });

  it("pauses and stops watching when the post leaves the DOM", () => {
    const { unmount } = renderMedia(VIDEO);
    show(1);

    unmount();

    expect(pause).toHaveBeenCalled();
    expect(FakeIntersectionObserver.live).toHaveLength(0);
  });

  it("still shows the video and its button in a browser without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    renderMedia(VIDEO);
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));

    expect(play).toHaveBeenCalledTimes(1);
  });
});
