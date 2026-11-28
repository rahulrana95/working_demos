/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the player with a simulated video, switches that
 * make things go wrong, a simulated network for the quality decision, and a
 * panel with what the player is doing.
 */
import { useEffect, useRef, useState } from "react";
import { countRenders, countSeekBarUpdates, debugInfo, logMediaEvents } from "./demo/debug";
import { startPicture } from "./demo/picture";
import { CUES, HINDI_MESSAGES, LEVELS, toWebVtt } from "./demo/qualityDemo";
import { SimulatedStage } from "./demo/SimulatedStage";
import type { SimulatedMedia } from "./demo/simulatedMedia";
import { Player, chooseQuality } from "./player";

const CountedPlayer = countRenders(Player);
const PANEL_REFRESH_MS = 250;
const STALL_MS = 3000;
// "?tick=15" in the address makes the simulated video send "timeupdate" every
// 15 ms, the fastest a browser does. The default is every 250 ms, the slowest.
const TICK_MS = Number(new URLSearchParams(window.location.search).get("tick")) || 250;

const QUALITY_CHECK_MS = 1000;
const START_SPEED_KBPS = 4000;
// The captions as a file in memory. The <track> element loads it without the network.
const CAPTIONS_URL = URL.createObjectURL(new Blob([toWebVtt(CUES)], { type: "text/vtt" }));

/** Seconds of video that are downloaded in front of the current time. */
function bufferAhead(video: HTMLVideoElement): number {
  for (let index = 0; index < video.buffered.length; index++) {
    if (video.buffered.start(index) <= video.currentTime) {
      return Math.max(0, video.buffered.end(index) - video.currentTime);
    }
  }
  return 0;
}

/**
 * A simulated streaming engine, as far as the quality decision needs one.
 * Once a second it measures the buffer and asks `chooseQuality` for a level.
 * A higher level needs more kilobits for one second of video, so at the same
 * network speed it downloads more slowly. No real segment is loaded.
 */
function QualityPanel({ getMedia }: { getMedia: () => SimulatedMedia | null }) {
  const [speedKbps, setSpeedKbps] = useState(START_SPEED_KBPS);
  const [levelIndex, setLevelIndex] = useState(0);
  const [bufferSeconds, setBufferSeconds] = useState(0);

  useEffect(() => {
    const timerId = setInterval(() => {
      const video = document.querySelector("video");
      if (video === null) {
        return;
      }
      const buffer = bufferAhead(video);
      setBufferSeconds(buffer);
      setLevelIndex((current) => chooseQuality(LEVELS, speedKbps, buffer, current));
    }, QUALITY_CHECK_MS);
    return () => clearInterval(timerId);
  }, [speedKbps]);

  useEffect(() => {
    getMedia()?.setDownloadSpeed(speedKbps / LEVELS[levelIndex].kbps);
  }, [getMedia, speedKbps, levelIndex]);

  useEffect(() => {
    debugInfo.events.push(`quality: ${LEVELS[levelIndex].height}p`);
  }, [levelIndex]);

  return (
    <>
      <label>
        Network speed: <strong>{speedKbps} kbps</strong>
        <input
          type="range"
          className="panel__speed"
          min={200}
          max={8000}
          step={100}
          value={speedKbps}
          onChange={(event) => setSpeedKbps(Number(event.target.value))}
        />
      </label>
      <p>
        <strong>Quality chosen:</strong>{" "}
        <span data-testid="quality">
          {LEVELS[levelIndex].height}p ({LEVELS[levelIndex].kbps} kbps)
        </span>
        . <strong>Buffer:</strong> {bufferSeconds.toFixed(0)} seconds.
      </p>
    </>
  );
}

/** Reads the numbers of the player a few times a second and shows them. */
function DebugPanel() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timerId = setInterval(() => setTick((tick) => tick + 1), PANEL_REFRESH_MS);
    return () => clearInterval(timerId);
  }, []);

  const status = document.querySelector<HTMLElement>(".player")?.dataset.status ?? "";

  return (
    <>
      <p>
        <strong>State:</strong> <span data-testid="state">{status}</span>
      </p>
      <p>
        <strong>React drew the whole player:</strong>{" "}
        <span data-testid="player-renders">{debugInfo.playerRenders}</span> times.{" "}
        <strong>The seek bar changed on the page:</strong>{" "}
        <span data-testid="seek-bar-updates">{debugInfo.seekBarUpdates}</span> times, for{" "}
        <span data-testid="time-updates">{debugInfo.timeUpdates}</span> “timeupdate” events.
      </p>
      <p>
        <strong>Media events received:</strong>
      </p>
      <ol className="panel__log" data-testid="events">
        {debugInfo.events.slice(-12).map((type, index) => (
          <li key={index}>{type}</li>
        ))}
      </ol>
    </>
  );
}

