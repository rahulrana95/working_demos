/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the calendar and a small panel with every request
 * that reached the fake server. The page owns the day: the calendar shows the
 * day it is given.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createDemoEvents, createFakeServer } from "./api/fakeServer";
import { Calendar } from "./calendar";

const DAY_MS = 24 * 3_600_000;

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function App() {
  // Noon, so that adding 24 hours is the next day even when the clocks change.
  const [date, setDate] = useState(() => startOfToday() + DAY_MS / 2);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [isServerFailing, setIsServerFailing] = useState(false);
  /** A new key makes a new calendar, which loads again. */
  const [reloadKey, setReloadKey] = useState(0);
  const [boxCount, setBoxCount] = useState(0);
  const calendarRef = useRef<HTMLDivElement>(null);

  // The server is created once. It reads the checkbox value from a ref, so
  // ticking the checkbox does not create a new server.
  const isServerFailingRef = useRef(isServerFailing);
  useEffect(() => {
    isServerFailingRef.current = isServerFailing;
  }, [isServerFailing]);

  const server = useMemo(
    () =>
      createFakeServer(createDemoEvents(startOfToday()), {
        shouldFail: () => isServerFailingRef.current,
        onRequest: (description) => setRequestLog((log) => [...log, description]),
      }),
    [],
  );

  // Count the event boxes on screen after every render, for the panel.
  useEffect(() => {
    setBoxCount(calendarRef.current?.querySelectorAll("ol > li").length ?? 0);
  });

  return (
    <main className="page">
      <h1>Chapter 10: Calendar</h1>
      <p className="page__intro">
        Click an hour to make an event. Click an event to change or delete it. With the keyboard:
        Tab to the events or to the hours, then <kbd>ArrowDown</kbd>, <kbd>ArrowUp</kbd> and{" "}
        <kbd>Enter</kbd>.
      </p>

      <div className="page__nav">
        <button type="button" onClick={() => setDate(date - DAY_MS)}>
          Previous day
        </button>
        <button type="button" onClick={() => setDate(startOfToday() + DAY_MS / 2)}>
          Today
        </button>
        <button type="button" onClick={() => setDate(date + DAY_MS)}>
          Next day
        </button>
        <h2 aria-live="polite">
          {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date)}
        </h2>
      </div>

      <div className="page__columns">
        <div ref={calendarRef}>
          <Calendar
            key={reloadKey}
            date={date}
            fetchEvents={server.fetchEvents}
            saveEvent={server.saveEvent}
            deleteEvent={server.deleteEvent}
          />
        </div>

        <section className="panel" aria-label="What is happening">
          <button
            type="button"
            onClick={() => {
              server.addRandomEvents(500, startOfToday());
              setDate(startOfToday() + DAY_MS / 2);
              setReloadKey((key) => key + 1);
            }}
          >
            Load 500 random events into today
          </button>

          <label className="panel__toggle">
            <input
              type="checkbox"
              checked={isServerFailing}
              onChange={(event) => setIsServerFailing(event.target.checked)}
            />
            Make the server fail
          </label>

          <p>
            <strong>Event boxes on screen: {boxCount}</strong>
          </p>
          <p>
            <strong>Requests sent to the server: {requestLog.length}</strong>
          </p>
          <ol className="panel__log">
            {requestLog.slice(-12).map((description, index) => (
              <li key={index}>{description}</li>
            ))}
          </ol>
          <p className="panel__hint">
            The list shows the last 12 requests. Save an event with "Make the server fail" ticked:
            the event shows at once, then it is undone and a message says so.
          </p>
        </section>
      </div>
    </main>
  );
}
