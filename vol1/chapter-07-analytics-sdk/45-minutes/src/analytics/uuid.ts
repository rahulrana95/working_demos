/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Write it when you say "every event gets an id, so the server can drop a
 * copy that a retry delivered twice".
 */

/** Returns a random version 4 UUID. */
export function uuid(): string {
  // `crypto.randomUUID` exists only on HTTPS pages (and on localhost).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // The id is not a secret. It only has to be different from other ids,
  // so `Math.random` is good enough here.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random % 4) + 8).toString(16);
  });
}
