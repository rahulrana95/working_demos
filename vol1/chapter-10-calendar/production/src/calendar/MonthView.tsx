/*
 * NOT PART OF THE INTERVIEW: production version.
 * The month view: six weeks of seven days. A day shows its first few events
 * and then "+3 more", which opens the day view. So the number of boxes in
 * the page is bounded, however many events the month holds.
 *
 * It is a grid: the arrow keys move between the days. Only the day the user
 * is on is a Tab stop, with its events. The other days are reached with the
 * arrow keys.
 */
import { useState } from "react";
import { plural } from "./messages";
import type { CalendarMessages } from "./messages";
import { eventsOfDay } from "./monthGrid";
import type { MonthDay } from "./monthGrid";
import { moveFocus } from "./TimeGrid";
import type { createFormatters } from "./time";
import type { CalendarEvent } from "./types";

/** How many events one day shows before "+N more". */
export const MONTH_EVENTS_PER_DAY = 3;

export interface MonthViewProps {
  /** 42 days, from `monthDays`. */
  days: MonthDay[];
  /** Single events: every series is expanded before. */
  events: CalendarEvent[];
  now: number;
  timeZone: string;
  locale: string | undefined;
  format: ReturnType<typeof createFormatters>;
  text: CalendarMessages;
  onOpen: (event: CalendarEvent) => void;
  onShowDay: (dayStart: number) => void;
}

export function MonthView(props: MonthViewProps) {
  const { days, events, now, timeZone, locale, format, text, onOpen, onShowDay } = props;
  /** The index of the day that is the Tab stop of the grid. */
  const [activeDay, setActiveDay] = useState(() =>
    Math.max(
      0,
      days.findIndex((day) => day.isInMonth),
    ),
  );
  const weeks = Array.from({ length: 6 }, (_, week) => days.slice(week * 7, week * 7 + 7));

  return (
    <div
      className="calendar__month"
      role="grid"
      aria-label={format.month(days[7].start)}
      onKeyDown={(keyEvent) => moveFocus(keyEvent, 7, "[data-day]")}
    >
      <div role="row">
        {weeks[0].map((day) => (
          <div role="columnheader" key={day.start}>
            {format.weekdayName(day.start)}
          </div>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div role="row" key={week[0].start}>
          {week.map((day, dayIndex) => {
            const index = weekIndex * 7 + dayIndex;
            const tabIndex = index === activeDay ? 0 : -1;
            const dayEvents = eventsOfDay(events, day, timeZone);
            const dayName = format.day(day.start);
            const hidden = dayEvents.length - MONTH_EVENTS_PER_DAY;
            const isToday = now >= day.start && now < day.end;
            return (
              <div
                role="gridcell"
                key={day.start}
                className={day.isInMonth ? undefined : "is-outside"}
                aria-current={isToday ? "date" : undefined}
              >
                <button
                  type="button"
                  className="calendar__daynumber"
                  data-day=""
                  tabIndex={tabIndex}
                  aria-label={text.showDay(dayName)}
                  onFocus={() => setActiveDay(index)}
                  onClick={() => onShowDay(day.start)}
                >
                  {format.dayNumber(day.start)}
                </button>
                <ul aria-label={text.eventsOn(dayName)}>
                  {dayEvents.slice(0, MONTH_EVENTS_PER_DAY).map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className="calendar__event"
                        style={{ borderInlineStartColor: event.color }}
                        data-event-id={event.id}
                        tabIndex={tabIndex}
                        aria-label={
                          event.allDay
                            ? text.allDayLabel(event.title, dayName)
                            : text.eventLabel(...format.labelParts(event))
                        }
                        onFocus={() => setActiveDay(index)}
                        onClick={() => onOpen(event)}
                      >
                        {!event.allDay && <span>{format.time(Date.parse(event.start))} </span>}
                        {event.title}
                      </button>
                    </li>
                  ))}
                  {hidden > 0 && (
                    <li>
                      <button
                        type="button"
                        className="calendar__more"
                        tabIndex={tabIndex}
                        aria-label={`${plural(text.moreLabel, hidden, locale)}, ${dayName}`}
                        onFocus={() => setActiveDay(index)}
                        onClick={() => onShowDay(day.start)}
                      >
                        {text.more(new Intl.NumberFormat(locale).format(hidden))}
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
