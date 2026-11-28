/* NOT PART OF THE INTERVIEW: production version. */

/**
 * The most bytes of events in one request. The browser holds at most 64 KiB
 * (65,536 bytes) of beacon data, and `fetch` with `keepalive` has the same
 * limit. We stay under it, with room for the rest of the body.
 */
export const MAX_BATCH_BYTES = 60_000;

/** The size of a text in bytes, as it travels over the network. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * How many events from the front of the list go in one request: at most
 * `maxCount`, and at most `maxBytes`. Always at least one, so an event that
 * is too big alone is still tried, by `fetch`. `sizes` holds the byte size
 * of each event, measured once when the event was queued.
 */
export function countThatFit(
  sizes: number[],
  maxCount: number,
  maxBytes: number = MAX_BATCH_BYTES,
): number {
  const limit = Math.min(maxCount, sizes.length);
  let bytes = 0;
  let count = 0;

  while (count < limit) {
    // One more byte for the comma between two events.
    bytes += sizes[count] + 1;
    if (bytes > maxBytes && count > 0) {
      break;
    }
    count += 1;
  }
  return count;
}
