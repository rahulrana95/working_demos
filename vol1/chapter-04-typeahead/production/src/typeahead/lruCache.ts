/*
 * NOT PART OF THE INTERVIEW: production version.
 * The same cache as in the interview answer, plus `clear`, which the shared
 * caches need on logout.
 */

interface CacheEntry<V> {
  value: V;
  savedAt: number;
}

/**
 * A small least-recently-used cache, where entries also expire.
 *
 * A Map remembers the order in which keys were inserted, so the first key is
 * always the oldest one. On every read we delete the key and insert it again,
 * which moves it to the end. When the cache is full, we remove the first key.
 *
 * Why it holds at scale: it never keeps more than `maxSize` entries, and
 * get and set are O(1).
 */
export class LruCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly maxSize: number,
    /** How long an entry stays valid. The default is: for ever. */
    private readonly ttlMs: number = Infinity,
    /** The clock. Tests pass their own clock to control time. */
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return undefined;
    }

    this.entries.delete(key);

    // An expired entry is removed and treated as missing.
    // Reading an entry does not make it live longer: we keep the old `savedAt`.
    if (this.now() - entry.savedAt > this.ttlMs) {
      return undefined;
    }

    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, savedAt: this.now() });

    if (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value as string;
      this.entries.delete(oldestKey);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
