/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the cache keeps its size limit.
 */
import { LruCache } from "./lruCache";

describe("LruCache", () => {
  it("returns undefined for a key that was never stored", () => {
    const cache = new LruCache<number>(2);

    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns the stored value", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);

    expect(cache.get("a")).toBe(1);
  });

  it("removes the oldest key when it is full", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("treats a key that was read as recently used", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);

    cache.get("a");
    cache.set("c", 3);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
  });

  it("keeps one entry when the same key is stored twice", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("a", 10);

    expect(cache.get("a")).toBe(10);
    expect(cache.size).toBe(1);
  });

  it("can store an empty list, which is a valid answer from the server", () => {
    const cache = new LruCache<string[]>(2);
    cache.set("zzz", []);

    expect(cache.get("zzz")).toEqual([]);
  });

  it("never holds more than its limit, even after 10,000 different keys", () => {
    const cache = new LruCache<number>(50);

    for (let index = 0; index < 10_000; index += 1) {
      cache.set(`query-${index}`, index);
    }

    expect(cache.size).toBe(50);
    expect(cache.get("query-9999")).toBe(9999);
    expect(cache.get("query-0")).toBeUndefined();
  });
});
