/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove automatic page events in a single-page app.
 */
import { watchPageChanges } from "./pageTracking";
import { idle, installFakeBeacon, openTab, useSdkTestSetup } from "./testHelpers";

useSdkTestSetup();

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

afterEach(() => {
  history.pushState = originalPushState;
  history.replaceState = originalReplaceState;
});

describe("watchPageChanges", () => {
  it("reports pushState and replaceState to a new path", () => {
    const onChange = vi.fn();
    const stop = watchPageChanges(onChange);

    history.pushState(null, "", "/pricing");
    history.replaceState(null, "", "/checkout");

    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it("still does what the host asked: the URL and the state change", () => {
    const stop = watchPageChanges(vi.fn());

    history.pushState({ step: 2 }, "", "/pricing?plan=pro");

    expect(location.pathname + location.search).toBe("/pricing?plan=pro");
    expect(history.state).toEqual({ step: 2 });
    stop();
  });

  it("reports back and forward", () => {
    const onChange = vi.fn();
    const stop = watchPageChanges(onChange);
    // jsdom does not change the URL on `history.back()`, so the test moves it by hand.
    originalReplaceState.call(history, null, "", "/previous");

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not report a change of only the query string or the hash", () => {
    const onChange = vi.fn();
    const stop = watchPageChanges(onChange);

    history.pushState(null, "", "/?sort=price");
    history.replaceState(null, "", "/#reviews");

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it("does not let an error in the callback break the navigation", () => {
    const stop = watchPageChanges(() => {
      throw new Error("callback failed");
    });

    expect(() => history.pushState(null, "", "/pricing")).not.toThrow();
    expect(location.pathname).toBe("/pricing");
    stop();
  });

  it("lets an error of the real pushState reach the caller, as before", () => {
    const stop = watchPageChanges(vi.fn());

    expect(() => history.pushState(null, "", "https://another-site.test/")).toThrow();
    stop();
  });

  it("puts the original methods back when it stops", () => {
    const onChange = vi.fn();
    const stop = watchPageChanges(onChange);

    stop();
    history.pushState(null, "", "/after-stop");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(history.pushState).toBe(originalPushState);
    expect(history.replaceState).toBe(originalReplaceState);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves the wrapper of another library in place, and goes quiet, when it stops", () => {
    const onChange = vi.fn();
    const stop = watchPageChanges(onChange);
    const ours = history.pushState;
    const theirCalls: unknown[] = [];
    history.pushState = function (...args) {
      theirCalls.push(args[2]);
      ours.apply(this, args);
    };
    const theirs = history.pushState;

    stop();
    history.pushState(null, "", "/later");

    expect(history.pushState).toBe(theirs);
    expect(theirCalls).toEqual(["/later"]);
    expect(location.pathname).toBe("/later");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("automatic page events", () => {
  it("sends one page event at the start and one for each new path", async () => {
    document.title = "Home";
    const { analytics, calls } = openTab({ trackPages: true });

    history.pushState(null, "", "/pricing");
    history.pushState(null, "", "/pricing?plan=pro");
    history.pushState(null, "", "/checkout");
    void analytics.flush();

    const pages = calls[0].batch.events;
    expect(pages.map((event) => event.type)).toEqual(["page", "page", "page"]);
    expect(pages.map((event) => event.properties.path)).toEqual(["/", "/pricing", "/checkout"]);
    analytics.shutdown();
  });

  it("removes the query string from the URL it sends", async () => {
    const { analytics, calls } = openTab({ trackPages: true });

    history.pushState(null, "", "/reset?token=abc");
    void analytics.flush();

    expect(calls[0].batch.events[1].properties.url).toBe("http://localhost:3000/reset");
    analytics.shutdown();
  });

  it("is on by default", async () => {
    const { analytics, calls } = openTab({ trackPages: undefined });

    await idle();
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.type)).toEqual(["page"]);
    analytics.shutdown();
  });

  it("can be turned off: the history methods are not touched", async () => {
    const { analytics, calls } = openTab({ trackPages: false });

    history.pushState(null, "", "/pricing");
    await analytics.flush();

    expect(history.pushState).toBe(originalPushState);
    expect(calls).toHaveLength(0);
  });

  it("stops at shutdown", async () => {
    const beacon = installFakeBeacon();
    const { analytics, calls } = openTab({ trackPages: true });
    analytics.shutdown();
    expect(beacon.batches[0].events.map((event) => event.type)).toEqual(["page"]);

    history.pushState(null, "", "/pricing");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(history.pushState).toBe(originalPushState);
    expect(calls).toHaveLength(0);
  });
});
