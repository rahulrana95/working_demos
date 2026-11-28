/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove `beforeSend`, the default URL scrubber, sampling and the
 * session id.
 */
import { SESSION_IDLE_MS } from "./session";
import { idle, openTab, storedEvents, trackMany, useSdkTestSetup } from "./testHelpers";

useSdkTestSetup();

describe("beforeSend", () => {
  it("can change an event before it is queued", () => {
    const { analytics, calls } = openTab({
      beforeSend: (event) => ({
        ...event,
        properties: { ...event.properties, email: "[removed]" },
      }),
    });

    analytics.track("signed_up", { email: "asha@example.com", plan: "pro" });
    void analytics.flush();

    expect(calls[0].batch.events[0].properties).toEqual({ email: "[removed]", plan: "pro" });
  });

  it("can drop an event by returning null, and that is not counted as a loss", async () => {
    const { analytics, calls } = openTab({
      beforeSend: (event) => (event.name === "secret" ? null : event),
    });

    analytics.track("secret");
    analytics.track("public");
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["public"]);
    expect(calls[0].batch.dropped).toBe(0);
  });

  it("does not let an error in the hook reach the page, and does not send that event", () => {
    const { analytics, calls } = openTab({
      beforeSend: (event) => {
        if (event.name === "bad") {
          throw new Error("hook failed");
        }
        return event;
      },
    });

    expect(() => analytics.track("bad", { email: "asha@example.com" })).not.toThrow();
    analytics.track("good");
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["good"]);
    expect(calls[0].batch.dropped).toBe(1);
  });

  it("runs before the queue is stored, so removed data never reaches localStorage", async () => {
    const { analytics } = openTab({
      beforeSend: (event) => ({ ...event, properties: {} }),
    });

    analytics.track("signed_up", { email: "asha@example.com" });
    await idle();

    expect(storedEvents()).toHaveLength(1);
    expect(JSON.stringify(localStorage)).not.toContain("asha@example.com");
  });

  it("cannot change the host's own object", () => {
    const properties = { email: "asha@example.com" };
    const { analytics } = openTab({
      beforeSend: (event) => {
        delete event.properties.email;
        return event;
      },
    });

    analytics.track("signed_up", properties);

    expect(properties).toEqual({ email: "asha@example.com" });
  });
});

describe("the default scrubber", () => {
  it("removes the query string and the hash from the URL of a page event", () => {
    history.replaceState(null, "", "/reset?email=asha%40example.com&token=abc#section");
    const { analytics, calls } = openTab();

    analytics.page("Reset password");
    void analytics.flush();

    expect(calls[0].batch.events[0].properties).toEqual({
      url: "http://localhost:3000/reset",
      path: "/reset",
      referrer: "",
    });
  });

  it("leaves other events alone", () => {
    const { analytics, calls } = openTab();

    analytics.track("link_clicked", { url: "https://example.com/?q=1" });
    void analytics.flush();

    expect(calls[0].batch.events[0].properties).toEqual({ url: "https://example.com/?q=1" });
  });

  it("is replaced by the team's own hook", () => {
    history.replaceState(null, "", "/search?q=shoes");
    const { analytics, calls } = openTab({ beforeSend: (event) => event });

    analytics.page();
    void analytics.flush();

    expect(calls[0].batch.events[0].properties.url).toBe("http://localhost:3000/search?q=shoes");
  });
});

describe("sampling", () => {
  it("sends everything by default", () => {
    const { analytics, calls } = openTab();

    trackMany(analytics, 5);
    void analytics.flush();

    expect(calls[0].batch.events).toHaveLength(5);
  });

  it("sends nothing with sampleRate 0", async () => {
    const { analytics, calls } = openTab({ sampleRate: 0 });

    trackMany(analytics, 25);
    analytics.identify("user_1");
    analytics.page();
    await analytics.flush();

    expect(calls).toHaveLength(0);
    expect(storedEvents()).toEqual([]);
  });

  it("keeps all events of a session or none of them", async () => {
    let keptSessions = 0;
    for (let run = 0; run < 200; run += 1) {
      localStorage.clear();
      const { analytics, calls } = openTab({ sampleRate: 0.5, batchSize: 10 });

      trackMany(analytics, 10);
      await idle();

      const sent = calls.length === 0 ? 0 : calls[0].batch.events.length;
      expect([0, 10]).toContain(sent);
      keptSessions += sent / 10;
    }

    expect(keptSessions).toBeGreaterThan(60);
    expect(keptSessions).toBeLessThan(140);
  });
});

describe("the session id", () => {
  it("is the same for events less than 30 minutes apart", async () => {
    const { analytics, calls, answer } = openTab();

    analytics.track("first");
    void analytics.flush();
    await answer({ kind: "ok" });
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_MS - 1);
    analytics.track("second");
    void analytics.flush();

    expect(calls[1].batch.events[0].sessionId).toBe(calls[0].batch.events[0].sessionId);
  });

  it("changes after 30 minutes with no event", async () => {
    const { analytics, calls, answer } = openTab();

    analytics.track("first");
    void analytics.flush();
    await answer({ kind: "ok" });
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_MS);
    analytics.track("second");
    void analytics.flush();

    expect(calls[1].batch.events[0].sessionId).not.toBe(calls[0].batch.events[0].sessionId);
  });

  it("stays alive as long as events keep coming", async () => {
    const { analytics, calls } = openTab({ batchSize: 100, flushIntervalMs: 10 * SESSION_IDLE_MS });

    for (let run = 0; run < 5; run += 1) {
      analytics.track("still here");
      await vi.advanceTimersByTimeAsync(SESSION_IDLE_MS - 1);
    }
    void analytics.flush();

    expect(new Set(calls[0].batch.events.map((event) => event.sessionId)).size).toBe(1);
  });

  it("is shared with a second tab and survives a reload", async () => {
    const first = openTab();
    first.analytics.track("in tab one");
    void first.analytics.flush();
    await idle();

    const second = openTab();
    second.analytics.track("in tab two");
    void second.analytics.flush();

    expect(second.calls[0].batch.events[0].sessionId).toBe(
      first.calls[0].batch.events[0].sessionId,
    );
  });

  it("stays alive in a quiet tab while the user is active in another tab", async () => {
    const quiet = openTab();
    const busy = openTab();
    quiet.analytics.track("start");
    void quiet.analytics.flush();
    await quiet.answer({ kind: "ok" });

    await vi.advanceTimersByTimeAsync(SESSION_IDLE_MS - 1000);
    busy.analytics.track("busy");
    await vi.advanceTimersByTimeAsync(2000);
    quiet.analytics.track("back");
    void quiet.analytics.flush();

    expect(quiet.calls[1].batch.events[0].sessionId).toBe(quiet.calls[0].batch.events[0].sessionId);
  });

  it("ignores a stored session that is not valid", () => {
    localStorage.setItem("analytics:session", "{not json");
    const { analytics, calls } = openTab();

    expect(() => analytics.track("clicked")).not.toThrow();
    void analytics.flush();

    expect(calls[0].batch.events[0].sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
