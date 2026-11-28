/*
 * NOT PART OF THE INTERVIEW: production version.
 * The calendar a team ships. It puts the parts together and draws almost
 * nothing itself:
 *   - useCalendarEvents: loading by week, the queue of edits, conflicts, tabs.
 *   - expandRecurrence: a series becomes the single events of the visible range.
 *   - TimeGrid (day and week) and MonthView draw them.
 *   - useEventDrag: moving and resizing, by pointer and by keyboard.
 *   - EventForm: the form.
 *
 * The page owns the date and the view. When the calendar wants another one
 * (the user pressed "+3 more" in the month), it asks with `onNavigate`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EventForm } from "./EventForm";
import type { EditScope } from "./EventForm";
import { HOUR_MS } from "./layoutDay";
import { defaultMessages, plural } from "./messages";
import type { CalendarMessages } from "./messages";
import { MonthView } from "./MonthView";
import { monthDays } from "./monthGrid";
import { expandRecurrence, toStoredEdit } from "./recurrence";
import { TimeGrid } from "./TimeGrid";
import { createFormatters, firstDayOfWeek, startOfDay, startOfWeek, toIso } from "./time";
import type { CalendarEvent, CalendarLogEvent, CalendarServer, CalendarView } from "./types";
import { useCalendarEvents } from "./useCalendarEvents";
import { useEventDrag } from "./useEventDrag";

export interface CalendarProps extends CalendarServer {
  /** Any instant of the day to show, as a timestamp. A new value shows a new day, week or month. */
  date: number;
  /** "day" shows the day of `date`, "week" its week, "month" its month. Default: "week". */
  view?: CalendarView;
  /** Called when the user asks for another day or view from inside the calendar. */
  onNavigate?: (date: number, view: CalendarView) => void;
  /** An IANA time zone such as "Asia/Kolkata". Default: the time zone of the browser. */
  timeZone?: string;
  /** A language tag such as "en-GB" or "hi-IN". Default: the language of the browser. */
  locale?: string;
  /** Your own texts. Any text you leave out stays English. */
  messages?: Partial<CalendarMessages>;
  /** The most event columns a day of the week view draws side by side. The day view draws three times as many. Default: 4. */
  maxColumns?: number;
  /**
   * Names the queue of unsent edits in localStorage and the channel to other
   * tabs. Two calendars with the same key share both. `null` turns both off.
   * Default: "calendar".
   */
  storageKey?: string | null;
  /** A request that takes longer than this many milliseconds has failed. Default: 10,000. */
  timeoutMs?: number;
  /** Receives what happened and how long it took, for monitoring. Never any data of the user. */
  onEvent?: (event: CalendarLogEvent) => void;
}

