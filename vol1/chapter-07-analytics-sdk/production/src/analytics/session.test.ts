/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the session rules and the sampling by session id.
 */
import { isSampled, nextSession, parseSession, SESSION_IDLE_MS } from "./session";
import { uuid } from "./uuid";

describe("nextSession", () => {
  it("starts a session when there is none", () => {
    const session = nextSession(null, 1000);

    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.lastSeenAt).toBe(1000);
  });

  it("keeps the id and moves the time one millisecond before the limit", () => {
    const session = nextSession({ id: "s1", lastSeenAt: 1000 }, 1000 + SESSION_IDLE_MS - 1);

    expect(session).toEqual({ id: "s1", lastSeenAt: 1000 + SESSION_IDLE_MS - 1 });
  });

  it("starts a new session at exactly 30 idle minutes", () => {
    const session = nextSession({ id: "s1", lastSeenAt: 1000 }, 1000 + SESSION_IDLE_MS);

    expect(session.id).not.toBe("s1");
  });

  it("does not change the session it was given", () => {
    const current = { id: "s1", lastSeenAt: 1000 };

    nextSession(current, 2000);

    expect(current).toEqual({ id: "s1", lastSeenAt: 1000 });
  });
});

describe("isSampled", () => {
  it("keeps every session at 1 and no session at 0", () => {
    for (const id of [
      "00000000-0000-4000-8000-000000000000",
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
    ]) {
      expect(isSampled(id, 1)).toBe(true);
      expect(isSampled(id, 0)).toBe(false);
    }
  });

  it("gives the same answer for the same session every time", () => {
    const id = uuid();

    expect(new Set(Array.from({ length: 100 }, () => isSampled(id, 0.5))).size).toBe(1);
  });

  it("keeps about one session in ten at 0.1", () => {
    const kept = Array.from({ length: 20_000 }, uuid).filter((id) => isSampled(id, 0.1)).length;

    expect(kept).toBeGreaterThan(1700);
    expect(kept).toBeLessThan(2300);
  });

  it("keeps a session whose number is just under the rate, and not one just over", () => {
    expect(isSampled("7fffffff-0000-4000-8000-000000000000", 0.5)).toBe(true);
    expect(isSampled("80000000-0000-4000-8000-000000000000", 0.5)).toBe(false);
  });
});

describe("parseSession", () => {
  it("reads a stored session", () => {
    expect(parseSession('{"id":"s1","lastSeenAt":5}')).toEqual({ id: "s1", lastSeenAt: 5 });
  });

  it("returns null for nothing, for broken JSON and for other shapes", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession("{broken")).toBeNull();
    expect(parseSession("42")).toBeNull();
    expect(parseSession('{"id":7,"lastSeenAt":5}')).toBeNull();
    expect(parseSession('{"id":"s1","lastSeenAt":"yesterday"}')).toBeNull();
  });
});
