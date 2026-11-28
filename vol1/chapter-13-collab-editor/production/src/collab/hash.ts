/*
 * NOT PART OF THE INTERVIEW: production version.
 * A short number for a text (FNV-1a, 32 bits). Two editors that hold the
 * same operations must have the same text, so they must have the same
 * number. It is not a secret and not safe against an attacker: it only
 * finds bugs.
 */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
