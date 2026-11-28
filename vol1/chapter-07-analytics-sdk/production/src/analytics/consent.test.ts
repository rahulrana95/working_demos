/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove what the SDK does before the user has chosen, after a
 * "yes" and after a "no".
 */
import {
  idle,
  installFakeBeacon,
  openTab,
  setVisibility,
  storedQueueKeys,
  trackMany,
  useSdkTestSetup,
} from "./testHelpers";

useSdkTestSetup();

describe("consent pending", () => {
  it("holds events in memory: nothing is sent, on a timer or on page exit", async () => {
    const beacon = installFakeBeacon();
    const { analytics, calls } = openTab({ consent: "pending" });

    trackMany(analytics, 25);
    await analytics.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    setVisibility("hidden");

    expect(calls).toHaveLength(0);
    expect(beacon.sendBeacon).not.toHaveBeenCalled();
  });

  it("stores nothing: no id, no session, no queue", () => {
    const { analytics } = openTab({ consent: "pending" });

    analytics.track("clicked");
    analytics.identify("user_1");
    analytics.page();

    expect(localStorage.length).toBe(0);
  });

  it("sends the held events, in order, when the user says yes", async () => {
    const { analytics, calls } = openTab({ consent: "pending" });
    analytics.track("first");
    analytics.track("second");

    analytics.setConsent("granted");
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["first", "second"]);
    expect(localStorage.getItem("analytics:anonymousId")).toBe(
      calls[0].batch.events[0].anonymousId,
    );
  });

  it("sends at once after a yes when a full batch was held", async () => {
    const { analytics, calls } = openTab({ consent: "pending", batchSize: 20 });
    trackMany(analytics, 20);

    analytics.setConsent("granted");
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toHaveLength(1);
  });

  it("holds at most maxQueueSize events while it waits for the choice", async () => {
    const { analytics, calls, answer } = openTab({
      consent: "pending",
      maxQueueSize: 5,
      batchSize: 10,
    });
    trackMany(analytics, 10_000);

    analytics.setConsent("granted");
    await vi.advanceTimersByTimeAsync(5000);
    await answer({ kind: "ok" });

    expect(calls).toHaveLength(1);
    expect(calls[0].batch.events).toHaveLength(5);
    expect(calls[0].batch.dropped).toBe(9995);
  });

  it("throws the held events away when the user says no", async () => {
    const { analytics, calls } = openTab({ consent: "pending" });
    trackMany(analytics, 3);

    analytics.setConsent("denied");
    analytics.setConsent("granted");
    await analytics.flush();

    expect(calls).toHaveLength(0);
  });
});

describe("consent denied", () => {
  it("collects nothing when the option says denied", async () => {
    const { analytics, calls } = openTab({ consent: "denied" });

    trackMany(analytics, 25);
    await analytics.flush();

    expect(calls).toHaveLength(0);
    expect(localStorage.length).toBe(0);
  });

  it("removes the id, the session and the stored queue, and keeps only the choice", async () => {
    const { analytics } = openTab();
    trackMany(analytics, 3);
    await idle();
    expect(storedQueueKeys()).toHaveLength(1);

    analytics.setConsent("denied");

    expect(Object.keys(localStorage)).toEqual(["analytics:consent"]);
    expect(localStorage.getItem("analytics:consent")).toBe("denied");
  });

  it("also removes the queues that other tabs stored", async () => {
    trackMany(openTab().analytics, 3);
    await idle();
    expect(storedQueueKeys()).toHaveLength(1);
    const { analytics } = openTab();

    analytics.optOut();

    expect(storedQueueKeys()).toEqual([]);
  });
});

describe("the stored choice", () => {
  it("a stored no wins over the option after a reload", async () => {
    openTab().analytics.setConsent("denied");

    const { analytics, calls } = openTab({ consent: "granted" });
    analytics.track("clicked");
    await analytics.flush();

    expect(calls).toHaveLength(0);
  });

  it("a stored yes wins over a pending option after a reload", async () => {
    openTab({ consent: "pending" }).analytics.setConsent("granted");

    const { analytics, calls } = openTab({ consent: "pending" });
    analytics.track("clicked");
    void analytics.flush();

    expect(calls).toHaveLength(1);
  });

  it("ignores a value that is not a choice", async () => {
    const { analytics, calls } = openTab();

    analytics.setConsent("maybe" as "granted");
    analytics.setConsent("pending" as "granted");
    analytics.track("clicked");
    void analytics.flush();

    expect(calls).toHaveLength(1);
    expect(localStorage.getItem("analytics:consent")).toBeNull();
  });
});
