/*
 * NOT PART OF THE INTERVIEW: production version.
 * The English texts. The plural forms come from the browser.
 */
import { DEFAULT_MESSAGES } from "./messages";

describe("DEFAULT_MESSAGES", () => {
  it("uses the singular for one and the plural for every other count", () => {
    expect(DEFAULT_MESSAGES.likeCount(0)).toBe("0 likes");
    expect(DEFAULT_MESSAGES.likeCount(1)).toBe("1 like");
    expect(DEFAULT_MESSAGES.likeCount(2)).toBe("2 likes");
    expect(DEFAULT_MESSAGES.commentCount(1)).toBe("1 comment");
    expect(DEFAULT_MESSAGES.commentCount(12)).toBe("12 comments");
  });

  it("says how many posts were loaded", () => {
    expect(DEFAULT_MESSAGES.morePostsLoaded(1)).toBe("1 more post loaded");
    expect(DEFAULT_MESSAGES.morePostsLoaded(10)).toBe("10 more posts loaded");
  });

  it("says how many new posts wait", () => {
    expect(DEFAULT_MESSAGES.newPosts(1)).toBe("1 new post");
    expect(DEFAULT_MESSAGES.newPosts(3)).toBe("3 new posts");
  });

  it("asks Intl.PluralRules which English form fits the count", () => {
    const select = vi.spyOn(Intl.PluralRules.prototype, "select");

    DEFAULT_MESSAGES.likeCount(7);

    expect(select).toHaveBeenCalledWith(7);
  });

  it("writes the date the English way, whatever the language of the browser is", () => {
    expect(DEFAULT_MESSAGES.formatDate("2026-11-28T09:30:00.000Z")).toBe("Nov 28, 2026");
  });
});
