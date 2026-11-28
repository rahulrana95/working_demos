/*
 * NOT PART OF THE INTERVIEW: production version.
 * The day view and the week view: a row for each hour, a column for each
 * day, and the event boxes on top. The structure is the one of ../60-minutes
 * (a list of events for each day, drawn over a grid of empty slots). This
 * version adds:
 *   - a row of all-day events above the hours;
 *   - a line for the present time;
 *   - dragging an event to move it, and dragging its lower edge to resize it;
 *   - a bounded page: at most `maxColumns` columns in a day, and only the
 *     boxes near the hours on screen (boundBoxes.ts).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { boxesInWindow, capColumns } from "./boundBoxes";
import { HOUR_HEIGHT, HOUR_MS, layoutDay } from "./layoutDay";
import { plural } from "./messages";
import type { CalendarMessages } from "./messages";
import { eventsOfDay } from "./monthGrid";
import type { createFormatters } from "./time";
import type { CalendarEvent } from "./types";
import type { useEventDrag } from "./useEventDrag";

/** How far above and below the visible hours boxes are still drawn, in pixels. */
const OVERSCAN = 2 * HOUR_HEIGHT;
/** The hour that is at the top when the grid is first shown. */
const FIRST_HOUR_SHOWN = 7;

export interface TimeGridProps {
  /** The days to show, each with its first instant and the first instant of the next day. */
  days: { start: number; end: number }[];
  /** Single events: every series is expanded before. */
  events: CalendarEvent[];
  now: number;
  timeZone: string;
  locale: string | undefined;
  /** The most columns one day draws side by side. */
  maxColumns: number;
  format: ReturnType<typeof createFormatters>;
  text: CalendarMessages;
  drag: ReturnType<typeof useEventDrag>;
  /** Tells the parent how wide one day column is, for dragging sideways. */
  listsRef: React.RefObject<HTMLDivElement>;
  onOpen: (event: CalendarEvent) => void;
  onOpenNew: (start: number) => void;
  onShowDay: (dayStart: number) => void;
}

/**
 * The arrow keys move focus between the buttons in the container.
 * `columns` is how many buttons one row holds.
 */
export function moveFocus(keyEvent: KeyboardEvent<HTMLElement>, columns = 1, selector = "button") {
  // In a right-to-left page, ArrowRight goes to the cell before.
  const forward = getComputedStyle(keyEvent.currentTarget).direction === "rtl" ? -1 : 1;
  const steps = { ArrowDown: columns, ArrowUp: -columns, ArrowRight: forward, ArrowLeft: -forward };
  // Any other key finds no step, and then no button.
  const step = steps[keyEvent.key as keyof typeof steps];
  const buttons = Array.from(keyEvent.currentTarget.querySelectorAll<HTMLElement>(selector));
  const next = buttons[buttons.indexOf(keyEvent.target as HTMLElement) + step];
  if (next !== undefined) {
    keyEvent.preventDefault();
    next.focus();
  }
}

