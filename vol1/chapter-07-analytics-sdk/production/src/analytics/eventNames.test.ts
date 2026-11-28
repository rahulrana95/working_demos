/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the naming rule for events.
 */
import { isValidEventName, MAX_EVENT_NAME_LENGTH } from "./eventNames";

describe("isValidEventName", () => {
  it.each(["clicked", "checkout_started", "step_2_done", "a", "video_played_50_percent"])(
    "accepts %s",
    (name) => {
      expect(isValidEventName(name)).toBe(true);
    },
  );

  it.each([
    ["Checkout Started", "spaces and capitals"],
    ["checkoutStarted", "camel case"],
    ["checkout-started", "a dash"],
    ["_checkout", "a leading underscore"],
    ["checkout_", "a trailing underscore"],
    ["checkout__started", "two underscores"],
    ["2fa_enabled", "a leading digit"],
    ["asha@example.com_signed_up", "an email address"],
    ["", "an empty name"],
  ])("refuses %s (%s)", (name) => {
    expect(isValidEventName(name)).toBe(false);
  });

  it("accepts a name of 64 characters and refuses one of 65", () => {
    expect(isValidEventName("a".repeat(MAX_EVENT_NAME_LENGTH))).toBe(true);
    expect(isValidEventName("a".repeat(MAX_EVENT_NAME_LENGTH + 1))).toBe(false);
  });
});
