/*
 * NOT PART OF THE INTERVIEW.
 * The demo page of the production version. It shows the player with a
 * simulated video and a fake streaming engine, switches that make things go
 * wrong, and a panel with the state, the playback quality events and how
 * often React draws the player.
 */
import { useEffect, useRef, useState } from "react";
import { countRenders, countSeekBarUpdates, debugInfo, logMediaEvents } from "./demo/debug";
import { createFakeEngine } from "./demo/fakeEngine";
import { startPicture } from "./demo/picture";
import { CUES, HINDI_MESSAGES, LEVELS, toWebVtt } from "./demo/qualityDemo";
import { SimulatedStage } from "./demo/SimulatedStage";
import type { SimulatedMedia } from "./demo/simulatedMedia";
import { Player } from "./player";
import type { PlayerMetricEvent } from "./player";

const CountedPlayer = countRenders(Player);
const PANEL_REFRESH_MS = 250;
const STALL_MS = 3000;
const FREEZE_MS = 9000;
const START_SPEED_KBPS = 4000;
// "?tick=15" in the address makes the simulated video send "timeupdate" every
// 15 ms, the fastest a browser does. The default is every 250 ms, the slowest.
const TICK_MS = Number(new URLSearchParams(window.location.search).get("tick")) || 250;
// The captions as a file in memory. The <track> element loads it without the network.
const CAPTIONS_URL = URL.createObjectURL(new Blob([toWebVtt(CUES)], { type: "text/vtt" }));

/** The playback quality events, as the monitoring of a team would receive them. */
const metricLog: string[] = [];
function logMetric(event: PlayerMetricEvent) {
  metricLog.push(JSON.stringify(event));
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
        <strong>Playback quality events (onEvent):</strong>
      </p>
      <ol className="panel__log" data-testid="metrics">
        {metricLog.slice(-8).map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ol>
      <p>
        <strong>Media events received:</strong>
      </p>
      <ol className="panel__log" data-testid="events">
        {debugInfo.events.slice(-8).map((type, index) => (
          <li key={index}>{type}</li>
        ))}
      </ol>
    </>
  );
}

export function App() {
  const [failToLoad, setFailToLoad] = useState(false);
  const [networkIsDown, setNetworkIsDown] = useState(false);
  const [blockAutoplay, setBlockAutoplay] = useState(false);
  const [isHindi, setIsHindi] = useState(false);
  const [speedKbps, setSpeedKbps] = useState(START_SPEED_KBPS);
  // A new key removes the player and makes a new one, like opening the page again.
  const [playerKey, setPlayerKey] = useState(0);
  const mediaRef = useRef<SimulatedMedia | null>(null);
  const stopDemoPartsRef = useRef<() => void>(() => undefined);

  // The engine reads the speed when it decides, so it gets the latest value from a ref.
  const speedRef = useRef(speedKbps);
  useEffect(() => {
    speedRef.current = speedKbps;
  }, [speedKbps]);

  // Made once. A new engine on every drawing would load the video again each time.
  const [engine] = useState(() =>
    createFakeEngine({
      levels: LEVELS,
      getSpeedKbps: () => speedRef.current,
      getMedia: () => mediaRef.current,
    }),
  );

  // "Fail to load" is a file the browser cannot use (code 4). "The network is
  // down" is a network error (code 2), which the player tries again by itself.
  function applySwitches(media: SimulatedMedia | null) {
    media?.setFailLoads(failToLoad || networkIsDown, failToLoad ? 4 : 2);
    media?.setBlockAutoplay(blockAutoplay);
  }
  const applySwitchesRef = useRef(applySwitches);
  useEffect(() => {
    applySwitchesRef.current = applySwitches;
    applySwitches(mediaRef.current);
  });

  function handleMedia(media: SimulatedMedia, video: HTMLVideoElement) {
    mediaRef.current = media;
    applySwitchesRef.current(media);
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
      <h1>Chapter 11: Video player (production)</h1>
      <p className="page__intro">
        Click the player or press <kbd>Tab</kbd> to focus it. Press <kbd>?</kbd> for the list of
        keyboard shortcuts. The video is simulated: no file is downloaded.
      </p>

      <SimulatedStage
        key={playerKey}
        options={{ tickMs: TICK_MS, cues: CUES, durationSeconds: 300, maxBufferSeconds: 30 }}
        onMedia={handleMedia}
      >
        <CountedPlayer
          src="simulated-video.mp4"
          title="Demo video"
          videoId="demo-video"
          autoPlay
          engine={engine}
          captionsSrc={CAPTIONS_URL}
          locale={isHindi ? "hi" : "en"}
          messages={isHindi ? HINDI_MESSAGES : undefined}
          onEvent={logMetric}
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
          onClick={() => mediaRef.current?.freezeFor(FREEZE_MS)}
        >
          Freeze the picture for 9 seconds
        </button>
        <button
          type="button"
          className="panel__button"
          onClick={() => mediaRef.current?.failNow(2)}
        >
          Network error now
        </button>
        <button
          type="button"
          className="panel__button"
          onClick={() => mediaRef.current?.failNow(3)}
        >
          Decode error now
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
            checked={networkIsDown}
            onChange={(event) => setNetworkIsDown(event.target.checked)}
          />
          The network is down (every load fails with a network error)
        </label>
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={failToLoad}
            onChange={(event) => setFailToLoad(event.target.checked)}
          />
          Fail to load (the file cannot be used)
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

        <DebugPanel />

        <p className="panel__hint">
          Press “Network error now”: the player waits, loads the video again by itself and goes on
          at the same second. Tick “The network is down” first, and after three tries it shows the
          error with “Try again”. Press “Freeze the picture”: the video element still says it plays,
          and after 5 seconds the stall detector shows the spinner. Load the page again in the
          middle of the video: it goes on where you were.
        </p>
      </section>
    </main>
  );
}
