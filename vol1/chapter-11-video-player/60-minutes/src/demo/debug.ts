/*
 * NOT PART OF THE INTERVIEW.
 * Counts how often React draws the player, and keeps the list of media
 * events, for the panel of the demo. It is a plain object, not React state:
 * writing to it never makes React draw anything again, so the counting does
 * not change what it counts.
 */
import { memo } from "react";
import type { FunctionComponent } from "react";

export interface DebugInfo {
  /** How many times React called the Player function. */
  playerRenders: number;
  /** How many times the seek bar and the time text were changed on the page. */
  seekBarUpdates: number;
  /** How many "timeupdate" events the video element sent. */
  timeUpdates: number;
  /** The media events the video element sent, newest last. */
  events: string[];
}

export const debugInfo: DebugInfo = {
  playerRenders: 0,
  seekBarUpdates: 0,
  timeUpdates: 0,
  events: [],
};

declare global {
  interface Window {
    /** The measuring script reads the numbers from here. */
    __playerDebug?: DebugInfo;
  }
}
window.__playerDebug = debugInfo;

const MAX_EVENTS = 200;
const LOGGED_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "canplay",
  "play",
  "playing",
  "pause",
  "waiting",
  "seeking",
  "seeked",
  "ended",
  "error",
  "volumechange",
];

/** Writes the media events of the element to the list. "timeupdate" and "progress" are only counted. */
export function logMediaEvents(video: HTMLVideoElement): void {
  video.addEventListener("timeupdate", () => {
    debugInfo.timeUpdates += 1;
  });
  for (const type of LOGGED_EVENTS) {
    video.addEventListener(type, () => {
      debugInfo.events.push(type);
      debugInfo.events.splice(0, debugInfo.events.length - MAX_EVENTS);
    });
  }
}

/**
 * Wraps a component so that each call of it is counted. The wrapper calls the
 * component as a plain function, so the hooks of the component become the
 * hooks of the wrapper, and every new drawing of the component is a call here.
 * `memo` keeps a new drawing of the demo page from drawing the player again.
 */
export function countRenders<Props extends object>(
  component: FunctionComponent<Props>,
): FunctionComponent<Props> {
  function Counted(props: Props) {
    debugInfo.playerRenders += 1;
    return component(props);
  }
  return memo(Counted) as unknown as FunctionComponent<Props>;
}

/**
 * Counts the changes of the seek bar and the time text. React changes them
 * all at once when it draws the seek bar again, and the browser reports the
 * changes of one drawing as one call here. A drawing that changes nothing on
 * the page is not counted.
 */
export function countSeekBarUpdates(player: Element): () => void {
  const observer = new MutationObserver(() => {
    debugInfo.seekBarUpdates += 1;
  });
  for (const part of player.querySelectorAll(".player__seek, .player__time")) {
    observer.observe(part, { attributes: true, characterData: true, subtree: true });
  }
  return () => observer.disconnect();
}
