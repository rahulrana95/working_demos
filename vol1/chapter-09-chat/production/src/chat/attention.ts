/*
 * NOT PART OF THE INTERVIEW: production version.
 * Two ways to tell the user about a message they are not looking at: a
 * number in the title of the tab, and a notification of the system.
 */
import { useEffect, useRef } from "react";

/** Shows "(3) Title" in the tab while there are unread messages. */
export function useTitleBadge(unreadTotal: number): void {
  const baseTitle = useRef<string>();

  useEffect(() => {
    // Remember the title of the page once, before we change it.
    baseTitle.current ??= document.title;
    const base = baseTitle.current;
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [unreadTotal]);
}

export type NotificationState = NotificationPermission | "unsupported";

export function notificationState(): NotificationState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/**
 * Asks the user to allow notifications. Call it only from a click on a button
 * that says what it is for. A browser may ignore, or count against the site,
 * a question that comes without a click, and a user who says "Block" cannot
 * be asked again.
 */
export async function askForNotifications(): Promise<NotificationState> {
  if (notificationState() !== "default") {
    return notificationState();
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationState();
  }
}

/**
 * Shows a notification, but only when the user allowed it and cannot see
 * the page. Returns true when it was shown.
 *
 * It has a title and no text of the message: a notification is also shown on
 * a locked screen. `tag`: a second notification with the same tag replaces
 * the first, so one conversation never fills the screen.
 */
export function showNotification(title: string, tag: string): boolean {
  if (notificationState() !== "granted" || document.visibilityState === "visible") {
    return false;
  }
  try {
    const notification = new Notification(title, { tag });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    // Nearly every mobile browser throws here: it only shows a notification
    // from a service worker. The title badge still works.
    return false;
  }
}
