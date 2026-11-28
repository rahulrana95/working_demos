/*
 * NOT PART OF THE INTERVIEW: production version.
 * The same state machine as the interview answers, with three additions:
 *   1. An error has a kind. A network error is tried again a few times by
 *      itself before the user sees an error.
 *   2. The downloaded ranges are part of the state, so the seek bar can draw them.
 *   3. "stalled": the picture stands still although the element says it plays.
 *
 * Why it holds at scale: the reducer is pure and has no browser code, so every
 * transition is a one-line test. An event that is not in the table for the
 * current state changes nothing, so a late or repeated media event can never
 * put the player in a state that does not exist.
 */

export type PlayerStatus =
  | "idle" // no source yet, or `preload="none"` and the user has not pressed Play
  | "loading" // a source is set, we cannot play yet
  | "ready" // can play, has not played yet
  | "playing"
  | "paused"
  | "buffering" // the user wants to play, the picture is not moving
  | "ended"
  | "error";

/** Why the video failed. Each kind has its own message, and only "network" is tried again by itself. */
export type ErrorKind = "network" | "decode" | "unsupported";

/** One downloaded part of the video, in seconds. */
export type BufferedRange = readonly [start: number, end: number];

export interface PlayerState {
  status: PlayerStatus;
  /** Seconds. The video element owns the time. This is a copy of it. */
  currentTime: number;
  duration: number;
  buffered: readonly BufferedRange[];
  /** Set only when the status is "error". */
  errorKind: ErrorKind | null;
  /** How many times we loaded the source again by ourselves after a network error. */
  retries: number;
  /** True while we are buffering because the stall detector said so, not the element. */
  isStalled: boolean;
  playbackRate: number;
}

/** Events of the video element that carry no data. The controller listens to each of them. */
export const MEDIA_SIGNALS = ["canplay", "playing", "pause", "waiting", "ended"] as const;

/**
 * "load" is sent by the controller when it gives the engine a source.
 * "stalled" comes from the stall detector. The other three come from the
 * user. A pause by the user is not here: it arrives as the "pause" of the element.
 */
type RequestSignal = "load" | "play" | "play_rejected" | "retry" | "stalled";

export type PlayerEvent =
  | { type: (typeof MEDIA_SIGNALS)[number] | RequestSignal }
  | { type: "loadedmetadata"; duration: number }
  | { type: "timeupdate"; currentTime: number }
  | { type: "progress"; buffered: readonly BufferedRange[] }
  | { type: "ratechange"; playbackRate: number }
  | { type: "seek"; time: number }
  | { type: "error"; kind: ErrorKind };

export const INITIAL_STATE: PlayerState = {
  status: "idle",
  currentTime: 0,
  duration: 0,
  buffered: [],
  errorKind: null,
  retries: 0,
  isStalled: false,
  playbackRate: 1,
};

/** After this many tries by ourselves, a network error is shown to the user. */
export const MAX_AUTO_RETRIES = 3;

type Transitions = Partial<Record<PlayerEvent["type"], PlayerStatus>>;

/**
 * The state machine. A missing entry means: this event changes nothing here.
 * "load" is not in the table, because it leads to "loading" from every state.
 * "error" leads to "error", or back to "loading" when we try again by ourselves.
 */
export const TRANSITIONS: Record<PlayerStatus, Transitions> = {
  idle: {},
  loading: { canplay: "ready", playing: "playing", error: "error" },
  ready: { play: "buffering", playing: "playing", error: "error" },
  playing: {
    pause: "paused",
    waiting: "buffering",
    stalled: "buffering",
    ended: "ended",
    error: "error",
  },
  // The element sends "pause" just before "ended", so "ended" can arrive here.
  paused: { play: "buffering", playing: "playing", ended: "ended", error: "error" },
  buffering: {
    playing: "playing",
    pause: "paused",
    play_rejected: "paused",
    ended: "ended",
    error: "error",
  },
  ended: { play: "buffering", playing: "playing", seek: "paused", error: "error" },
  error: { retry: "loading" },
};

/** True when the user wants the video to move, whether it moves or not. */
export function wantsToPlay(status: PlayerStatus): boolean {
  return status === "playing" || status === "buffering";
}

/**
 * How long to wait before try number `retry` (1, 2, 3...) after a network
 * error: 1, 2, 4 seconds, at most 8. `random` (from 0 to 1) takes off up to a
 * quarter, so that many players that lost the network at the same moment do
 * not all come back at the same moment.
 */
export function backoffMs(retry: number, random: number): number {
  const base = Math.min(1000 * 2 ** (retry - 1), 8000);
  return Math.round(base * (1 - random / 4));
}

export function reducePlayer(state: PlayerState, event: PlayerEvent): PlayerState {
  const status = TRANSITIONS[state.status][event.type] ?? state.status;
  const hasMedia = state.status !== "idle" && state.status !== "error";

  switch (event.type) {
    case "load":
      // A new source starts from zero, whatever the player was doing.
      return { ...INITIAL_STATE, status: "loading", playbackRate: state.playbackRate };
    case "ratechange":
      return { ...state, playbackRate: event.playbackRate };
    case "loadedmetadata":
      // A live stream reports Infinity. This player is for videos with an end.
      return hasMedia
        ? { ...state, duration: Number.isFinite(event.duration) ? event.duration : 0 }
        : state;
    case "timeupdate":
      // While a source loads again after an error, the element reports time 0.
      // The place of the user stays on the seek bar until the video is back there.
      if (!hasMedia || (state.status === "loading" && event.currentTime < state.currentTime)) {
        return state;
      }
      // The picture moves again after a stall that only the detector saw.
      return state.isStalled &&
        state.status === "buffering" &&
        event.currentTime > state.currentTime
        ? { ...state, status: "playing", isStalled: false, currentTime: event.currentTime }
        : { ...state, currentTime: event.currentTime };
    case "progress":
      return hasMedia ? { ...state, buffered: event.buffered } : state;
    case "seek":
      // Before "canplay" there is nothing to seek in.
      return hasMedia && state.status !== "loading"
        ? { ...state, status, currentTime: Math.min(Math.max(event.time, 0), state.duration) }
        : state;
    case "ended":
      return status === state.status
        ? state
        : { ...state, status, isStalled: false, currentTime: state.duration };
    case "error":
      if (!hasMedia) {
        return state;
      }
      // A network error is tried again by ourselves. The time and the duration stay,
      // so the seek bar does not jump to zero while we load the source again.
      return event.kind === "network" && state.retries < MAX_AUTO_RETRIES
        ? { ...state, status: "loading", isStalled: false, retries: state.retries + 1 }
        : { ...state, status: "error", isStalled: false, errorKind: event.kind };
    case "retry":
      // The user asked. The count of our own tries starts again.
      return status === state.status ? state : { ...state, status, errorKind: null, retries: 0 };
    case "stalled":
      return status === state.status ? state : { ...state, status, isStalled: true };
    case "playing":
      // Playing again: the source works, so the next network error gets all its tries.
      return status === state.status ? state : { ...state, status, isStalled: false, retries: 0 };
    default:
      // Returning the same object tells the store that nothing changed.
      return status === state.status ? state : { ...state, status, isStalled: false };
  }
}
