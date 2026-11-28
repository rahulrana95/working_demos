/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text the user can read or hear is here, in one object.
 * Another team can replace any of them to translate the player.
 * Numbers, units and percentages are not here: the browser writes them in
 * the language of the `locale` prop.
 */

export interface PlayerMessages {
  play: string;
  pause: string;
  mute: string;
  volume: string;
  seek: string;
  /** "1 minute 20 seconds of 5 minutes". A function, because the word order changes with the language. */
  position: (current: string, total: string) => string;
  captions: string;
  captionSize: string;
  speed: string;
  quality: string;
  /** The first entry of the quality menu. `level` is the level in use, for example "720p". */
  autoQuality: (level: string) => string;
  fullscreen: string;
  pictureInPicture: string;
  /** One message for each kind of error. */
  errorNetwork: string;
  errorDecode: string;
  errorUnsupported: string;
  retry: string;
  /** Shown while the player tries again by itself. `attempt` is 1 for the first try. */
  retrying: (attempt: number, maxAttempts: number) => string;
  /** Shown when the code of the player itself has failed. */
  crashed: string;
  reload: string;
  help: string;
  close: string;
  /** The lines of the keyboard help. */
  helpPlay: string;
  helpSeek: string;
  helpVolume: string;
  helpMute: string;
  helpStartEnd: string;
  helpCaptions: string;
  helpFullscreen: string;
  helpHelp: string;
}

export const DEFAULT_MESSAGES: PlayerMessages = {
  play: "Play",
  pause: "Pause",
  mute: "Mute",
  volume: "Volume",
  seek: "Seek",
  position: (current, total) => `${current} of ${total}`,
  captions: "Captions",
  captionSize: "Caption size",
  speed: "Speed",
  quality: "Quality",
  autoQuality: (level) => `Auto (${level})`,
  fullscreen: "Full screen",
  pictureInPicture: "Picture in picture",
  errorNetwork: "The connection was lost. Check your network.",
  errorDecode: "This video has a problem and cannot be played.",
  errorUnsupported: "This video could not be loaded.",
  retry: "Try again",
  retrying: (attempt, maxAttempts) =>
    `The connection was lost. Trying again (${attempt} of ${maxAttempts})…`,
  crashed: "The player stopped working.",
  reload: "Load the player again",
  help: "Keyboard shortcuts",
  close: "Close",
  helpPlay: "Play or pause",
  helpSeek: "Back or forward 5 seconds",
  helpVolume: "Volume up or down",
  helpMute: "Mute",
  helpStartEnd: "Go to the start or the end",
  helpCaptions: "Captions on or off",
  helpFullscreen: "Full screen",
  helpHelp: "Show this help",
};
