/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the default scrubber.
 */
import { scrubPageUrls, stripQueryAndHash } from "./scrub";
import type { AnalyticsEvent } from "./types";

function event(
  type: AnalyticsEvent["type"],
  properties: AnalyticsEvent["properties"],
): AnalyticsEvent {
  return { id: "1", type, name: "n", properties, timestamp: 0, anonymousId: "a", sessionId: "s" };
}

describe("stripQueryAndHash", () => {
  it.each([
    ["https://shop.test/reset?token=abc", "https://shop.test/reset"],
    ["https://shop.test/reset#access_token=abc", "https://shop.test/reset"],
    ["https://shop.test/a?x=1#y", "https://shop.test/a"],
    ["https://shop.test/a#y?x=1", "https://shop.test/a"],
    ["https://shop.test/plain", "https://shop.test/plain"],
    ["", ""],
  ])("turns %s into %s", (input, expected) => {
    expect(stripQueryAndHash(input)).toBe(expected);
  });
});

describe("scrubPageUrls", () => {
  it("cleans the url and the referrer of a page event", () => {
    const scrubbed = scrubPageUrls(
      event("page", {
        url: "https://a.test/x?q=1",
        referrer: "https://b.test/?email=e",
        path: "/x",
      }),
    );

    expect(scrubbed.properties).toEqual({
      url: "https://a.test/x",
      referrer: "https://b.test/",
      path: "/x",
    });
  });

  it("returns a copy and leaves the event it was given unchanged", () => {
    const original = event("page", { url: "https://a.test/x?q=1" });

    scrubPageUrls(original);

    expect(original.properties.url).toBe("https://a.test/x?q=1");
  });

  it("does not touch track and identify events", () => {
    const track = event("track", { url: "https://a.test/x?q=1" });

    expect(scrubPageUrls(track)).toBe(track);
  });

  it("leaves a url that is not a string alone", () => {
    expect(scrubPageUrls(event("page", { url: 42 })).properties).toEqual({ url: 42 });
  });
});
