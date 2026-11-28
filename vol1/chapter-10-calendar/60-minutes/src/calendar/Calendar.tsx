/*
 * PART OF THE INTERVIEW: yes (about 16 minutes).
 * Write it after the layout function and the hook. It only draws what they
 * return: one day or one week, a row for each hour, and the event boxes on top.
 *
 * The view is two things, one drawn over the other:
 *   - for each day, a list of its events in time order. Each event is a
 *     button with a full spoken label. These are also the lists a screen
 *     reader user reads.
 *   - a grid of empty slots: a row for each hour, a cell for each day. A slot
 *     makes a new event. The arrow keys move inside the grid.
 *
 * A week is seven calls of the same layout function, one for each day. An
 * event that spans two days is clipped twice and so is drawn in both.
 *
 * A row is one real hour after the start of its day, not a fixed time on the
 * clock. On the day the clocks go forward the day has 23 rows, and on the day
 * they go back it has 25. Each slot shows its own time, so a row can hold
 * 02:00 for one day and 03:00 for the next and still be right.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { EventForm } from "./EventForm";
import { HOUR_MS, layoutDay } from "./layoutDay";
import { defaultMessages } from "./messages";
import type { CalendarMessages } from "./messages";
import { createFormatters, firstDayOfWeek, startOfDay, startOfWeek, toIso } from "./time";
import type { CalendarEvent, CalendarServer } from "./types";
import { useCalendarEvents } from "./useCalendarEvents";

export interface CalendarProps extends CalendarServer {
  /** Any instant of the day to show, as a timestamp. A new value shows a new day or week. */
  date: number;
  /** "day" shows the day of `date`. "week" shows its week. Default: "week". */
  view?: "day" | "week";
  /** An IANA time zone such as "Asia/Kolkata". Default: the time zone of the browser. */
  timeZone?: string;
  /** A language tag such as "en-GB" or "hi-IN". Default: the language of the browser. */
  locale?: string;
  /** Your own texts. Any text you leave out stays English. */
  messages?: Partial<CalendarMessages>;
}

/**
 * The arrow keys move focus between the buttons in the container.
 * `columns` is how many buttons one row holds.
 */
function moveFocus(keyEvent: KeyboardEvent<HTMLElement>, columns = 1) {
  // In a right-to-left page, ArrowRight goes to the cell before.
  const forward = getComputedStyle(keyEvent.currentTarget).direction === "rtl" ? -1 : 1;
  const steps = { ArrowDown: columns, ArrowUp: -columns, ArrowRight: forward, ArrowLeft: -forward };
  // Any other key finds no step, and then no button.
  const step = steps[keyEvent.key as keyof typeof steps];
  const buttons = Array.from(keyEvent.currentTarget.querySelectorAll("button"));
  const next = buttons[buttons.indexOf(keyEvent.target as HTMLButtonElement) + step];
  if (next !== undefined) {
    keyEvent.preventDefault();
    next.focus();
  }
}

