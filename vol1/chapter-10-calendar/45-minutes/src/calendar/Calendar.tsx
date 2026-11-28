/*
 * PART OF THE INTERVIEW: yes (about 10 minutes).
 * Write it after the layout function and the hook. It only draws what they
 * return: one day, 24 rows of one hour, and the event boxes on top.
 *
 * The day is two things, one drawn over the other:
 *   - a list of the events in time order. Each event is a button with a full
 *     spoken label. This is also the list a screen reader user reads.
 *   - a grid of empty slots, one for each hour. A slot makes a new event.
 * ArrowDown and ArrowUp move inside each of them.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { EventForm } from "./EventForm";
import { HOUR_HEIGHT, HOUR_MS, layoutDay } from "./layoutDay";
import { createFormatters, startOfDay, toIso } from "./time";
import type { CalendarEvent, CalendarServer } from "./types";
import { useCalendarEvents } from "./useCalendarEvents";

export interface CalendarProps extends CalendarServer {
  /** Any instant of the day to show, as a timestamp. A new value shows a new day. */
  date: number;
  /** A language tag such as "en-GB" or "hi-IN". Default: the language of the browser. */
  locale?: string;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** ArrowDown and ArrowUp move focus to the next or the previous button in the container. */
function moveFocus(keyEvent: KeyboardEvent<HTMLElement>) {
  const step = keyEvent.key === "ArrowDown" ? 1 : keyEvent.key === "ArrowUp" ? -1 : 0;
  const buttons = Array.from(keyEvent.currentTarget.querySelectorAll("button"));
  const next = buttons[buttons.indexOf(keyEvent.target as HTMLButtonElement) + step];
  if (step !== 0 && next !== undefined) {
    keyEvent.preventDefault();
    next.focus();
  }
}

export function Calendar({ date, locale, ...server }: CalendarProps) {
  const dayStart = startOfDay(date);
  const dayEnd = startOfDay(date, 1);
  const calendar = useCalendarEvents({ rangeStart: dayStart, rangeEnd: dayEnd, ...server });
  /** The event in the form. `null` when the form is closed. */
  const [draft, setDraft] = useState<CalendarEvent | null>(null);
  /** The slot that is the Tab stop of the grid. */
  const [activeHour, setActiveHour] = useState(9);
  const activeSlot = useRef<HTMLButtonElement>(null);
  const lastDraftId = useRef<string | null>(null);
  const idPrefix = useId();
  // Making a formatter is slow. We make them once for a locale, not once for each event.
  const format = useMemo(() => createFormatters(locale), [locale]);

  // When the form closes, focus goes back to the event. If the event is not
  // there (deleted, or never saved), focus goes to the slot the user was on.
  useEffect(() => {
    if (draft === null && lastDraftId.current !== null) {
      const eventButton = document.getElementById(idPrefix + lastDraftId.current);
      (eventButton ?? activeSlot.current)?.focus();
    }
    lastDraftId.current = draft?.id ?? null;
  }, [draft, idPrefix]);

  const boxes = layoutDay(calendar.events, dayStart, dayEnd);

  function openNewEvent(start: number) {
    const end = toIso(start + HOUR_MS);
    setDraft({ id: crypto.randomUUID(), title: "", start: toIso(start), end });
  }

  return (
    <div className="calendar">
      {calendar.status === "loading" && <p>Loading…</p>}
      {calendar.status === "error" && (
        <p role="alert">
          Could not load the events.{" "}
          <button type="button" onClick={calendar.retry}>
            Try again
          </button>
        </p>
      )}
      {calendar.saveFailed && <p role="alert">Could not save. Your change was undone.</p>}
      {draft !== null && (
        <EventForm
          key={draft.id}
          event={draft}
          isNew={!calendar.events.some((event) => event.id === draft.id)}
          onSave={calendar.save}
          onDelete={calendar.remove}
          onClose={() => setDraft(null)}
        />
      )}
      <div className="calendar__day" style={{ height: HOURS.length * HOUR_HEIGHT }}>
        <ol aria-label={`Events, ${format.day(dayStart)}`} onKeyDown={moveFocus}>
          {boxes.map(({ event, column, columnCount, ...box }) => (
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
                id={idPrefix + event.id}
                aria-label={format.label(event)}
                onClick={() => setDraft(event)}
              >
                {event.title}
              </button>
            </li>
          ))}
        </ol>
        <div role="grid" aria-label={`New event, ${format.day(dayStart)}`} onKeyDown={moveFocus}>
          {HOURS.map((hour) => (
            <div role="row" key={hour}>
              <div role="gridcell">
                <button
                  type="button"
                  ref={hour === activeHour ? activeSlot : null}
                  tabIndex={hour === activeHour ? 0 : -1}
                  onFocus={() => setActiveHour(hour)}
                  onClick={() => openNewEvent(dayStart + hour * HOUR_MS)}
                >
                  {format.time(dayStart + hour * HOUR_MS)}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
