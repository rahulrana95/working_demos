/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Write it after the queue. Say out loud which answers are worth a retry.
 */
import type { Transport } from "./types";

/**
 * The default transport. It turns the HTTP answer into a `SendResult`.
 *
 * The body is a string, so the browser sends it as `text/plain`. That keeps
 * the request "simple": the browser does not send a CORS preflight request
 * before each batch to a collector on another origin. The write key travels
 * in the body for the same reason: a custom header would cause a preflight.
 */
export const fetchTransport: Transport = async (url, body, signal) => {
  const response = await fetch(url, { method: "POST", body, signal, credentials: "omit" });

  if (response.ok) {
    return { kind: "ok" };
  }
  // 408: the server gave up waiting for us. 429: it is too busy. Like a 5xx, they may work next time.
  const mayWorkLater = response.status >= 500 || response.status === 408 || response.status === 429;
  return { kind: mayWorkLater ? "retry" : "drop" };
};

/**
 * Hands a batch to the browser while the page is going away. Returns true
 * when the browser took it.
 *
 * `sendBeacon` is made for this: the browser sends the data after the page
 * is gone. It returns false when the data does not fit. The browser holds at
 * most 64 KiB of beacon data at a time. We also return false when the call
 * throws.
 */
export function sendOnExit(url: string, body: string): boolean {
  try {
    if (typeof navigator.sendBeacon === "function") {
      return navigator.sendBeacon(url, body);
    }
    // `keepalive` asks the browser to finish the request after the page is gone.
    // We cannot wait for the answer, so we count the batch as sent.
    fetch(url, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {});
    return true;
  } catch {
    // The caller keeps the batch and tries again later.
    return false;
  }
}
