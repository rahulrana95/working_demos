/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the loader snippet and the replay of the calls that
 * were made before the SDK had loaded.
 */
import { buildLoaderSnippet, startFromStub, STUB_METHODS } from "./loader";
import type { AnalyticsStub } from "./loader";
import { createFakeTransport, idle, useSdkTestSetup } from "./testHelpers";

useSdkTestSetup();

type PageWindow = Window & { analytics?: AnalyticsStub; myTracker?: AnalyticsStub };
const page = window as PageWindow;

const SNIPPET = buildLoaderSnippet({
  src: "https://cdn.test/analytics.umd.js",
  endpoint: "https://collector.test/v1/batch",
  writeKey: "key_1",
});

/** Runs the snippet the way a `<script>` tag would. */
function runSnippet(text: string = SNIPPET): void {
  new Function(text)();
}

function start(stub: AnalyticsStub) {
  const fake = createFakeTransport();
  const analytics = startFromStub(stub, {
    endpoint: "https://collector.test/v1/batch",
    writeKey: "key_1",
    transport: fake.transport,
    trackPages: false,
  });
  return { analytics, ...fake };
}

afterEach(() => {
  delete page.analytics;
  delete page.myTracker;
  document.head.querySelectorAll("script").forEach((script) => script.remove());
});

describe("the loader snippet", () => {
  it("makes a stub with every method, so the page can call the SDK at once", () => {
    runSnippet();

    for (const method of STUB_METHODS) {
      expect(typeof page.analytics?.[method]).toBe("function");
    }
  });

  it("loads the SDK with an async script, which does not block the page", () => {
    runSnippet();

    const script = document.head.querySelector("script");
    expect(script?.src).toBe("https://cdn.test/analytics.umd.js");
    expect(script?.async).toBe(true);
  });

  it("records each call with its arguments and its time", () => {
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    runSnippet();

    page.analytics?.track("signed_up", { plan: "pro" });

    expect(page.analytics?.calls).toEqual([
      {
        method: "track",
        args: ["signed_up", { plan: "pro" }],
        at: Date.parse("2026-01-02T03:04:05Z"),
      },
    ]);
  });

  it("does nothing the second time it runs, so calls already recorded are kept", () => {
    runSnippet();
    page.analytics?.track("first");

    runSnippet();

    expect(page.analytics?.calls).toHaveLength(1);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("records at most 500 calls when the SDK never loads, for example behind an ad blocker", () => {
    runSnippet();

    for (let index = 0; index < 10_000; index += 1) {
      page.analytics?.track("clicked");
    }

    expect(page.analytics?.calls).toHaveLength(500);
  });

  it("can use another global name", () => {
    runSnippet(
      buildLoaderSnippet({
        src: "/sdk.js",
        endpoint: "/collect",
        writeKey: "k",
        globalName: "myTracker",
      }),
    );

    expect(page.myTracker?.calls).toEqual([]);
    expect(page.analytics).toBeUndefined();
  });

  it("starts the SDK from the stub when the script has loaded", () => {
    const startFromStubSpy = vi.fn();
    vi.stubGlobal("AnalyticsSdk", { startFromStub: startFromStubSpy });
    runSnippet();

    document.head.querySelector("script")?.dispatchEvent(new Event("load"));

    expect(startFromStubSpy).toHaveBeenCalledWith(page.analytics, {
      endpoint: "https://collector.test/v1/batch",
      writeKey: "key_1",
    });
  });

  it("keeps a quote or a script tag in a setting from ending the snippet early", () => {
    const text = buildLoaderSnippet({ src: 'x"y', endpoint: "/collect", writeKey: "it's" });

    expect(() => runSnippet(text)).not.toThrow();
    expect(document.head.querySelector("script")?.getAttribute("src")).toBe('x"y');
  });
});

describe("startFromStub", () => {
  it("sends the calls made before the SDK loaded, in order, each with its own time", async () => {
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    runSnippet();
    const stub = page.analytics as AnalyticsStub;
    stub.identify("user_7");
    stub.track("landed");
    await vi.advanceTimersByTimeAsync(3000);
    stub.track("scrolled", { depth: 50 });
    await vi.advanceTimersByTimeAsync(2000);

    const { analytics, calls } = start(stub);
    void analytics.flush();

    const events = calls[0].batch.events;
    expect(events.map((event) => event.name)).toEqual(["identify", "landed", "scrolled"]);
    const startedAt = Date.parse("2026-01-02T03:04:05Z");
    expect(events.map((event) => event.timestamp - startedAt)).toEqual([0, 0, 3000]);
    expect(events.map((event) => event.userId)).toEqual(["user_7", "user_7", "user_7"]);
    expect(calls[0].batch.sentAt - startedAt).toBe(5000);
  });

  it("makes the stub call the SDK from then on, for code that kept the stub", async () => {
    runSnippet();
    const stub = page.analytics as AnalyticsStub;

    const { calls } = start(stub);
    stub.track("after load");
    await idle();
    void stub.flush();

    expect(stub.calls).toEqual([]);
    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["after load"]);
  });

  it("honours an opt-out that was recorded before the SDK loaded", async () => {
    runSnippet();
    const stub = page.analytics as AnalyticsStub;
    stub.track("before the choice");
    stub.optOut();
    stub.track("after the choice");

    const { analytics, calls } = start(stub);
    await analytics.flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls).toHaveLength(0);
    expect(localStorage.getItem("analytics:consent")).toBe("denied");
  });

  it("replays a recorded flush", async () => {
    runSnippet();
    const stub = page.analytics as AnalyticsStub;
    stub.track("clicked");
    stub.flush();

    const { calls } = start(stub);

    expect(calls).toHaveLength(1);
  });

  it("skips a recorded call that it does not know or cannot run, and runs the others", async () => {
    runSnippet();
    const stub = page.analytics as AnalyticsStub;
    stub.calls.push({ method: "selfDestruct", args: [], at: 1 });
    stub.calls.push(null as never);
    stub.track("clicked");

    const { analytics, calls } = start(stub);
    void analytics.flush();

    expect(calls[0].batch.events.map((event) => event.name)).toEqual(["clicked"]);
  });

  it("starts the SDK even when the stub is broken", async () => {
    const { analytics, calls } = start({ calls: "not a list" } as unknown as AnalyticsStub);
    const noStub = start(undefined as unknown as AnalyticsStub);

    analytics.track("clicked");
    void analytics.flush();
    noStub.analytics.track("clicked");
    void noStub.analytics.flush();

    expect(calls).toHaveLength(1);
    expect(noStub.calls).toHaveLength(1);
  });
});
