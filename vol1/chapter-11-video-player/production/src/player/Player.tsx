/*
 * NOT PART OF THE INTERVIEW: production version.
 * The player a team ships. It keeps the structure of the interview answers:
 * this component reads the status from the store and never the time, so it
 * is not drawn again while the video plays.
 *
 * What it adds on top of the 60-minute answer is listed in the README.
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { createNativeEngine } from "./engine";
import type { StreamingEngine } from "./engine";
import { connectMediaSession } from "./mediaSession";
import { DEFAULT_MESSAGES } from "./messages";
import type { PlayerMessages } from "./messages";
import type { PlayerMetricEvent } from "./metrics";
import { PlayerErrorBoundary } from "./PlayerErrorBoundary";
import { MAX_AUTO_RETRIES, wantsToPlay } from "./playerMachine";
import { QualityMenu } from "./QualityMenu";
import { useFullscreen, usePictureInPicture } from "./screenModes";
import { SEEK_STEP_SECONDS, SeekBar } from "./SeekBar";
import { ShortcutHelp } from "./ShortcutHelp";
import { controlOwnsKey } from "./shortcuts";
import { loadSettings, saveSettings } from "./storage";
import { usePlayerValue } from "./store";
import { useCaptions } from "./useCaptions";
import { useIdle } from "./useIdle";
import { usePlayer } from "./usePlayer";

/**
 * How much the browser may download before the user presses Play.
 *   "none":     nothing. No data is used for a video nobody starts.
 *   "metadata": the length and the first picture. A few hundred kilobytes
 *               at most for a file; the list of segments for a stream.
 *   "auto":     as much as the browser likes. The fastest start, and the
 *               most data used for a video that may never be played.
 */
export type Preload = "none" | "metadata" | "auto";

export interface PlayerProps {
  /** The address of the video. For a stream, the address the engine understands. */
  src: string;
  /** The name of the video. Screen readers read it as the name of the player. */
  title: string;
  /** Try to start at once. The browser may block it. Then the play button stays. */
  autoPlay?: boolean;
  /** A picture shown until the video starts. */
  poster?: string;
  /** Default: "metadata". A user who asked the browser to save data always gets "none". */
  preload?: Preload;
  /** The address of a WebVTT file with the captions. Without it there is no captions button. */
  captionsSrc?: string;
  /**
   * The streaming engine. Default: the browser plays `src` as one file.
   * Create the engine once, outside the render, or the video loads again on every drawing.
   */
  engine?: StreamingEngine;
  /** With an id, the player remembers the place in this video on this device. */
  videoId?: string;
  /** The language of the captions, the spoken time and the numbers, for example "en" or "hi". */
  locale?: string;
  /** Replace any text to translate the player. */
  messages?: Partial<PlayerMessages>;
  /** Playback quality events, for monitoring. They never hold the address or title of the video. */
  onEvent?: (event: PlayerMetricEvent) => void;
  /** How long the picture may stand still while "playing" before the player shows buffering. */
  stallTimeoutMs?: number;
}

const VOLUME_STEP = 0.1;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const CAPTION_SCALES = [0.75, 1, 1.5, 2];
const DEFAULT_STALL_TIMEOUT_MS = 5000;

/** `navigator.connection` is not in every browser, and not in the TypeScript types. */
function userSavesData(): boolean {
  const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
  return connection?.saveData === true;
}

/** The player, inside a boundary that keeps a failure of the player away from the page. */
export function Player(props: PlayerProps) {
  const messages = { ...DEFAULT_MESSAGES, ...props.messages };

  return (
    <PlayerErrorBoundary
      crashedText={messages.crashed}
      reloadText={messages.reload}
      onEvent={props.onEvent}
    >
      <PlayerView {...props} />
    </PlayerErrorBoundary>
  );
}

