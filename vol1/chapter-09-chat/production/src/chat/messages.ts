/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text the user reads or hears. The production version adds the texts
 * of the typing line, the images, the conversation list and the
 * notifications, and plural forms.
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
  /** `{name}` is the other person. */
  typing: "{name} is typing…",
  attachImage: "Send an image",
  /** `{percent}` is a whole number from 0 to 100. */
  uploading: "Uploading, {percent}%",
  cancelUpload: "Cancel",
  imageRefused: "This file cannot be sent. Choose an image of 5 MB or less.",
  image: "Image",
  conversations: "Conversations",
  conversationsFailed: "Could not load the conversations.",
  noMessagesYet: "No messages yet",
  /** One text for each plural form of the language. `{count}` is the number. */
  unread: { one: "{count} unread message", other: "{count} unread messages" } as Partial<
    Record<Intl.LDMLPluralRule, string>
  >,
  /** The title of a notification. `{name}` is the sender. The text of the message is not shown. */
  notificationTitle: "New message from {name}",
};

/** Pass all of it or a part of it to the `messages` prop. A new `unread` must hold every form the language has. */
export type ChatMessages = typeof defaultMessages;

/** Puts values in a text: `fill("{name} is typing…", { name: "Ravi" })`. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder,
  );
}

/** The text for a count, in the plural form of the language. */
export function plural(
  forms: Partial<Record<Intl.LDMLPluralRule, string>>,
  count: number,
  locale?: string,
): string {
  const form = new Intl.PluralRules(locale).select(count);
  return fill(forms[form] ?? forms.other ?? "", {
    count: new Intl.NumberFormat(locale).format(count),
  });
}
