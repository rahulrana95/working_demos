/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text that the editor itself shows or reads out. Another team passes
 * its own object to translate them.
 */
export interface CollabMessages {
  /** The name of the list of other people in the document. */
  peopleHere: string;
  /** Shown while there is no connection. */
  offline: string;
  /** Read to screen reader users after remote changes, at most once in a while. */
  remoteChange: string;
}

export const DEFAULT_MESSAGES: CollabMessages = {
  peopleHere: "Also here",
  offline: "You are offline. Your changes are kept, and sent when you are back.",
  remoteChange: "Another person changed the text.",
};
