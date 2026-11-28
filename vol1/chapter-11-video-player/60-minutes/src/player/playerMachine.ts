/*
 * PART OF THE INTERVIEW: yes (about 10 minutes).
 * Write this file first. It is the centre of the answer: the player is in
 * exactly one state, and one table says which event moves it to which state.
 *
 * Why it holds at scale: the reducer is pure and has no browser code, so every
 * transition is a one-line test. An event that is not in the table for the
 * current state changes nothing, so a late or repeated media event can never
 * put the player in a state that does not exist.
 */

export type PlayerStatus =
  | "idle" // no source yet
  | "loading" // a source is set, we cannot play yet
  | "ready" // can play, has not played yet
  | "playing"
  | "paused"
  | "buffering" // the user wants to play, the picture is not moving
  | "ended"
  | "error";

export interface PlayerState {
  status: PlayerStatus;
  /** Seconds. The video element owns the time. This is a copy of it. */
  currentTime: number;
  duration: number;
}

/** Events of the video element that carry no data. The hook listens to each of them. */
export const MEDIA_SIGNALS = ["canplay", "playing", "pause", "waiting", "ended", "error"] as const;

/**
 * "load" is sent by the hook when it gives the element a source. The other
 * three come from the user. A pause by the user is not here: it arrives as
 * the "pause" of the element.
 */
type RequestSignal = "load" | "play" | "play_rejected" | "retry";

export type PlayerEvent =
  | { type: (typeof MEDIA_SIGNALS)[number] | RequestSignal }
  | { type: "loadedmetadata"; duration: number }
  | { type: "timeupdate"; currentTime: number }
  | { type: "seek"; time: number };

export const INITIAL_STATE: PlayerState = { status: "idle", currentTime: 0, duration: 0 };

type Transitions = Partial<Record<PlayerEvent["type"], PlayerStatus>>;

/**
 * The state machine. A missing entry means: this event changes nothing here.
 * "load" is not in the table, because it leads to "loading" from every state.
 */
export const TRANSITIONS: Record<PlayerStatus, Transitions> = {
  idle: {},
  loading: { canplay: "ready", playing: "playing", error: "error" },
  ready: { play: "buffering", playing: "playing", error: "error" },
  playing: { pause: "paused", waiting: "buffering", ended: "ended", error: "error" },
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

export function reducePlayer(state: PlayerState, event: PlayerEvent): PlayerState {
  const status = TRANSITIONS[state.status][event.type] ?? state.status;
  const hasMedia = state.status !== "idle" && state.status !== "error";

  switch (event.type) {
    case "load":
      // A new source starts from zero, whatever the player was doing.
      return { ...INITIAL_STATE, status: "loading" };
    case "loadedmetadata":
      // A live stream reports Infinity. This player is for videos with an end.
      return hasMedia
        ? { ...state, duration: Number.isFinite(event.duration) ? event.duration : 0 }
        : state;
    case "timeupdate":
      return hasMedia ? { ...state, currentTime: event.currentTime } : state;
    case "seek":
      // Before "canplay" there is nothing to seek in.
      return hasMedia && state.status !== "loading"
        ? { ...state, status, currentTime: Math.min(Math.max(event.time, 0), state.duration) }
        : state;
    case "ended":
      return status === state.status ? state : { ...state, status, currentTime: state.duration };
    default:
      // Returning the same object tells the store that nothing changed.
      return status === state.status ? state : { ...state, status };
  }
}
