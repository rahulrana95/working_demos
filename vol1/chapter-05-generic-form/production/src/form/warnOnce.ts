/*
 * NOT PART OF THE INTERVIEW: production version.
 * A broken schema is a bug of the team that wrote it, not of the user. We tell
 * the developer in the console, one time, and the form keeps working.
 */

const seenMessages = new Set<string>();

/** Writes the message to the console the first time only. */
export function warnOnce(message: string): void {
  if (seenMessages.has(message)) {
    return;
  }

  seenMessages.add(message);
  console.error(message);
}
