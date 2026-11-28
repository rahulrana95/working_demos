/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the plugin interface and the example destination.
 */
import { dataLayerDestination } from "./plugins/dataLayerDestination";
import { idle, openTab, useSdkTestSetup } from "./testHelpers";
import type { AnalyticsEvent, Plugin } from "./types";

useSdkTestSetup();

describe("a plugin with enrich", () => {
  it("can add to every event, after beforeSend", () => {
    const order: string[] = [];
    const { analytics, calls } = openTab({
      beforeSend: (event) => {
        order.push("beforeSend");
        return event;
      },
    });
    analytics.use({
      name: "app-version",
      enrich: (event) => {
        order.push("plugin");
        return { ...event, properties: { ...event.properties, appVersion: "2.4.0" } };
      },
    });

    analytics.track("clicked", { button: "buy" });
    void analytics.flush();

    expect(calls[0].batch.events[0].properties).toEqual({ button: "buy", appVersion: "2.4.0" });
    expect(order).toEqual(["beforeSend", "plugin"]);
  });

  it("can drop an event by returning null", () => {
    const { analytics, calls } = openTab({
      plugins: [{ name: "no-bots", enrich: (event) => (event.name === "bot_ping" ? null : event) }],
    });

    analytics.track("bot_ping");
    analytics.track("clicked");
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["clicked"]);
    expect(analytics.getStats().dropped).toBe(0);
  });

  it("does not run for an event that beforeSend dropped", () => {
    const enrich = vi.fn((event: AnalyticsEvent) => event);
    const { analytics } = openTab({ beforeSend: () => null, plugins: [{ name: "spy", enrich }] });

    analytics.track("clicked");
    void analytics.flush();

    expect(enrich).not.toHaveBeenCalled();
  });

  it("drops the event when it throws, and tells onError", () => {
    const onError = vi.fn();
    const { analytics, calls } = openTab({ onError });
    analytics.use({
      name: "broken",
      enrich: (event) => {
        if (event.name === "bad") {
          throw new Error("plugin failed");
        }
        return event;
      },
    });

    expect(() => analytics.track("bad")).not.toThrow();
    analytics.track("good");
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["good"]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "plugin");
    expect(analytics.getStats().dropped).toBe(1);
  });
});

describe("a destination plugin", () => {
  it("gets every event that goes to the collector, as it was queued", async () => {
    const delivered: AnalyticsEvent[] = [];
    const { analytics, calls } = openTab({
      plugins: [{ name: "copy", deliver: (event) => delivered.push(event) }],
    });

    analytics.track("clicked");
    analytics.page("Pricing");
    void analytics.flush();

    expect(delivered).toEqual(calls[0].batch.events);
  });

  it("does not stop the event from reaching the collector when it throws", () => {
    const onError = vi.fn();
    const after: string[] = [];
    const { analytics, calls } = openTab({
      onError,
      plugins: [
        {
          name: "broken",
          deliver: () => {
            throw new Error("destination failed");
          },
        },
        { name: "after", deliver: (event) => after.push(event.name) },
      ],
    });

    analytics.track("clicked");
    void analytics.flush();

    expect(calls[0].batch.events).toHaveLength(1);
    expect(after).toEqual(["clicked"]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "plugin");
  });

  it("gets nothing while consent is pending, and the held events once after a yes", async () => {
    const delivered: string[] = [];
    const { analytics } = openTab({
      consent: "pending",
      plugins: [{ name: "copy", deliver: (event) => delivered.push(event.name) }],
    });

    analytics.track("first");
    await idle();
    analytics.track("second");
    expect(delivered).toEqual([]);

    analytics.setConsent("granted");
    await idle();
    analytics.track("third");
    await idle();

    expect(delivered).toEqual(["first", "second", "third"]);
  });

  it("gets nothing after a no", async () => {
    const delivered: string[] = [];
    const { analytics } = openTab({
      consent: "pending",
      plugins: [{ name: "copy", deliver: (event) => delivered.push(event.name) }],
    });
    analytics.track("held");

    analytics.setConsent("denied");
    analytics.track("after");
    await idle();

    expect(delivered).toEqual([]);
  });

  it("does not get the events that this tab took over from a closed tab", async () => {
    const closed = openTab();
    closed.analytics.track("from the closed tab");
    await idle();
    vi.setSystemTime(Date.now() + 61_000);
    const delivered: string[] = [];

    const next = openTab({
      plugins: [{ name: "copy", deliver: (event) => delivered.push(event.name) }],
    });
    next.analytics.track("own");
    void next.analytics.flush();

    expect(next.calls[0].batch.events.map((event) => event.name)).toEqual([
      "from the closed tab",
      "own",
    ]);
    expect(delivered).toEqual(["own"]);
  });
});

describe("use", () => {
  it("ignores something that is not a plugin", () => {
    const { analytics, calls } = openTab();

    expect(() => {
      analytics.use(null as unknown as Plugin);
      analytics.use({} as Plugin);
    }).not.toThrow();
    analytics.track("clicked");
    void analytics.flush();

    expect(calls[0].batch.events).toHaveLength(1);
  });
});

describe("dataLayerDestination", () => {
  it("pushes the name and the properties of each event to the array, and no ids", () => {
    const dataLayer: unknown[] = [];
    const { analytics } = openTab({ plugins: [dataLayerDestination(dataLayer)] });

    analytics.identify("user_42");
    analytics.track("checkout_started", { cartValue: 1200 });
    void analytics.flush();

    expect(dataLayer).toEqual([
      { event: "identify" },
      { event: "checkout_started", cartValue: 1200 },
    ]);
  });
});
