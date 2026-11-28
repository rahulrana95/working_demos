/*
 * NOT PART OF THE INTERVIEW: production version.
 * The form for one event: title, start and end, as in ../60-minutes, plus
 * "All day", "Repeat", and for one event of a series the question "this
 * event or all events".
 *
 * It is not a modal dialog, so it needs no focus trap. Focus moves into it
 * when it opens, and the calendar moves focus back when it closes.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import type { CalendarMessages } from "./messages";
import { isOccurrence } from "./recurrence";
import { fromInputValue, fromWall, toInputValue, toIso } from "./time";
import type { CalendarEvent, Recurrence } from "./types";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** What an edit of one event of a series applies to. */
export type EditScope = "this" | "all";

export interface EventFormProps {
  /** The event to edit. A new event arrives with an empty title. */
  event: CalendarEvent;
  /** A new event has no "Delete" button. */
  isNew: boolean;
  /** The inputs show and read times on the wall clock of this zone. */
  timeZone: string;
  text: CalendarMessages;
  onSave: (event: CalendarEvent, scope: EditScope) => void;
  onDelete: (scope: EditScope) => void;
  /** Called when the form is done: after Save, Delete, Cancel and Escape. */
  onClose: () => void;
}

/** The date part of an ISO string: "2026-03-03". For the value of a date input. */
const datePart = (iso: string) => iso.slice(0, 10);

export function EventForm(props: EventFormProps) {
  const { event, isNew, timeZone, text, onSave, onDelete, onClose } = props;
  const [isAllDay, setIsAllDay] = useState(event.allDay ?? false);
  const [scope, setScope] = useState<EditScope>("this");
  const [endIsWrong, setEndIsWrong] = useState(false);
  const isOneOfSeries = isOccurrence(event);

  /** The first and the last date of the event, for the two date inputs of an all-day event. */
  function dates(): [string, string] {
    if (event.allDay) {
      // The stored end is the date after the last date.
      return [datePart(event.start), datePart(toIso(Date.parse(event.end) - DAY_MS))];
    }
    return [
      datePart(toInputValue(event.start, timeZone)),
      datePart(toInputValue(event.end, timeZone)),
    ];
  }

  // The browser checks the title first (`required`), then calls this.
  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    // The inputs keep their own text. We read it once, here.
    const fields = new FormData(submitEvent.currentTarget);
    const [startText, endText] = [fields.get("start"), fields.get("end")];
    // An all-day event is stored as dates in UTC, and its end is the date after its last date.
    const start = isAllDay
      ? Date.parse(`${startText}T00:00Z`)
      : fromInputValue(startText, timeZone);
    const end = isAllDay
      ? Date.parse(`${endText}T00:00Z`) + DAY_MS
      : fromInputValue(endText, timeZone);
    // Written this way round, an empty date (NaN) is wrong too.
    if (!(end > start)) {
      setEndIsWrong(true);
      return;
    }
    const frequency = fields.get("repeat") as Recurrence["frequency"] | "" | null;
    const recurrence: Recurrence | undefined = frequency
      ? { frequency, timeZone: isAllDay ? "UTC" : timeZone }
      : undefined;
    const title = String(fields.get("title")).trim();
    const edited = { ...event, title, start: toIso(start), end: toIso(end), allDay: isAllDay };
    // One event of a series has no rule of its own. Its series keeps the rule.
    onSave(isOneOfSeries ? edited : { ...edited, recurrence }, scope);
    onClose();
  }

  function handleDelete() {
    onDelete(scope);
    onClose();
  }

  const [firstDate, lastDate] = dates();
  // When "All day" is unticked on an all-day event, it becomes 09:00 to 10:00 on its first date.
  const nineOClock = fromWall(Date.parse(event.start) + 9 * HOUR_MS, timeZone);
  const timedStart = event.allDay ? toIso(nineOClock) : event.start;
  const timedEnd = event.allDay ? toIso(nineOClock + HOUR_MS) : event.end;

  return (
    <form
      className="calendar__form"
      aria-label={isNew ? text.newEvent : text.editEvent}
      onSubmit={handleSubmit}
      // Escape while typing Hindi or Japanese closes the popup of the keyboard, not the form.
      onKeyDown={(e) => e.key === "Escape" && !e.nativeEvent.isComposing && onClose()}
    >
      <label>
        {text.title}{" "}
        <input name="title" defaultValue={event.title} required pattern=".*\S.*" autoFocus />
      </label>
      <label className="calendar__check">
        <input
          type="checkbox"
          checked={isAllDay}
          onChange={(changeEvent) => setIsAllDay(changeEvent.target.checked)}
        />{" "}
        {text.allDay}
      </label>
      {/* The key makes new inputs when "All day" changes, because their kind of value changes. */}
      <label key={`start-${isAllDay}`}>
        {text.start}{" "}
        {isAllDay ? (
          <input name="start" type="date" defaultValue={firstDate} />
        ) : (
          <input
            name="start"
            type="datetime-local"
            defaultValue={toInputValue(timedStart, timeZone)}
          />
        )}
      </label>
      <label key={`end-${isAllDay}`}>
        {text.end}{" "}
        {isAllDay ? (
          <input name="end" type="date" defaultValue={lastDate} />
        ) : (
          <input name="end" type="datetime-local" defaultValue={toInputValue(timedEnd, timeZone)} />
        )}
      </label>
      {isOneOfSeries ? (
        <fieldset>
          <legend>{text.scope}</legend>
          {(["this", "all"] as const).map((value) => (
            <label key={value} className="calendar__check">
              <input
                type="radio"
                name="scope"
                checked={scope === value}
                onChange={() => setScope(value)}
              />{" "}
              {value === "this" ? text.scopeThis : text.scopeAll}
            </label>
          ))}
        </fieldset>
      ) : (
        <label>
          {text.repeat}{" "}
          <select name="repeat" defaultValue={event.recurrence?.frequency ?? ""}>
            <option value="">{text.repeatNever}</option>
            <option value="daily">{text.repeatDaily}</option>
            <option value="weekly">{text.repeatWeekly}</option>
            <option value="monthly">{text.repeatMonthly}</option>
          </select>
        </label>
      )}
      {endIsWrong && <p role="alert">{text.endBeforeStart}</p>}
      <div className="calendar__actions">
        <button type="submit">{text.save}</button>
        {!isNew && (
          <button type="button" onClick={handleDelete}>
            {text.delete}
          </button>
        )}
        <button type="button" onClick={onClose}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
}
