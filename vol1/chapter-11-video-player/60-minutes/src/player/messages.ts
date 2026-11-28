/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Every text the user can read or hear is here, in one object.
 * Another team can replace any of them to translate the player.
 */

export interface PlayerMessages {
  play: string;
  pause: string;
  mute: string;
  volume: string;
  seek: string;
  /** "1 minute 20 seconds of 5 minutes". A function, because the word order changes with the language. */
  position: (current: string, total: string) => string;
  error: string;
  retry: string;
  captions: string;
}

export const DEFAULT_MESSAGES: PlayerMessages = {
  play: "Play",
  pause: "Pause",
  mute: "Mute",
  volume: "Volume",
  seek: "Seek",
  position: (current, total) => `${current} of ${total}`,
  error: "The video could not be loaded.",
  retry: "Try again",
  captions: "Captions",
};
