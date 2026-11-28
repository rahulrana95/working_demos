/*
 * NOT PART OF THE INTERVIEW: production version.
 * The demo page. It shows the calendar and a small panel with what the fake
 * server and the monitoring saw. The page owns the date, the view, the time
 * zone and the language: the calendar shows what it is given.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createClockChangeEvents,
  createDemoEvents,
  createFakeServer,
  createSeriesEvents,
} from "./api/fakeServer";
import { Calendar, startOfDay, startOfWeek } from "./calendar";
import type { CalendarLogEvent, CalendarView } from "./calendar";

const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TIME_ZONES = [BROWSER_ZONE, "Asia/Kolkata", "America/New_York", "Europe/London", "UTC"];
const LOCALES = ["en-GB", "en-US", "hi-IN", "ar-EG"];
const VIEWS: CalendarView[] = ["day", "week", "month"];
/** Noon in New York on the two days of 2026 on which its clocks change. */
const CLOCKS_FORWARD = Date.parse("2026-03-08T16:00:00Z");
const CLOCKS_BACK = Date.parse("2026-11-01T17:00:00Z");

export function App() {
  const [date, setDate] = useState(() => Date.now());
  const [view, setView] = useState<CalendarView>(() =>
    window.matchMedia("(min-width: 800px)").matches ? "week" : "day",
  );
  const [timeZone, setTimeZone] = useState(BROWSER_ZONE);
  const [locale, setLocale] = useState("en-GB");
  const [requestCount, setRequestCount] = useState(0);
  const [log, setLog] = useState<CalendarLogEvent[]>([]);
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  /** A new key makes a new calendar, which loads again. */
  const [reloadKey, setReloadKey] = useState(0);
  const [boxCount, setBoxCount] = useState(0);
  const calendarRef = useRef<HTMLDivElement>(null);

  // The server is created once. It reads the two checkboxes from a ref, so
  // ticking one does not create a new server.
  const switches = useRef({ isServerFailing, isOffline });
  useEffect(() => {
    switches.current = { isServerFailing, isOffline };
  }, [isServerFailing, isOffline]);

  const server = useMemo(() => {
    const today = startOfDay(Date.now(), BROWSER_ZONE);
    const seed = [
      ...createDemoEvents(today),
      ...createSeriesEvents(today, BROWSER_ZONE),
      ...createClockChangeEvents(),
    ];
    return createFakeServer(seed, {
      shouldFail: () => switches.current.isServerFailing,
      isOffline: () => switches.current.isOffline,
      onRequest: () => setRequestCount((count) => count + 1),
    });
  }, []);

  // Count the event boxes on screen after every render, for the panel.
  useEffect(() => {
    const boxes = calendarRef.current?.querySelectorAll("[data-event-id]").length ?? 0;
    setBoxCount((old) => (old === boxes ? old : boxes));
  });

  const isRtl = locale.startsWith("ar");

  /** The same day of the previous or the next day, week or month. */
  function step(direction: 1 | -1) {
    if (view === "month") {
      // Day 15 is in the same month in every time zone. 31 days from it is the 15th or so of the next one.
      const midMonth = new Date(date);
      midMonth.setUTCDate(15);
      setDate(midMonth.getTime() + direction * 31 * 24 * 3_600_000);
    } else {
      setDate(startOfDay(date, timeZone, direction * (view === "week" ? 7 : 1)));
    }
  }

  function showClockChange(day: number) {
    setTimeZone("America/New_York");
    setView("day");
    setDate(day);
  }

  function reload() {
    setReloadKey((key) => key + 1);
  }

  return (
    <main className="page" lang={locale} dir={isRtl ? "rtl" : "ltr"}>
      <h1>Chapter 10: Calendar</h1>
      <p className="page__intro">
        Click an hour to make an event. Click an event to change or delete it. Drag an event to move
        it, and drag its lower edge to change its end. With the keyboard: Tab to an event, press{" "}
        <kbd>M</kbd>, move it with the arrow keys, then <kbd>Enter</kbd>.
      </p>

      <div className="page__nav">
        <button type="button" onClick={() => step(-1)}>
          Previous
        </button>
        <button type="button" onClick={() => setDate(Date.now())}>
          Today
        </button>
        <button type="button" onClick={() => step(1)}>
          Next
        </button>
        {VIEWS.map((name) => (
          <button
            type="button"
            key={name}
            aria-pressed={view === name}
            onClick={() => setView(name)}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
        <label>
          Time zone{" "}
          <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
            {[...new Set(TIME_ZONES)].map((zone) => (
              <option key={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <label>
          Language{" "}
          <select value={locale} onChange={(event) => setLocale(event.target.value)}>
            {LOCALES.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
        </label>
      </div>
      <h2 className="page__date" aria-live="polite">
        {new Intl.DateTimeFormat(
          locale,
          view === "month"
            ? { timeZone, month: "long", year: "numeric" }
            : { timeZone, dateStyle: "full" },
        ).format(date)}
      </h2>

      <div className="page__columns">
        <div ref={calendarRef}>
          <Calendar
            key={reloadKey}
            date={date}
            view={view}
            onNavigate={(newDate, newView) => {
              setDate(newDate);
              setView(newView);
            }}
            timeZone={timeZone}
            locale={locale}
            storageKey="chapter-10-demo"
            onEvent={(event) => setLog((events) => [...events, event].slice(-8))}
            fetchEvents={server.fetchEvents}
            saveEvent={server.saveEvent}
            deleteEvent={server.deleteEvent}
          />
        </div>

        <section className="panel" aria-label="What is happening" dir="ltr" lang="en">
          <label className="panel__toggle">
            <input
              type="checkbox"
              checked={isServerFailing}
              onChange={(event) => setIsServerFailing(event.target.checked)}
            />
            Make the server fail
          </label>
          <label className="panel__toggle">
            <input
              type="checkbox"
              checked={isOffline}
              onChange={(event) => setIsOffline(event.target.checked)}
            />
            Go offline (edits wait in a queue)
          </label>
          <button
            type="button"
            onClick={() => {
              const title = server.changeAsSomeoneElse(startOfDay(Date.now(), timeZone));
              window.alert(
                title === null
                  ? "Today has no event to change."
                  : `Asha has changed "${title}" on the server. This page does not know yet. Now move that event here.`,
              );
            }}
          >
            Let someone else change an event of today
          </button>
          <button
            type="button"
            onClick={() => {
              const weekStart = startOfWeek(Date.now(), timeZone, 1);
              server.addRandomEvents(5000, weekStart, 7);
              setDate(Date.now());
              setView("week");
              reload();
            }}
          >
            Load 5,000 random events into this week
          </button>
          <button type="button" onClick={() => showClockChange(CLOCKS_FORWARD)}>
            New York, 8 March 2026: a day of 23 hours
          </button>
          <button type="button" onClick={() => showClockChange(CLOCKS_BACK)}>
            New York, 1 November 2026: a day of 25 hours
          </button>

          <p>
            <strong>Events on the server: {server.eventCount()}</strong>
          </p>
          <p>
            <strong>Event boxes in the page: {boxCount}</strong>
          </p>
          <p>
            <strong>Requests sent to the server: {requestCount}</strong>
          </p>
          <p>
            <strong>Monitoring (the last 8 events):</strong>
          </p>
          <ol className="panel__events">
            {log.map((event, index) => (
              <li key={index}>{JSON.stringify(event)}</li>
            ))}
          </ol>
          <p className="panel__hint">
            Open this page in a second tab and move an event: the other tab shows the move without a
            reload. Each tab has its own fake server, so only the calendar is kept in step.
          </p>
        </section>
      </div>
    </main>
  );
}