export function App() {
  const [failToLoad, setFailToLoad] = useState(false);
  const [blockAutoplay, setBlockAutoplay] = useState(false);
  const [isHindi, setIsHindi] = useState(false);
  // A new key removes the player and makes a new one, like opening the page again.
  const [playerKey, setPlayerKey] = useState(0);
  const mediaRef = useRef<SimulatedMedia | null>(null);
  const stopDemoPartsRef = useRef<() => void>(() => undefined);

  // The switches are read when a new simulated video is made, and when they change.
  const switchesRef = useRef({ failToLoad, blockAutoplay });
  useEffect(() => {
    switchesRef.current = { failToLoad, blockAutoplay };
    mediaRef.current?.setFailLoads(failToLoad);
    mediaRef.current?.setBlockAutoplay(blockAutoplay);
  }, [failToLoad, blockAutoplay]);

  // Created once, so the quality panel does not start again on every drawing.
  const [getMedia] = useState(() => () => mediaRef.current);

  function handleMedia(media: SimulatedMedia, video: HTMLVideoElement) {
    mediaRef.current = media;
    media.setFailLoads(switchesRef.current.failToLoad);
    media.setBlockAutoplay(switchesRef.current.blockAutoplay);
    logMediaEvents(video);
    stopDemoPartsRef.current();
    const stopPicture = startPicture(video);
    // The player is the parent of the video element.
    const stopCounting = video.parentElement ? countSeekBarUpdates(video.parentElement) : undefined;
    stopDemoPartsRef.current = () => {
      stopPicture();
      stopCounting?.();
    };
  }

  return (
    <main className="page">
      <h1>Chapter 11: Video player (60 minutes)</h1>
      <p className="page__intro">
        Click the player or press <kbd>Tab</kbd> to focus it. Then use <kbd>Space</kbd> or{" "}
        <kbd>K</kbd> to play and pause, <kbd>←</kbd> and <kbd>→</kbd> to move 5 seconds,{" "}
        <kbd>↑</kbd> and <kbd>↓</kbd> for the volume, <kbd>M</kbd> to mute, <kbd>Home</kbd> and{" "}
        <kbd>End</kbd>. The video is simulated: no file is downloaded.
      </p>

      <SimulatedStage
        key={playerKey}
        options={{ tickMs: TICK_MS, cues: CUES, durationSeconds: 300, maxBufferSeconds: 30 }}
        onMedia={handleMedia}
      >
        <CountedPlayer
          src="simulated-video.mp4"
          title="Demo video"
          autoPlay
          captionsSrc={CAPTIONS_URL}
          locale={isHindi ? "hi" : "en"}
          messages={isHindi ? HINDI_MESSAGES : undefined}
        />
      </SimulatedStage>

      <section className="panel" aria-label="What is happening">
        <button
          type="button"
          className="panel__button"
          onClick={() => mediaRef.current?.stallFor(STALL_MS)}
        >
          Buffer for 3 seconds
        </button>
        <button
          type="button"
          className="panel__button"
          onClick={() => setPlayerKey((key) => key + 1)}
        >
          Load the player again
        </button>
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={failToLoad}
            onChange={(event) => setFailToLoad(event.target.checked)}
          />
          Fail to load
        </label>
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={blockAutoplay}
            onChange={(event) => setBlockAutoplay(event.target.checked)}
          />
          Block autoplay
        </label>

        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isHindi}
            onChange={(event) => setIsHindi(event.target.checked)}
          />
          Hindi texts
        </label>

        <QualityPanel getMedia={getMedia} />
        <DebugPanel />

        <p className="panel__hint">
          The player asks to start by itself (autoplay). Tick “Block autoplay” and press “Load the
          player again”: the request is refused, and the player waits with its Play button. While
          the video plays, the first counter stands still and the second one goes up. Pull the
          network speed down: the quality waits while the buffer is full, then drops. Push it up
          again: the quality climbs one level at a time.
        </p>
      </section>
    </main>
  );
}
