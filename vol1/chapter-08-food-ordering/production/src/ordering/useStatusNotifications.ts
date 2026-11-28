/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tells the user about a new status. In a visible tab it is a small message
 * on the page for a few seconds. In a hidden tab it is a notification of the
 * browser, and only when the user asked for it with a button. The page never
 * asks for the permission by itself: a question on page load is answered
 * with "Block", and then it can never be asked again.
 */
import { useEffect, useRef, useState } from "react";
import type { OrderStatus } from "./types";
import { useLatest } from "./useLatest";

export const TOAST_MS = 5000;

export type NotificationState = "unsupported" | "default" | "granted" | "denied";

function readPermission(): NotificationState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** The permission for notifications, and the function that asks for it. */
export function useNotificationPermission() {
  const [permission, setPermission] = useState(readPermission);

  /** Call this from a click of the user, never on page load. */
  async function enable(): Promise<void> {
    if (permission === "default") {
      setPermission(await Notification.requestPermission());
    }
  }

  return { permission, enable };
}

/**
 * Returns the text of the message to show on the page, or null. Shows a
 * notification of the browser instead when the tab is hidden and the user
 * allowed it.
 */
export function useStatusNotifications(
  status: OrderStatus | undefined,
  permission: NotificationState,
  describe: (status: OrderStatus) => string,
): string | null {
  const [toast, setToast] = useState<string | null>(null);
  const previousRef = useRef(status);
  const describeRef = useLatest(describe);
  const permissionRef = useLatest(permission);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = status;
    // The first status we learn is not a change, so it is not announced.
    if (status === undefined || previous === undefined || status === previous) {
      return;
    }
    const text = describeRef.current(status);

    if (!document.hidden) {
      setToast(text);
      const timerId = setTimeout(() => setToast(null), TOAST_MS);
      return () => clearTimeout(timerId);
    }
    if (permissionRef.current === "granted") {
      try {
        new Notification(text);
      } catch {
        // Chrome on Android only allows notifications from a service worker.
      }
    }
  }, [status, describeRef, permissionRef]);

  return toast;
}
