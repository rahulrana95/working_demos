/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. Buttons call the SDK, and a panel shows every request that
 * reached the fake collector.
 */
import { useState, useSyncExternalStore } from "react";
import { createAnalytics } from "./analytics";
import { createFakeCollector } from "./api/fakeCollector";
import type { CollectorSettings } from "./api/fakeCollector";

// Made once, outside React: an SDK lives as long as the page.
const collector = createFakeCollector();
// The demo has no real collector, so the beacon of the page exit goes to the fake one too.
navigator.sendBeacon = collector.sendBeacon;
const analytics = createAnalytics({
  endpoint: "/collect",
  writeKey: "demo",
  transport: collector.transport,
});

const TOGGLES: Array<{ key: keyof CollectorSettings; label: string }> = [
  { key: "fail500", label: "Fail with 500 (the SDK retries)" },
  { key: "fail400", label: "Fail with 400 (the SDK drops the batch)" },
  { key: "slow", label: "Be slow (answer after 3 seconds)" },
  { key: "refuseBeacon", label: "Refuse beacons on page exit (as a browser does over 64 KiB)" },
];

export function App() {
  const state = useSyncExternalStore(collector.subscribe, collector.getState);
  const [fired, setFired] = useState(0);
  const [settings, setSettings] = useState({ ...collector.settings });
  const [isOptedOut, setIsOptedOut] = useState(false);

  function fire(count: number, send: () => void): void {
    for (let index = 0; index < count; index += 1) {
      send();
    }
    if (!isOptedOut) {
      setFired((total) => total + count);
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
      // Opt-out throws away what was waiting, so the count starts again.
      setFired(state.stored);
    }
    setIsOptedOut(!isOptedOut);
  }

  const notStored = Math.max(0, fired - state.stored - state.droppedBySdk);

  return (
    <main className="page">
      <h1>Chapter 7: Analytics SDK</h1>
      <p className="page__intro">
        Each button calls the SDK. The SDK sends a batch when 20 events are waiting, or after 5
        seconds. Switch to another tab to see the page exit.
      </p>

      <div className="buttons">
        <button type="button" onClick={() => fire(1, () => analytics.track("button_clicked"))}>
          Track one event
        </button>
        <button type="button" onClick={() => fire(600, () => analytics.track("button_clicked"))}>
          Track 600 events
        </button>
        <button type="button" onClick={() => fire(1, () => analytics.page())}>
          Page view
        </button>
        <button type="button" onClick={() => fire(1, () => analytics.identify("user_42"))}>
          Identify
        </button>
        <button type="button" onClick={() => void analytics.flush()}>
          Flush now
        </button>
        <button type="button" aria-pressed={isOptedOut} onClick={toggleOptOut}>
          Opt out
        </button>
      </div>

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
        <dl className="panel__counts">
          <div>
            <dt>Events fired</dt>
            <dd data-testid="fired">{fired}</dd>
          </div>
          <div>
            <dt>Not at the collector yet</dt>
            <dd data-testid="waiting">{notStored}</dd>
          </div>
          <div>
            <dt>Stored by the collector</dt>
            <dd data-testid="stored">{state.stored}</dd>
          </div>
          <div>
            <dt>Copies the collector dropped by id</dt>
            <dd data-testid="copies">{state.copies}</dd>
          </div>
          <div>
            <dt>Dropped by the SDK</dt>
            <dd data-testid="dropped">{state.droppedBySdk}</dd>
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
