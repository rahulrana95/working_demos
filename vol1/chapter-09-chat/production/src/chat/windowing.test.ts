/* NOT PART OF THE INTERVIEW. Tests of the window of drawn messages. */
import { serverMessage } from "./testUtils";
import { isSameDay, isValidTime, REVEAL_STEP, stepUp, WINDOW_SIZE, windowStart } from "./windowing";

const many = (count: number) =>
  Array.from({ length: count }, (_, index) => serverMessage(String(index + 1)));

describe("windowStart", () => {
  it("draws everything while there are fewer messages than the window", () => {
    expect(windowStart(many(0), null)).toBe(0);
    expect(windowStart(many(WINDOW_SIZE), null)).toBe(0);
  });

  it("draws only the newest 100 of 5,000 while it follows the newest messages", () => {
    const messages = many(5000);

    expect(windowStart(messages, null)).toBe(4900);
    expect(messages.slice(windowStart(messages, null))).toHaveLength(WINDOW_SIZE);
  });

  it("starts at the pinned message, however many messages arrive below it", () => {
    const messages = many(5000);
    const pinned = messages[4900].clientId;

    expect(windowStart(messages, pinned)).toBe(4900);
    expect(
      windowStart(
        [...messages, ...many(30).map((m) => ({ ...m, clientId: `new-${m.id}` }))],
        pinned,
      ),
    ).toBe(4900);
  });

  it("stays on the pinned message when an older page is added above it", () => {
    const older = many(50).map((message) => ({ ...message, clientId: `older-${message.id}` }));
    const messages = many(200);

    expect(windowStart([...older, ...messages], messages[100].clientId)).toBe(150);
  });

  it("follows the newest messages again when the pinned message is gone", () => {
    expect(windowStart(many(300), "no-such-message")).toBe(200);
  });
});

describe("stepUp", () => {
  it("moves the top of the window up by one step", () => {
    const messages = many(5000);

    expect(stepUp(messages, 4900)).toBe(messages[4900 - REVEAL_STEP].clientId);
  });

  it("stops at the first message in memory", () => {
    const messages = many(120);

    expect(stepUp(messages, 20)).toBe(messages[0].clientId);
  });
});

describe("isSameDay and isValidTime", () => {
  it("compares the days of the user's calendar, not 24 hours", () => {
    const lateEvening = new Date(2026, 0, 5, 23, 59).getTime();
    const justAfterMidnight = new Date(2026, 0, 6, 0, 1).getTime();
    const sameMorning = new Date(2026, 0, 5, 0, 1).getTime();

    expect(isSameDay(lateEvening, justAfterMidnight)).toBe(false);
    expect(isSameDay(lateEvening, sameMorning)).toBe(true);
  });

  it("says no to a time that a date cannot hold", () => {
    expect(isValidTime(Date.now())).toBe(true);
    expect(isValidTime(Number.NaN)).toBe(false);
    expect(isValidTime(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidTime(9e15)).toBe(false);
  });
});
