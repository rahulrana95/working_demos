/*
 * NOT PART OF THE INTERVIEW: production version.
 * What the player remembers in `localStorage`: the sound and caption settings
 * of the user, and where they stopped in each video.
 *
 * Storage can be missing or full, and in some private modes every call
 * throws. So every call is inside a try, and bad data is ignored.
 */
import type { PlayerStore } from "./store";

export interface StoredSettings {
  volume: number;
  muted: boolean;
  captionsOn: boolean;
  /** A multiplier for the size of the caption text: 1 is normal. */
  captionScale: number;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  volume: 1,
  muted: false,
  captionsOn: false,
  captionScale: 1,
};

const SETTINGS_KEY = "video-player:settings";
const POSITION_KEY_PREFIX = "video-player:position:";

/** Do not resume in the first seconds of a video, or in its last seconds. */
const RESUME_MARGIN_SECONDS = 10;

function read(key: string): unknown {
  try {
    const text = window.localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Remembering is a comfort. The player works without it.
  }
}

function isNumberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && value >= min && value <= max;
}

/** Reads the settings. Any field that is missing or has a wrong type gets its default. */
export function loadSettings(): StoredSettings {
  const stored = read(SETTINGS_KEY);
  const fields: Partial<Record<keyof StoredSettings, unknown>> =
    typeof stored === "object" && stored !== null ? stored : {};

  return {
    volume: isNumberBetween(fields.volume, 0, 1) ? fields.volume : DEFAULT_SETTINGS.volume,
    muted: typeof fields.muted === "boolean" ? fields.muted : DEFAULT_SETTINGS.muted,
    captionsOn:
      typeof fields.captionsOn === "boolean" ? fields.captionsOn : DEFAULT_SETTINGS.captionsOn,
    captionScale: isNumberBetween(fields.captionScale, 0.5, 3)
      ? fields.captionScale
      : DEFAULT_SETTINGS.captionScale,
  };
}

export function saveSettings(settings: StoredSettings): void {
  write(SETTINGS_KEY, settings);
}

/**
 * The time to start from, or 0. `videoId` is the id that the caller gives
 * the video. It is used only as part of the storage key on this device.
 */
export function loadPosition(videoId: string): number {
  const stored = read(POSITION_KEY_PREFIX + videoId);
  return isNumberBetween(stored, 0, Number.MAX_SAFE_INTEGER) ? stored : 0;
}

/** Remembers where the user is. Near the start or the end, it forgets the video. */
export function savePosition(videoId: string, currentTime: number, duration: number): void {
  const isWorthResuming =
    currentTime >= RESUME_MARGIN_SECONDS && currentTime <= duration - RESUME_MARGIN_SECONDS;
  write(POSITION_KEY_PREFIX + videoId, isWorthResuming ? Math.floor(currentTime) : null);
}

/** While the video plays, the place is saved once in this many seconds of video. */
const SAVE_EVERY_SECONDS = 5;

/**
 * Keeps the saved place of one video up to date: every few seconds while it
 * plays, on every change of the status (a pause, the end), when the page is
 * closed and when the player is removed. Returns a function that stops it.
 */
export function rememberPosition(store: PlayerStore, videoId: string): () => void {
  let lastSlot = -1;
  let lastStatus = "";

  function save() {
    const { status, currentTime, duration } = store.getState();
    // While loading, the time is not the place of the user yet. After an
    // error we keep what was saved before it.
    if (duration > 0 && status !== "loading" && status !== "error") {
      savePosition(videoId, currentTime, duration);
    }
  }

  const unsubscribe = store.subscribe(() => {
    const { status, currentTime } = store.getState();
    const slot = Math.floor(currentTime / SAVE_EVERY_SECONDS);
    if (slot !== lastSlot || status !== lastStatus) {
      lastSlot = slot;
      lastStatus = status;
      save();
    }
  });
  // "pagehide" is the last event a page reliably gets, on phones too.
  window.addEventListener("pagehide", save);

  return () => {
    save();
    unsubscribe();
    window.removeEventListener("pagehide", save);
  };
}
