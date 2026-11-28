/*
 * NOT PART OF THE INTERVIEW: production version.
 * Makes the id of a new message. `crypto.randomUUID` exists only on https and
 * on localhost. A page served over plain http falls back to random bytes.
 */
export function newClientId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
