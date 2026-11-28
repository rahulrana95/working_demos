/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the player with a simulated video, three switches
 * that make things go wrong, and a panel with what the player is doing.
 */
import { useEffect, useRef, useState } from "react";
import { countRenders, countSeekBarUpdates, debugInfo, logMediaEvents } from "./demo/debug";
import { startPicture } from "./demo/picture";
import { SimulatedStage } from "./demo/SimulatedStage";
import type { SimulatedMedia } from "./demo/simulatedMedia";
import { Player } from "./player";

const CountedPlayer = countRenders(Player);
const PANEL_REFRESH_MS = 250;
const STALL_MS = 3000;
// "?tick=15" in the address makes the simulated video send "timeupdate" every
// 15 ms, the fastest a browser does. The default is every 250 ms, the slowest.
const TICK_MS = Number(new URLSearchParams(window.location.search).get("tick")) || 250;

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
      <h1>Chapter 11: Video player</h1>
      <p className="page__intro">
        Click the player or press <kbd>Tab</kbd> to focus it. Then use <kbd>Space</kbd> or{" "}
        <kbd>K</kbd> to play and pause, <kbd>←</kbd> and <kbd>→</kbd> to move 5 seconds,{" "}
        <kbd>↑</kbd> and <kbd>↓</kbd> for the volume, <kbd>M</kbd> to mute, <kbd>Home</kbd> and{" "}
        <kbd>End</kbd>. The video is simulated: no file is downloaded.
      </p>

      <SimulatedStage key={playerKey} options={{ tickMs: TICK_MS }} onMedia={handleMedia}>
        <CountedPlayer src="simulated-video.mp4" title="Demo video" autoPlay />
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

        <DebugPanel />

        <p className="panel__hint">
          The player asks to start by itself (autoplay). Tick “Block autoplay” and press “Load the
          player again”: the request is refused, and the player waits with its Play button. While
          the video plays, the first counter stands still and the second one goes up.
        </p>
      </section>
    </main>
  );
}