function PlayerView(props: PlayerProps) {
  const { src, title, poster, captionsSrc, videoId, locale = "en", onEvent } = props;
  const { stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS } = props;
  const messages = { ...DEFAULT_MESSAGES, ...props.messages };

  // Read once: these do not change while the page is open.
  const [savesData] = useState(userSavesData);
  const [ownEngine] = useState(createNativeEngine);
  const engine = props.engine ?? ownEngine;
  const preload: Preload = savesData ? "none" : (props.preload ?? "metadata");
  const autoPlay = props.autoPlay === true && !savesData;

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const { store, actions } = usePlayer(videoRef, {
    src,
    engine,
    autoPlay,
    loadAtOnce: preload !== "none" || autoPlay,
    videoId,
    stallTimeoutMs,
    onEvent,
  });
  const status = usePlayerValue(store, (state) => state.status);
  const errorKind = usePlayerValue(store, (state) => state.errorKind);
  const retries = usePlayerValue(store, (state) => state.retries);
  const playbackRate = usePlayerValue(store, (state) => state.playbackRate);

  // The sound and the captions are remembered from the last visit.
  const [settings, setSettings] = useState(loadSettings);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const captionText = useCaptions(videoRef, captionsSrc, settings.captionsOn);
  const fullscreen = useFullscreen(rootRef, videoRef);
  const pictureInPicture = usePictureInPicture(videoRef);
  // The controls hide only while the video plays. They stay while it is
  // paused, buffering or broken, and while the help is open.
  const { isIdle, wake } = useIdle(status === "playing" && !isHelpOpen);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // The element owns the sound. We give it the remembered sound once, and
  // from then on we copy what its "volumechange" event reports.
  useEffect(() => {
    const video = videoRef.current;
    const stored = loadSettings();
    if (video !== null) {
      video.volume = stored.volume;
      video.muted = stored.muted;
    }
  }, []);

  useEffect(
    () => connectMediaSession(store, actions, title),
    // `store` and `actions` never change, so only a new title connects again.
    [store, actions, title],
  );

  /** Changes the sound on the element, which owns it. Its "volumechange" event updates our copy. */
  function changeSound(nextVolume: (volume: number) => number, toggleMuted = false) {
    const video = videoRef.current;
    if (video !== null) {
      video.volume = Math.min(Math.max(nextVolume(video.volume), 0), 1);
      // A change of the volume also switches the sound back on.
      video.muted = toggleMuted && !video.muted;
    }
  }
  const toggleMute = () => changeSound((volume) => volume, true);
  const toggleCaptions = () =>
    setSettings((current) => ({ ...current, captionsOn: !current.captionsOn }));

  function closeHelp() {
    setIsHelpOpen(false);
    // The focus goes back to where the user was before the dialog.
    helpButtonRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    wake();
    const hasModifier = event.altKey || event.ctrlKey || event.metaKey;
    if (hasModifier || controlOwnsKey(event.target as Element, event.key)) {
      return;
    }

    const { currentTime } = store.getState();
    const shortcuts: Record<string, () => void> = {
      " ": actions.togglePlay,
      k: actions.togglePlay,
      m: toggleMute,
      arrowleft: () => actions.seek(currentTime - SEEK_STEP_SECONDS),
      arrowright: () => actions.seek(currentTime + SEEK_STEP_SECONDS),
      arrowup: () => changeSound((volume) => volume + VOLUME_STEP),
      arrowdown: () => changeSound((volume) => volume - VOLUME_STEP),
      home: () => actions.seek(0),
      end: () => actions.seek(Infinity),
      c: () => captionsSrc !== undefined && toggleCaptions(),
      f: () => fullscreen.isSupported && fullscreen.toggle(),
      "?": () => setIsHelpOpen(true),
    };
    const shortcut = shortcuts[event.key.toLowerCase()];

    if (shortcut !== undefined) {
      // Stops Space and the arrows from scrolling the page.
      event.preventDefault();
      shortcut();
    }
  }

  function handleVideoClick() {
    // On a phone there is no mouse to move. The first tap on a video with
    // hidden controls only brings the controls back. It must not pause.
    if (isIdle) {
      wake();
    } else {
      actions.togglePlay();
    }
  }

  function handleRetry(event: MouseEvent<HTMLButtonElement>) {
    actions.retry();
    // The button is removed now. Without this, the keyboard focus would be lost.
    event.currentTarget.closest<HTMLElement>(".player")?.focus();
  }

  const errorText = {
    network: messages.errorNetwork,
    decode: messages.errorDecode,
    unsupported: messages.errorUnsupported,
  };
  const percentText = (part: number) =>
    new Intl.NumberFormat(locale, { style: "percent" }).format(part);
  const isRetrying = status === "loading" && retries > 0;

  return (
    // The shortcuts work only while the focus is inside this element.
    <div
      ref={rootRef}
      className="player"
      role="group"
      aria-label={title}
      aria-busy={status === "loading" || status === "buffering"}
      // The CSS draws a spinner for "loading" and "buffering", but only after 300 ms.
      data-status={status}
      // The CSS hides the controls for "idle", but never while one of them has the focus.
      data-idle={isIdle}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerMove={wake}
      onPointerDown={wake}
      onFocus={wake}
    >
      <video
        ref={videoRef}
        className="player__video"
        playsInline
        poster={poster}
        preload={preload}
        onClick={handleVideoClick}
        // The element owns the volume. We copy it when the element says it changed.
        onVolumeChange={({ currentTarget: { volume, muted } }) =>
          setSettings((current) => ({ ...current, volume, muted }))
        }
      >
        {captionsSrc !== undefined && <track kind="captions" src={captionsSrc} srcLang={locale} />}
      </video>
      {/* A status, not an alert: the player is still working on it. */}
      <p className="player__notice" role="status">
        {isRetrying ? messages.retrying(retries, MAX_AUTO_RETRIES) : ""}
      </p>

      {status === "error" && errorKind !== null && (
        <div className="player__error" role="alert">
          <p>{errorText[errorKind]}</p>
          <button type="button" onClick={handleRetry}>
            {messages.retry}
          </button>
        </div>
      )}

      {isHelpOpen && <ShortcutHelp messages={messages} onClose={closeHelp} />}

      <div className="player__bottom">
        {/* The CSS places the captions just above the bar of controls, whatever its height. */}
        {captionText !== "" && (
          <p
            className="player__captions"
            style={{ fontSize: `${settings.captionScale * 1.25}rem` }}
          >
            {captionText}
          </p>
        )}
        <div className="player__controls">
          <button type="button" onClick={actions.togglePlay}>
            {wantsToPlay(status) ? messages.pause : messages.play}
          </button>
          <SeekBar store={store} onSeek={actions.seek} messages={messages} locale={locale} />
          <button type="button" aria-pressed={settings.muted} onClick={toggleMute}>
            {messages.mute}
          </button>
          <input
            type="range"
            className="player__volume"
            aria-label={messages.volume}
            aria-valuetext={percentText(settings.volume)}
            // A range input goes from 0 to 100, the video element from 0 to 1.
            value={settings.volume * 100}
            onChange={(event) => changeSound(() => Number(event.target.value) / 100)}
          />
          {captionsSrc !== undefined && (
            <>
              <button type="button" aria-pressed={settings.captionsOn} onClick={toggleCaptions}>
                {messages.captions}
              </button>
              <select
                className="player__select"
                aria-label={messages.captionSize}
                value={settings.captionScale}
                onChange={({ target }) =>
                  setSettings((current) => ({ ...current, captionScale: Number(target.value) }))
                }
              >
                {CAPTION_SCALES.map((scale) => (
                  <option key={scale} value={scale}>
                    {percentText(scale)}
                  </option>
                ))}
              </select>
            </>
          )}
          <select
            className="player__select"
            aria-label={messages.speed}
            value={playbackRate}
            onChange={(event) => actions.setPlaybackRate(Number(event.target.value))}
          >
            {SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {new Intl.NumberFormat(locale).format(speed)}×
              </option>
            ))}
          </select>
          <QualityMenu engine={engine} messages={messages} />
          {pictureInPicture.isSupported && (
            <button
              type="button"
              aria-pressed={pictureInPicture.isActive}
              onClick={pictureInPicture.toggle}
            >
              {messages.pictureInPicture}
            </button>
          )}
          {fullscreen.isSupported && (
            <button type="button" aria-pressed={fullscreen.isActive} onClick={fullscreen.toggle}>
              {messages.fullscreen}
            </button>
          )}
          <button
            type="button"
            ref={helpButtonRef}
            aria-label={messages.help}
            aria-haspopup="dialog"
            onClick={() => setIsHelpOpen(true)}
          >
            ?
          </button>
        </div>
      </div>
    </div>
  );
}
