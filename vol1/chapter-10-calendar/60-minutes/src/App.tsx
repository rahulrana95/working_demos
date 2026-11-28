/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the calendar and a small panel with every request
 * that reached the fake server. The page owns the date, the view, the time
 * zone and the language: the calendar shows what it is given.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createClockChangeEvents, createDemoEvents, createFakeServer } from "./api/fakeServer";
import { Calendar, startOfDay } from "./calendar";

const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TIME_ZONES = [BROWSER_ZONE, "Asia/Kolkata", "America/New_York", "Europe/London", "UTC"];
const LOCALES = ["en-GB", "en-US", "hi-IN", "ar-EG"];
/** Noon in New York on the two days of 2026 on which its clocks change. */
const CLOCKS_FORWARD = Date.parse("2026-03-08T16:00:00Z");
const CLOCKS_BACK = Date.parse("2026-11-01T17:00:00Z");

export function App() {
  const [date, setDate] = useState(() => Date.now());
  const [view, setView] = useState<"day" | "week">(() =>
    window.matchMedia("(min-width: 800px)").matches ? "week" : "day",
  );
  const [timeZone, setTimeZone] = useState(BROWSER_ZONE);
  const [locale, setLocale] = useState("en-GB");
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [isServerFailing, setIsServerFailing] = useState(false);
  /** A new key makes a new calendar, which loads again. */
  const [reloadKey, setReloadKey] = useState(0);
  const [counts, setCounts] = useState({ boxes: 0, rows: 0 });
  const calendarRef = useRef<HTMLDivElement>(null);

  // The server is created once. It reads the checkbox value from a ref, so
  // ticking the checkbox does not create a new server.
  const isServerFailingRef = useRef(isServerFailing);
  useEffect(() => {
    isServerFailingRef.current = isServerFailing;
  }, [isServerFailing]);

  const server = useMemo(() => {
    const today = startOfDay(Date.now(), BROWSER_ZONE);
    return createFakeServer([...createDemoEvents(today), ...createClockChangeEvents()], {
      shouldFail: () => isServerFailingRef.current,
      onRequest: (description) => setRequestLog((log) => [...log, description]),
    });
  }, []);

  // Count the event boxes and the hour rows on screen after every render, for the panel.
  useEffect(() => {
    const boxes = calendarRef.current?.querySelectorAll("ol > li").length ?? 0;
    const rows = (calendarRef.current?.querySelectorAll('[role="row"]').length ?? 1) - 1;
    setCounts((old) => (old.boxes === boxes && old.rows === rows ? old : { boxes, rows }));
  });

  const step = view === "week" ? 7 : 1;
  const isRtl = locale.startsWith("ar");

  function showClockChange(day: number) {
    setTimeZone("America/New_York");
    setView("day");
    setDate(day);
  }

  return (
    <main className="page" lang={locale} dir={isRtl ? "rtl" : "ltr"}>
      <h1>Chapter 10: Calendar</h1>
      <p className="page__intro">
        Click an hour to make an event. Click an event to change or delete it. With the keyboard:
        Tab to the events or to the hours, then the arrow keys and <kbd>Enter</kbd>.
      </p>

      <div className="page__nav">
        <button type="button" onClick={() => setDate(startOfDay(date, timeZone, -step))}>
          Previous
        </button>
        <button type="button" onClick={() => setDate(Date.now())}>
          Today
        </button>
        <button type="button" onClick={() => setDate(startOfDay(date, timeZone, step))}>
          Next
        </button>
        <button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>
          Day
        </button>
        <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>
          Week
        </button>
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
        {new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "full" }).format(date)}
      </h2>

      <div className="page__columns">
        <div ref={calendarRef}>
          <Calendar
            key={reloadKey}
            date={date}
            view={view}
            timeZone={timeZone}
            locale={locale}
            fetchEvents={server.fetchEvents}
            saveEvent={server.saveEvent}
            deleteEvent={server.deleteEvent}
          />
        </div>

        <section className="panel" aria-label="What is happening" dir="ltr" lang="en">
          <button type="button" onClick={() => showClockChange(CLOCKS_FORWARD)}>
            New York, 8 March 2026: a day of 23 hours
          </button>
          <button type="button" onClick={() => showClockChange(CLOCKS_BACK)}>
            New York, 1 November 2026: a day of 25 hours
          </button>
          <button
            type="button"
            onClick={() => {
              server.addRandomEvents(500, startOfDay(Date.now(), timeZone));
              setDate(Date.now());
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
            <strong>Hour rows on screen: {counts.rows}</strong>
          </p>
          <p>
            <strong>Event boxes on screen: {counts.boxes}</strong>
          </p>
          <p>
            <strong>Requests sent to the server: {requestLog.length}</strong>
          </p>
          <ol className="panel__log">
            {requestLog.slice(-9).map((description, index) => (
              <li key={index}>{description}</li>
            ))}
          </ol>
          <p className="panel__hint">
            The list shows the last 9 requests. Each week is loaded once. Press "Next": no new
            request for the week you see, because it was loaded ahead, and one request for the week
            after it.
          </p>
        </section>
      </div>
    </main>
  );
}