export function Calendar(props: CalendarProps) {
  const { date, view = "week", locale, messages, ...server } = props;
  const timeZone = props.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  /** The event in the form. `null` when the form is closed. */
  const [draft, setDraft] = useState<CalendarEvent | null>(null);
  /** The slot that is the Tab stop of the grid: its row and its day. */
  const [active, setActive] = useState({ row: 9, day: 0 });
  const activeSlot = useRef<HTMLButtonElement>(null);
  /** The DOM id of the event button that gets the focus when the form closes. */
  const focusAfterClose = useRef<string | null>(null);
  const idPrefix = useId();
  const text = { ...defaultMessages, ...messages };
  // Making a formatter is slow. We make them once, not once for each event.
  const format = useMemo(() => createFormatters(locale, timeZone), [locale, timeZone]);

  const weekStart = startOfWeek(date, timeZone, firstDayOfWeek(locale));
  const weeks = [-7, 0, 7, 14].map((days) => startOfDay(weekStart, timeZone, days));
  const calendar = useCalendarEvents({ weeks, ...server });

  const dayCount = view === "week" ? 7 : 1;
  const firstDay = view === "week" ? weekStart : startOfDay(date, timeZone);
  const days = Array.from({ length: dayCount }, (_, index) => {
    const [start, end] = [index, index + 1].map((plus) => startOfDay(firstDay, timeZone, plus));
    return { start, end, boxes: layoutDay(calendar.events, start, end) };
  });
  // 24 rows, or 23 or 25 when the clocks change on one of the days.
  const rowCount = Math.max(...days.map((day) => Math.ceil((day.end - day.start) / HOUR_MS)));

  // When the form closes, focus goes back to the event. If the event is not
  // there (deleted, or never saved), focus goes to the slot the user was on.
  useEffect(() => {
    if (draft === null && focusAfterClose.current !== null) {
      (document.getElementById(focusAfterClose.current) ?? activeSlot.current)?.focus();
      focusAfterClose.current = null;
    }
  }, [draft]);

  function openForm(event: CalendarEvent, dayStart: number) {
    focusAfterClose.current = idPrefix + event.id + dayStart;
    setDraft(event);
  }

  function openNewEvent(start: number, dayStart: number) {
    const end = toIso(start + HOUR_MS);
    openForm({ id: crypto.randomUUID(), title: "", start: toIso(start), end }, dayStart);
  }

  return (
    <div className="calendar">
      {calendar.status === "loading" && <p>{text.loading}</p>}
      {calendar.status === "error" && (
        <p role="alert">
          {text.loadFailed}{" "}
          <button type="button" onClick={calendar.retry}>
            {text.tryAgain}
          </button>
        </p>
      )}
      {calendar.saveFailed && <p role="alert">{text.saveFailed}</p>}
      {draft !== null && (
        <EventForm
          // A new time zone makes a new form, because its inputs show wall times.
          key={draft.id + timeZone}
          event={draft}
          isNew={!calendar.events.some((event) => event.id === draft.id)}
          timeZone={timeZone}
          text={text}
          onSave={calendar.save}
          onDelete={calendar.remove}
          onClose={() => setDraft(null)}
        />
      )}
      <div className="calendar__days">
        <div className="calendar__lists" onKeyDown={moveFocus}>
          {days.map((day) => (
            <ol key={day.start} aria-label={text.eventsOn(format.day(day.start))}>
              {day.boxes.map(({ event, column, columnCount, ...box }) => (
                <li
                  key={event.id}
                  style={{
                    ...box,
                    insetInlineStart: `${(column / columnCount) * 100}%`,
                    width: `${100 / columnCount}%`,
                  }}
                >
                  <button
                    type="button"
                    id={idPrefix + event.id + day.start}
                    aria-label={text.eventLabel(...format.labelParts(event))}
                    onClick={() => openForm(event, day.start)}
                  >
                    {event.title}
                  </button>
                </li>
              ))}
            </ol>
          ))}
        </div>
        <div role="grid" aria-label={text.newEvent} onKeyDown={(e) => moveFocus(e, dayCount)}>
          <div role="row">
            {days.map((day) => (
              <div role="columnheader" key={day.start}>
                {format.weekday(day.start)}
              </div>
            ))}
          </div>
          {Array.from({ length: rowCount }, (_, row) => (
            <div role="row" key={row}>
              {days.map((day, dayIndex) => {
                const start = day.start + row * HOUR_MS;
                const isActive = row === active.row && dayIndex === active.day % dayCount;
                return (
                  <div role="gridcell" key={day.start}>
                    <button
                      type="button"
                      // A short day has no slot in its last row. The empty button keeps the columns in step.
                      disabled={start >= day.end}
                      ref={isActive ? activeSlot : null}
                      tabIndex={isActive ? 0 : -1}
                      onFocus={() => setActive({ row, day: dayIndex })}
                      onClick={() => openNewEvent(start, day.start)}
                    >
                      {start < day.end && format.time(start)}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
