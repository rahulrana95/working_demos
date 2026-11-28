/*
 * NOT PART OF THE INTERVIEW.
 * A simulated video. The demo and the tests have no video file, and the test
 * browser (jsdom) cannot play one. So this file takes a real <video> element
 * and replaces the parts a player uses: `src`, `play()`, `pause()`,
 * `currentTime`, `duration`, `buffered`, `volume`, `textTracks` and the
 * media events.
 * Time moves by a timer, not by a decoder.
 *
 * The player does not know about it. It talks to the element in the normal
 * way, so the same player code works with a real video file.
 *
 * The events follow the order of a real element:
 *   load:   loadstart, durationchange, loadedmetadata, loadeddata, canplay
 *   play:   play, then playing (or waiting first, when there is no data yet)
 *   pause:  pause.   End: timeupdate, pause, ended.
 *   seek:   seeking, timeupdate, seeked
 * Like a real element, it sends every event a moment after the call, not inside it.
 */

export interface SimulatedMediaOptions {
  durationSeconds?: number;
  /** How long the first load takes. */
  loadMs?: number;
  /** How often the clock moves and "timeupdate" fires. A browser uses 15 to 250 ms. */
  tickMs?: number;
  /** Seconds of video that are downloaded in one second. */
  downloadSpeed?: number;
  /** The download waits while this much video is ready in front of the current time. */
  maxBufferSeconds?: number;
  /**
   * The captions. A browser times the lines of a <track> file against a real
   * video. Here there is none, so the simulation does the timing.
   */
  cues?: SimulatedCue[];
}

export interface SimulatedCue {
  start: number;
  end: number;
  text: string;
}

export interface SimulatedMedia {
  /** While true, every load ends with an error. The code is a MediaError code, as for `failNow`. */
  setFailLoads: (fail: boolean, code?: 2 | 3 | 4) => void;
  /** While true, play() is rejected until the user has pressed something in the player. */
  setBlockAutoplay: (block: boolean) => void;
  /** The network gives no data for this long. A playing video shows "waiting". */
  stallFor: (ms: number) => void;
  /** The picture stands still for this long, but the element sends no "waiting". */
  freezeFor: (ms: number) => void;
  setDownloadSpeed: (secondsPerSecond: number) => void;
  /** Breaks the video now, with a MediaError code: 2 network, 3 decode, 4 not supported. */
  failNow: (code: 2 | 3 | 4) => void;
  /** Stops the timers and listeners. */
  stop: () => void;
}

type Range = [start: number, end: number];

/** A playing video needs this much downloaded video in front of it. */
const MIN_AHEAD_SECONDS = 0.5;
const GESTURE_EVENTS = ["keydown", "pointerdown", "click"];

