/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Start with a plain Map. Add the size limit when the interviewer asks,
 * "What happens to memory if the user keeps searching all day?"
 */

/**
 * A small least-recently-used cache.
 *
 * A Map remembers the order in which keys were inserted, so the first key is
 * always the oldest one. On every read we delete the key and insert it again,
 * which moves it to the end. When the cache is full, we remove the first key.
 *
 * Why it holds at scale: it never keeps more than `maxSize` entries, and
 * get and set are O(1).
 */
export class LruCache<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    if (!this.entries.has(key)) {
      return undefined;
    }

    const value = this.entries.get(key) as V;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);

    if (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value as string;
      this.entries.delete(oldestKey);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
