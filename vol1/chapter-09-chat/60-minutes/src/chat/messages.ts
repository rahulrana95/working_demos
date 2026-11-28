/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Every text the user reads or hears is here, so another team can translate
 * it without a change to the components.
 */
export const defaultMessages = {
  you: "You",
  // One text for each status of a message. The keys are the statuses.
  sending: "Sending…",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not sent",
  retry: "Retry",
  loadOlder: "Load older messages",
  loading: "Loading…",
  loadFailed: "Could not load the messages.",
  newMessages: "New messages",
  connecting: "Connecting… Your messages are sent when the connection is back.",
  composerLabel: "Message",
  send: "Send",
};

/** Pass all of it or a part of it to the `messages` prop. */
export type ChatMessages = typeof defaultMessages;