export function TimeGrid(props: TimeGridProps) {
  const { days, events, now, timeZone, locale, maxColumns, format, text, drag } = props;
  const { listsRef, onOpen, onOpenNew, onShowDay } = props;
  /** The slot that is the Tab stop of the grid: its row and its day. */
  const [active, setActive] = useState({ row: 9, day: 0 });
  /** The part of the grid that is on screen, in pixels from its top. `height` 0 means "not measured". */
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const [isPrinting, setIsPrinting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayCount = days.length;
  // 24 rows, or 23 or 25 when the clocks change on one of the days.
  const rowCount = Math.max(...days.map((day) => Math.ceil((day.end - day.start) / HOUR_MS)));

  function measure() {
    const scroller = scrollRef.current;
    if (scroller !== null) {
      // Whole hours: a small scroll then changes nothing, so React has nothing to draw again.
      const top = Math.floor(scroller.scrollTop / HOUR_HEIGHT) * HOUR_HEIGHT;
      const height = scroller.clientHeight;
      setViewport((old) => (old.top === top && old.height === height ? old : { top, height }));
    }
  }

  // Before the first paint: start at the morning, not at midnight.
  useLayoutEffect(() => {
    if (scrollRef.current !== null) {
      scrollRef.current.scrollTop = FIRST_HOUR_SHOWN * HOUR_HEIGHT;
    }
    measure();
  }, []);

  useEffect(() => {
    // Paper has no scroll bar: for printing, every box is drawn.
    const startPrint = () => setIsPrinting(true);
    const endPrint = () => setIsPrinting(false);
    window.addEventListener("resize", measure);
    window.addEventListener("beforeprint", startPrint);
    window.addEventListener("afterprint", endPrint);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("beforeprint", startPrint);
      window.removeEventListener("afterprint", endPrint);
    };
  }, []);

  // A move with the keyboard to another day draws the box again in another
  // list, and the new box has no focus. Give it back.
  const movingId = drag.drag?.by === "keyboard" ? drag.drag.original.id : null;
  useEffect(() => {
    if (movingId !== null) {
      const boxes = Array.from(
        listsRef.current?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [],
      );
      const box = boxes.find((button) => button.dataset.eventId === movingId);
      if (box !== undefined && box !== document.activeElement) {
        box.focus();
      }
    }
  });

  const isWindowed = viewport.height > 0 && !isPrinting;
  const windowTop = isWindowed ? viewport.top - OVERSCAN : -Infinity;
  const windowBottom = isWindowed ? viewport.top + viewport.height + OVERSCAN : Infinity;
  const columns = days.map((day) => {
    const capped = capColumns(layoutDay(events, day.start, day.end), maxColumns);
    return {
      ...day,
      name: format.day(day.start),
      allDay: eventsOfDay(events, day, timeZone).filter((event) => event.allDay),
      boxes: boxesInWindow(capped.boxes, windowTop, windowBottom),
      more: boxesInWindow(capped.more, windowTop, windowBottom),
    };
  });
  const hasAllDay = columns.some((column) => column.allDay.length > 0);

  return (
    <div className="calendar__days">
      {hasAllDay && (
        <div className="calendar__allday">
          {columns.map((column) => (
            <ul key={column.start} aria-label={text.allDayOn(column.name)}>
              {column.allDay.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="calendar__event"
                    style={{ borderInlineStartColor: event.color }}
                    data-event-id={event.id}
                    aria-label={text.allDayLabel(event.title, column.name)}
                    onClick={() => onOpen(event)}
                  >
                    {event.title}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}
      <div className="calendar__scroll" ref={scrollRef} onScroll={measure}>
        <div className="calendar__canvas">
          <div className="calendar__lists" ref={listsRef} onKeyDown={moveFocus}>
            {columns.map((column) => (
              <ol key={column.start} aria-label={text.eventsOn(column.name)}>
                {column.boxes.map(({ event, column: index, columnCount, ...box }) => (
                  <li
                    key={event.id}
                    style={{
                      ...box,
                      insetInlineStart: `${(index / columnCount) * 100}%`,
                      width: `${100 / columnCount}%`,
                    }}
                  >
                    <button
                      type="button"
                      className={
                        drag.drag?.original.id === event.id
                          ? "calendar__event is-moving"
                          : "calendar__event"
                      }
                      style={{ borderInlineStartColor: event.color }}
                      data-event-id={event.id}
                      aria-label={text.eventLabel(...format.labelParts(event))}
                      aria-keyshortcuts="M"
                      onPointerDown={(pointerEvent) => drag.onPointerDown(pointerEvent, event)}
                      onKeyDown={(keyEvent) => {
                        if (drag.onKeyDown(keyEvent, event)) {
                          // The key belonged to a move: it must not also move the focus.
                          keyEvent.stopPropagation();
                        }
                      }}
                      onBlur={(focusEvent) => drag.onBlur(focusEvent, event)}
                      onClick={() => !drag.consumeClick() && onOpen(event)}
                    >
                      {event.title}
                      <span className="calendar__resize" data-resize="" aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {column.more.map((more) => {
                  // A "+N more" box can be as tall as the day. Its top is cut to the
                  // hours on screen, so its text is where the user is looking.
                  const top = isWindowed ? Math.max(more.top, viewport.top) : more.top;
                  return (
                    <li
                      key={`more-${more.top}`}
                      style={{
                        top,
                        height: more.top + more.height - top,
                        insetInlineStart: `${((maxColumns - 1) / maxColumns) * 100}%`,
                        width: `${100 / maxColumns}%`,
                      }}
                    >
                      <button
                        type="button"
                        className="calendar__more"
                        aria-label={`${plural(text.moreLabel, more.count, locale)}, ${column.name}`}
                        onClick={() => onShowDay(column.start)}
                      >
                        {text.more(new Intl.NumberFormat(locale).format(more.count))}
                      </button>
                    </li>
                  );
                })}
                {now >= column.start && now < column.end && (
                  <li
                    className="calendar__now"
                    aria-hidden="true"
                    style={{ top: ((now - column.start) / HOUR_MS) * HOUR_HEIGHT }}
                  />
                )}
              </ol>
            ))}
          </div>
          <div role="grid" aria-label={text.newEvent} onKeyDown={(e) => moveFocus(e, dayCount)}>
            <div role="row">
              {columns.map((column) => (
                <div
                  role="columnheader"
                  key={column.start}
                  aria-current={now >= column.start && now < column.end ? "date" : undefined}
                >
                  {format.weekday(column.start)}
                </div>
              ))}
            </div>
            {Array.from({ length: rowCount }, (_, row) => (
              <div role="row" key={row}>
                {columns.map((column, dayIndex) => {
                  const start = column.start + row * HOUR_MS;
                  const isActive = row === active.row && dayIndex === active.day % dayCount;
                  return (
                    <div role="gridcell" key={column.start}>
                      <button
                        type="button"
                        // A short day has no slot in its last row. The empty button keeps the columns in step.
                        disabled={start >= column.end}
                        tabIndex={isActive ? 0 : -1}
                        onFocus={() => setActive({ row, day: dayIndex })}
                        onClick={() => onOpenNew(start)}
                      >
                        {start < column.end && format.time(start)}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
