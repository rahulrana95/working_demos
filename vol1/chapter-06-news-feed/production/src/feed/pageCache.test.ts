/* NOT PART OF THE INTERVIEW: production version. */
import { clearCachedPage, readCachedPage, writeCachedPage } from "./pageCache";
import { makePage } from "./testHelpers";

const KEY = "feed:user-1";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("the first-page cache", () => {
  it("gives back the page that was saved", () => {
    writeCachedPage(KEY, makePage(1, 3));

    expect(readCachedPage(KEY)).toEqual(makePage(1, 3));
  });

  it("holds nothing before a page was saved", () => {
    expect(readCachedPage(KEY)).toBeNull();
  });

  it("does not read or write without a cache key", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    writeCachedPage(undefined, makePage(1, 3));

    expect(setItem).not.toHaveBeenCalled();
    expect(readCachedPage(undefined)).toBeNull();
  });

  it("keeps the pages of two keys apart, so two users never share posts", () => {
    writeCachedPage("feed:user-1", makePage(1, 3));
    writeCachedPage("feed:user-2", makePage(4, 6));

    expect(readCachedPage("feed:user-1")?.posts[0].id).toBe("p1");
    expect(readCachedPage("feed:user-2")?.posts[0].id).toBe("p4");
  });

  it("saves the first 20 posts only", () => {
    writeCachedPage(KEY, makePage(1, 50));

    expect(readCachedPage(KEY)?.posts).toHaveLength(20);
  });

  it("ignores saved text that is not JSON", () => {
    window.sessionStorage.setItem(KEY, "{not json");

    expect(readCachedPage(KEY)).toBeNull();
  });

  it("ignores saved data that is not a page of posts", () => {
    for (const bad of [
      '"text"',
      "42",
      "{}",
      '{"posts":"no"}',
      '{"posts":[{"id":7}]}',
      '{"posts":[null]}',
    ]) {
      window.sessionStorage.setItem(KEY, bad);

      expect(readCachedPage(KEY)).toBeNull();
    }
  });

  it("ignores a saved page with no posts", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ posts: [], nextCursor: null }));

    expect(readCachedPage(KEY)).toBeNull();
  });

  it("works when the storage throws, as it does when it is full or switched off", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(() => writeCachedPage(KEY, makePage(1, 3))).not.toThrow();
    expect(readCachedPage(KEY)).toBeNull();
  });

  it("removes the saved page on logout", () => {
    writeCachedPage(KEY, makePage(1, 3));

    clearCachedPage(KEY);

    expect(readCachedPage(KEY)).toBeNull();
  });
});