export function simulateMedia(
  video: HTMLVideoElement,
  options: SimulatedMediaOptions = {},
): SimulatedMedia {
  const { durationSeconds = 60, loadMs = 400, tickMs = 250, cues = [] } = options;
  const { maxBufferSeconds = Infinity } = options;
  let downloadSpeed = options.downloadSpeed ?? 4;
  let src = "";
  let currentTime = 0;
  let duration = NaN;
  let paused = true;
  let ended = false;
  let volume = 1;
  let muted = false;
  let playbackRate = 1;
  let readyState = 0;
  let error: { code: number; message: string } | null = null;
  let ranges: Range[] = [];

  let failLoads = false;
  let failCode = 4;
  let isFrozen = false;
  let freezeTimer: ReturnType<typeof setTimeout> | undefined;
  let blockAutoplay = false;
  let userHasPressed = false;
  let isStalled = false;
  /** True while the clock moves. */
  let isAdvancing = false;
  let pendingPlays: { resolve: () => void; reject: (reason: DOMException) => void }[] = [];
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let isStopped = false;

  function emit(type: string) {
    // A real element queues its events. They never fire inside play() or pause().
    void Promise.resolve().then(() => {
      if (!isStopped) {
        video.dispatchEvent(new Event(type));
      }
    });
  }

  // One text track, like the TextTrack of a <track> element.
  let trackMode = "disabled";
  let activeCues: SimulatedCue[] = [];
  const track = Object.defineProperties(new EventTarget(), {
    mode: {
      get: () => trackMode,
      set(value: string) {
        trackMode = value;
        updateCues();
      },
    },
    activeCues: { get: () => activeCues },
  });

  /** Works out which captions belong to the current time. */
  function updateCues() {
    const nextCues =
      trackMode === "disabled"
        ? []
        : cues.filter((cue) => cue.start <= currentTime && currentTime < cue.end);
    const isSame =
      nextCues.length === activeCues.length && nextCues.every((cue, i) => cue === activeCues[i]);

    if (!isSame) {
      activeCues = nextCues;
      void Promise.resolve().then(() => {
        if (!isStopped) {
          track.dispatchEvent(new Event("cuechange"));
        }
      });
    }
  }

  function rangeAt(time: number): Range | undefined {
    return ranges.find(([start, end]) => start <= time && time <= end);
  }

  function hasDataAhead(): boolean {
    const range = rangeAt(currentTime);
    const needed = Math.min(MIN_AHEAD_SECONDS, duration - currentTime);
    // At the very end nothing more is needed.
    return needed <= 0 || (range !== undefined && range[1] - currentTime >= needed);
  }

  function settlePlays(rejection?: DOMException) {
    const plays = pendingPlays;
    pendingPlays = [];
    plays.forEach((play) => (rejection === undefined ? play.resolve() : play.reject(rejection)));
  }

  /** Starts or stops the clock, after anything that can change it. */
  function reconcile() {
    const canAdvance = !paused && readyState >= 3 && !isStalled && hasDataAhead();

    if (canAdvance && !isAdvancing) {
      isAdvancing = true;
      emit("playing");
      settlePlays();
    } else if (!canAdvance && isAdvancing) {
      isAdvancing = false;
      if (!paused) {
        emit("waiting");
      }
    }
  }

  /** Downloads a little more of the range that holds the current time. */
  function download() {
    if (isStalled) {
      return;
    }
    let range = rangeAt(currentTime);
    if (range === undefined) {
      range = [currentTime, currentTime];
      ranges.push(range);
      ranges.sort((a, b) => a[0] - b[0]);
    }
    if (range[1] >= duration || range[1] - currentTime >= maxBufferSeconds) {
      return;
    }

    range[1] = Math.min(duration, range[1] + (downloadSpeed * tickMs) / 1000);
    // When this range reaches the next one, they become one range.
    const next = ranges[ranges.indexOf(range) + 1];
    if (next !== undefined && range[1] >= next[0]) {
      range[1] = Math.max(range[1], next[1]);
      ranges.splice(ranges.indexOf(next), 1);
    }
    emit("progress");
  }

  function tick() {
    download();

    if (isAdvancing && !isFrozen) {
      currentTime = Math.min(duration, currentTime + (tickMs / 1000) * playbackRate);
      emit("timeupdate");
      updateCues();

      if (currentTime >= duration) {
        isAdvancing = false;
        ended = true;
        paused = true;
        emit("pause");
        emit("ended");
        return;
      }
    }
    reconcile();
  }

  function clearTimers() {
    clearTimeout(loadTimer);
    clearTimeout(stallTimer);
    clearTimeout(freezeTimer);
    clearInterval(tickTimer);
  }

  function load() {
    clearTimers();
    settlePlays(
      new DOMException("The play() request was interrupted by a new load.", "AbortError"),
    );
    if (currentTime !== 0) {
      // A real element also reports that a new load put the time back to 0.
      emit("timeupdate");
    }
    currentTime = 0;
    duration = NaN;
    paused = true;
    ended = false;
    readyState = 0;
    error = null;
    ranges = [];
    isAdvancing = false;
    isStalled = false;
    isFrozen = false;
    updateCues();

    if (src === "") {
      emit("emptied");
      return;
    }

    emit("loadstart");
    loadTimer = setTimeout(() => {
      if (failLoads) {
        error = { code: failCode, message: "Simulated: the source could not be loaded." };
        settlePlays(new DOMException("The source could not be loaded.", "NotSupportedError"));
        emit("error");
        return;
      }

      duration = durationSeconds;
      readyState = 4;
      ["durationchange", "loadedmetadata", "loadeddata"].forEach(emit);
      download();
      emit("canplay");
      tickTimer = setInterval(tick, tickMs);
      // The clock starts after the events above have been heard. A player
      // that seeks in "loadedmetadata" then starts at its new place, as in a browser.
      void Promise.resolve().then(() => {
        if (!isStopped && readyState >= 3) {
          reconcile();
        }
      });
    }, loadMs);
  }

  function play(): Promise<void> {
    if (blockAutoplay && !userHasPressed) {
      return Promise.reject(
        new DOMException(
          "play() failed because the user didn't interact first.",
          "NotAllowedError",
        ),
      );
    }
    if (error !== null || src === "") {
      return Promise.reject(new DOMException("There is no supported source.", "NotSupportedError"));
    }

    const promise = new Promise<void>((resolve, reject) => pendingPlays.push({ resolve, reject }));

    if (ended) {
      // Playing a video that has ended starts it from the beginning.
      seek(0);
    }
    if (paused) {
      paused = false;
      emit("play");
      if (readyState >= 3 && (isStalled || !hasDataAhead())) {
        emit("waiting");
      }
    }
    if (isAdvancing) {
      settlePlays();
    }
    reconcile();
    return promise;
  }

  function pause() {
    if (paused) {
      return;
    }
    paused = true;
    isAdvancing = false;
    settlePlays(new DOMException("The play() request was interrupted by pause().", "AbortError"));
    emit("timeupdate");
    emit("pause");
  }

  function seek(time: number) {
    if (readyState === 0) {
      return;
    }
    currentTime = Math.min(Math.max(time, 0), duration);
    ended = false;
    ["seeking", "timeupdate", "seeked"].forEach(emit);
    updateCues();
    reconcile();
  }

  function setVolume(nextVolume: number, nextMuted: boolean) {
    if (nextVolume !== volume || nextMuted !== muted) {
      volume = nextVolume;
      muted = nextMuted;
      emit("volumechange");
    }
  }

  // A press inside the player counts as "the user interacted". A browser
  // then allows play(). We listen in the capture phase, so we know about the
  // press before the player's own handler calls play().
  function handleGesture(event: Event) {
    if (video.parentElement?.contains(event.target as Node)) {
      userHasPressed = true;
    }
  }
  GESTURE_EVENTS.forEach((type) => document.addEventListener(type, handleGesture, true));

  const buffered = {
    get length() {
      return ranges.length;
    },
    start: (index: number) => ranges[index][0],
    end: (index: number) => ranges[index][1],
  };

  const properties: Record<string, PropertyDescriptor> = {
    src: {
      get: () => src,
      set(value: string) {
        src = value;
        load();
      },
    },
    currentTime: { get: () => currentTime, set: seek },
    duration: { get: () => duration },
    paused: { get: () => paused },
    ended: { get: () => ended },
    readyState: { get: () => readyState },
    error: { get: () => error },
    buffered: { get: () => buffered },
    // There is a text track only when the player has put a <track> in the video.
    textTracks: { get: () => (video.querySelector("track") === null ? [] : [track]) },
    volume: { get: () => volume, set: (value: number) => setVolume(value, muted) },
    muted: { get: () => muted, set: (value: boolean) => setVolume(volume, value) },
    playbackRate: {
      get: () => playbackRate,
      set(value: number) {
        playbackRate = value;
        emit("ratechange");
      },
    },
    play: { value: play },
    pause: { value: pause },
    load: { value: load },
    removeAttribute: {
      value(name: string) {
        if (name === "src") {
          src = "";
        } else {
          HTMLElement.prototype.removeAttribute.call(video, name);
        }
      },
    },
  };
  Object.entries(properties).forEach(([name, descriptor]) =>
    Object.defineProperty(video, name, { configurable: true, ...descriptor }),
  );

  return {
    setFailLoads(fail, code = 4) {
      failLoads = fail;
      failCode = code;
    },
    freezeFor(ms) {
      isFrozen = true;
      clearTimeout(freezeTimer);
      freezeTimer = setTimeout(() => {
        isFrozen = false;
      }, ms);
    },
    setBlockAutoplay(block) {
      blockAutoplay = block;
    },
    setDownloadSpeed(secondsPerSecond) {
      downloadSpeed = secondsPerSecond;
    },
    stallFor(ms) {
      isStalled = true;
      reconcile();
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        isStalled = false;
        if (readyState >= 3) {
          emit("canplay");
        }
        reconcile();
      }, ms);
    },
    failNow(code) {
      clearTimers();
      isAdvancing = false;
      error = { code, message: "Simulated failure." };
      settlePlays(new DOMException("The video failed.", "NotSupportedError"));
      emit("error");
    },
    stop() {
      isStopped = true;
      clearTimers();
      GESTURE_EVENTS.forEach((type) => document.removeEventListener(type, handleGesture, true));
    },
  };
}
