/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Write it when you need the anonymous id. Say why every call is in a `try`.
 */

/**
 * Reads a value from `localStorage`. Returns null when it is not there.
 *
 * Reading `localStorage` can throw: in a private window of some browsers,
 * when the user blocks site data, or in a sandboxed iframe.
 */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes a value, or removes the key when the value is null. Never throws, also when storage is full. */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Nothing to do. The SDK works without storage.
  }
}