export function Calendar(props: CalendarProps) {
  const { date, view = "week", onNavigate, locale, messages, maxColumns = 4, onEvent } = props;
  const { storageKey = "calendar", timeoutMs = 10_000 } = props;
  const { fetchEvents, saveEvent, deleteEvent } = props;
  const timeZone = props.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  /** The event in the form. `null` when the form is closed. */
  const [draft, setDraft] = useState<CalendarEvent | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const listsRef = useRef<HTMLDivElement>(null);
  /** Where the focus goes when the form closes: the event with this id, or else this element. */
  const focusAfterClose = useRef<{ eventId: string; opener: Element | null } | null>(null);
  // The texts change only when the parent passes other messages.
  const text = useMemo(() => ({ ...defaultMessages, ...messages }), [messages]);
  // Making a formatter is slow. We make them once, not once for each event.
  const format = useMemo(() => createFormatters(locale, timeZone), [locale, timeZone]);

  // The days on screen, and the weeks to load for them.
  const firstDay = firstDayOfWeek(locale);
  const month = view === "month" ? monthDays(date, timeZone, firstDay) : null;
  const weekStart = month === null ? startOfWeek(date, timeZone, firstDay) : month[0].start;
  const weekCount = month === null ? 1 : 6;
  const weeks = Array.from({ length: weekCount + 3 }, (_, index) =>
    startOfDay(weekStart, timeZone, (index - 1) * 7),
  );
  const dayStart = view === "day" ? startOfDay(date, timeZone) : weekStart;
  const days =
    month ??
    Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => ({
      start: startOfDay(dayStart, timeZone, index),
      end: startOfDay(dayStart, timeZone, index + 1),
    }));
  const rangeStart = days[0].start;
  const rangeEnd = days[days.length - 1].end;

  const calendar = useCalendarEvents({
    weeks,
    storageKey,
    timeoutMs,
    onEvent,
    fetchEvents,
    saveEvent,
    deleteEvent,
  });
  const stored = calendar.events;

  /** Sends one edit of an event on screen. `edited` is null for a delete. */
  function commit(
    original: CalendarEvent,
    edited: CalendarEvent | null,
    scope: EditScope,
    by: "drag" | "keyboard" | "form",
  ) {
    const edit = toStoredEdit(stored, original, edited, scope);
    if ("save" in edit) {
      calendar.save(edit.save, by);
    } else {
      calendar.remove(edit.removeId);
    }
  }

  const drag = useEventDrag({
    timeZone,
    getDayWidth: () => (listsRef.current?.getBoundingClientRect().width ?? 0) / days.length,
    isRtl: () => rootRef.current !== null && getComputedStyle(rootRef.current).direction === "rtl",
    // A drag of one event of a series changes that one event.
    onDrop: (edited, original, by) => commit(original, edited, "this", by),
  });

  // A series is expanded for the visible range only, on every render. The
  // event that is being dragged is drawn where the drag has it now.
  const moving = drag.drag;
  const visible = stored
    .flatMap((event) => expandRecurrence(event, rangeStart, rangeEnd))
    .map((event) => (event.id === moving?.original.id ? moving.preview : event));

  // The line for the present time moves once a minute.
  useEffect(() => {
    const timerId = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timerId);
  }, []);

  // For monitoring: how long a new view took until its events were on screen.
  const viewChange = useRef<{ key: string; at: number } | null>(null);
  const viewKey = `${view}:${rangeStart}`;
  useEffect(() => {
    if (viewChange.current?.key !== viewKey) {
      viewChange.current = { key: viewKey, at: Date.now() };
    }
    if (calendar.status === "ready" && viewChange.current.at !== -1) {
      onEvent?.({ type: "view_changed", view, durationMs: Date.now() - viewChange.current.at });
      // -1 marks this view as reported.
      viewChange.current.at = -1;
    }
    // `onEvent` and `view` are not in the list: `viewKey` changes with the view, and a
    // new function from the parent must not report the view again.
  }, [viewKey, calendar.status]);

  // When the form closes, focus goes back to the event. If the event is not
  // there (deleted, or never saved), focus goes to where the user came from.
  useEffect(() => {
    const target = focusAfterClose.current;
    if (draft === null && target !== null) {
      focusAfterClose.current = null;
      const boxes = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [],
      );
      // A new series is on screen as its single events. Their ids start with the id of the series.
      const box = boxes.find(
        ({ dataset }) =>
          dataset.eventId === target.eventId || dataset.eventId?.startsWith(`${target.eventId}@`),
      );
      // The opener counts only if it is still in the calendar.
      const opener =
        target.opener instanceof HTMLElement && rootRef.current?.contains(target.opener)
          ? target.opener
          : null;
      (box ?? opener ?? rootRef.current?.querySelector<HTMLElement>('[tabindex="0"]'))?.focus();
    }
  }, [draft]);

  function openForm(event: CalendarEvent) {
    focusAfterClose.current = { eventId: event.id, opener: document.activeElement };
    setDraft(event);
  }

  function openNewEvent(start: number) {
    const end = toIso(start + HOUR_MS);
    openForm({ id: crypto.randomUUID(), title: "", start: toIso(start), end });
  }

  /** The event in the form as it is on screen now, or undefined for a new event. */
  const draftOnScreen = draft === null ? undefined : visible.find((event) => event.id === draft.id);
  const movingLabel =
    moving?.by === "keyboard"
      ? `${text.moving(...(format.labelParts(moving.preview).slice(1) as [string, string, string]))}. ${text.moveHelp}`
      : "";
  const shared = { events: visible, now, timeZone, locale, format, text, onOpen: openForm };
  const showDay = (start: number) => onNavigate?.(start, "day");

  return (
    <div className="calendar" ref={rootRef}>
      {calendar.status === "loading" && <p className="calendar__note">{text.loading}</p>}
      {calendar.status === "error" && (
        <p role="alert">
          {text.loadFailed}{" "}
          <button type="button" onClick={calendar.retry}>
            {text.tryAgain}
          </button>
        </p>
      )}
      {calendar.problem !== null && (
        <p role="alert">{calendar.problem === "conflict" ? text.conflict : text.saveFailed}</p>
      )}
      {calendar.waitingCount > 0 && (
        <p className="calendar__waiting" role="status">
          {plural(text.waiting, calendar.waitingCount, locale)}{" "}
          <button type="button" onClick={calendar.sendNow}>
            {text.sendNow}
          </button>
        </p>
      )}
      {/* Says where the event is after each step of a move with the keyboard. */}
      <p className="visually-hidden" role="status">
        {movingLabel}
      </p>
      {draft !== null && (
        <EventForm
          // A new time zone makes a new form, because its inputs show wall times.
          key={draft.id + timeZone}
          event={draft}
          isNew={draftOnScreen === undefined}
          timeZone={timeZone}
          text={text}
          onSave={(edited, scope) => commit(draftOnScreen ?? draft, edited, scope, "form")}
          onDelete={(scope) => commit(draftOnScreen ?? draft, null, scope, "form")}
          onClose={() => setDraft(null)}
        />
      )}
      {month === null ? (
        <TimeGrid
          {...shared}
          days={days}
          maxColumns={view === "day" ? maxColumns * 3 : maxColumns}
          drag={drag}
          listsRef={listsRef}
          onOpenNew={openNewEvent}
          onShowDay={showDay}
        />
      ) : (
        <MonthView {...shared} days={month} onShowDay={showDay} />
      )}
    </div>
  );
}
