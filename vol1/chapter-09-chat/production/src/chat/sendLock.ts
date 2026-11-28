/*
 * NOT PART OF THE INTERVIEW: production version.
 * Two tabs of one person share the stored outbox, so both want to send the
 * same waiting message. The Web Locks API lets one tab at a time hold a lock
 * with a name. The browser frees the lock when the task ends, and also when
 * the tab is closed or crashes.
 *
 * Without the lock nothing breaks: the server stores a `clientId` once. The
 * lock only saves the second request.
 */

/**
 * Runs `task` while this tab holds the lock of the message. When another
 * tab holds it, this waits until that tab is done. Rejects when the signal
 * is aborted while it waits.
 */
export function withSendLock<T>(
  clientId: string,
  signal: AbortSignal,
  task: () => Promise<T>,
): Promise<T> {
  // `navigator.locks` exists only on https and on localhost, and not in old browsers.
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks === undefined) {
    return task();
  }
  return locks.request(`chat-send:${clientId}`, { signal }, task) as Promise<T>;
}
