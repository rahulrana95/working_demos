/*
 * NOT PART OF THE INTERVIEW: production version.
 * The demo page. Buttons call the SDK, and a panel shows the health counters
 * of the SDK and every request that reached the fake collector.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createAnalytics, dataLayerDestination, scrubPageUrls } from "./analytics";
import { AnalyticsProvider, useAnalytics } from "./analytics/react";
import { createFakeCollector } from "./api/fakeCollector";
import type { CollectorSettings } from "./api/fakeCollector";

/** The events of this demo. `track` accepts no other name. */
type DemoEvents = {
  button_clicked: { button: string };
  "Bad Name": Record<string, never>;
};

const hook = { throws: false };
/** Stands in for the `dataLayer` array of a tag manager. */
const dataLayer: unknown[] = [];

// Made once, outside React: an SDK lives as long as the page.
const collector = createFakeCollector();
// The demo has no real collector, so the beacon of the page exit goes to the fake one too.
navigator.sendBeacon = collector.sendBeacon;
const analytics = createAnalytics<DemoEvents>({
  endpoint: "/collect",
  writeKey: "demo",
  transport: collector.transport,
  // Open the console of the browser to read what the SDK does.
  debug: true,
  plugins: [dataLayerDestination(dataLayer)],
  beforeSend: (event) => {
    if (hook.throws) {
      throw new Error("The beforeSend hook of the demo failed on purpose.");
    }
    return scrubPageUrls(event);
  },
});

const TOGGLES: Array<{ key: keyof CollectorSettings; label: string }> = [
  { key: "fail500", label: "Fail with 500 (the SDK retries)" },
  { key: "fail400", label: "Fail with 400 (the SDK drops the batch)" },
  { key: "rateLimit", label: "Rate limit with 429 (wait 3 seconds)" },
  { key: "slow", label: "Be slow (answer after 3 seconds)" },
  { key: "refuseBeacon", label: "Refuse beacons on page exit (as a browser does over 64 KiB)" },
];

const PAGES = ["/", "/pricing", "/checkout"];

export function App() {
  return (
    <AnalyticsProvider client={analytics}>
      <Demo />
    </AnalyticsProvider>
  );
}

function Demo() {
  const analytics = useAnalytics<DemoEvents>();
  const state = useSyncExternalStore(collector.subscribe, collector.getState);
  const [stats, setStats] = useState(() => analytics.getStats());
  const [settings, setSettings] = useState({ ...collector.settings });
  const [hookThrows, setHookThrows] = useState(false);
  const [isOptedOut, setIsOptedOut] = useState(false);
  const [path, setPath] = useState(location.pathname);

  // The SDK has no "stats changed" event, on purpose: a health check asks when it wants to know.
  useEffect(() => {
    const timerId = setInterval(() => setStats(analytics.getStats()), 250);
    return () => clearInterval(timerId);
  }, [analytics]);

  function fire(count: number): void {
    for (let index = 0; index < count; index += 1) {
      analytics.track("button_clicked", { button: "demo" });
    }
  }

  function toggle(key: keyof CollectorSettings, isOn: boolean): void {
    collector.settings[key] = isOn;
    setSettings({ ...collector.settings });
  }

  function toggleOptOut(): void {
    if (isOptedOut) {
      analytics.optIn();
    } else {
      analytics.optOut();
    }
    setIsOptedOut(!isOptedOut);
  }

  function goTo(nextPath: string): void {
    // A single-page app changes the URL like this. The SDK sees it and sends a page event.
    history.pushState(null, "", nextPath);
    setPath(nextPath);
  }

  return (
    <main className="page">
      <h1>Chapter 7: Analytics SDK</h1>
      <p className="page__intro">
        Each button calls the SDK. The SDK sends a batch when 20 events are waiting, or after 5
        seconds. Switch to another tab to see the page exit. The console of the browser shows what
        the SDK does.
      </p>

      <div className="buttons">
        <button type="button" onClick={() => fire(1)}>
          Track one event
        </button>
        <button type="button" onClick={() => fire(600)}>
          Track 600 events
        </button>
        <button type="button" onClick={() => analytics.track("Bad Name")}>
          Track a badly named event
        </button>
        <button type="button" onClick={() => analytics.identify("user_42")}>
          Identify
        </button>
        <button type="button" onClick={() => void analytics.flush()}>
          Flush now
        </button>
        <button type="button" aria-pressed={isOptedOut} onClick={toggleOptOut}>
          Opt out
        </button>
      </div>

      <nav className="buttons" aria-label="Pages of the demo">
        {PAGES.map((page) => (
          <button
            key={page}
            type="button"
            aria-current={page === path ? "page" : undefined}
            onClick={() => goTo(page)}
          >
            Go to {page}
          </button>
        ))}
      </nav>

      <label className="toggles__item">
        <input
          type="checkbox"
          checked={hookThrows}
          onChange={(event) => {
            hook.throws = event.target.checked;
            setHookThrows(event.target.checked);
          }}
        />
        Make the beforeSend hook throw (the event is dropped, the page goes on)
      </label>

      <fieldset className="toggles">
        <legend>Fake collector</legend>
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="toggles__item">
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(event) => toggle(key, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <section className="panel" aria-label="What is happening">
        <h2>Health counters of the SDK (getStats)</h2>
        <dl className="panel__counts">
          <div>
            <dt>Queued</dt>
            <dd data-testid="queued">{stats.queued}</dd>
          </div>
          <div>
            <dt>Sent</dt>
            <dd data-testid="sent">{stats.sent}</dd>
          </div>
          <div>
            <dt>Retried requests</dt>
            <dd data-testid="retried">{stats.retried}</dd>
          </div>
          <div>
            <dt>Dropped</dt>
            <dd data-testid="dropped">{stats.dropped}</dd>
          </div>
          <div>
            <dt>Last error</dt>
            <dd data-testid="last-error">{stats.lastError ?? "none"}</dd>
          </div>
        </dl>

        <h2>The fake collector</h2>
        <dl className="panel__counts">
          <div>
            <dt>Stored by the collector</dt>
            <dd data-testid="stored">{state.stored}</dd>
          </div>
          <div>
            <dt>Copies the collector dropped by id</dt>
            <dd data-testid="copies">{state.copies}</dd>
          </div>
          <div>
            <dt>Events handed to the dataLayer plugin</dt>
            <dd data-testid="data-layer">{dataLayer.length}</dd>
          </div>
        </dl>

        <h2>Requests that reached the collector: {state.requests.length}</h2>
        <ol className="panel__log">
          {state.requests.map((request) => (
            <li key={request.number} data-testid="request" data-at={request.atSeconds.toFixed(2)}>
              {request.atSeconds.toFixed(1)} s, {request.via}, {request.eventCount}{" "}
              {request.eventCount === 1 ? "event" : "events"}, {request.outcome}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
