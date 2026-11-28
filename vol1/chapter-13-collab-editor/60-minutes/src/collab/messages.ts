/*
 * PART OF THE INTERVIEW: yes (about 1 minute).
 * Every text that the editor itself shows. Another team passes its own
 * object to translate them.
 */
export interface CollabMessages {
  /** Shown while there is no connection. */
  offline: string;
}

export const DEFAULT_MESSAGES: CollabMessages = {
  offline: "You are offline. Your changes are kept, and sent when you are back.",
};
