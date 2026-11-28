/*
 * PART OF THE INTERVIEW: yes (about 7 minutes).
 * Write it last. It is a plain form: title, start and end.
 * It is not a modal dialog, so it needs no focus trap. Focus moves into it
 * when it opens, and the calendar moves focus back when it closes.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import type { CalendarMessages } from "./messages";
import { fromInputValue, toInputValue, toIso } from "./time";
import type { CalendarEvent } from "./types";

export interface EventFormProps {
  /** The event to edit. A new event arrives with an empty title. */
  event: CalendarEvent;
  /** A new event has no "Delete" button. */
  isNew: boolean;
  /** The inputs show and read times on the wall clock of this zone. */
  timeZone: string;
  text: CalendarMessages;
  onSave: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  /** Called when the form is done: after Save, Delete, Cancel and Escape. */
  onClose: () => void;
}

export function EventForm(props: EventFormProps) {
  const { event, isNew, timeZone, text, onSave, onDelete, onClose } = props;
  const [endIsWrong, setEndIsWrong] = useState(false);

  // The browser checks the title first (`required`), then calls this.
  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    // The inputs keep their own text. We read it once, here.
    const fields = new FormData(submitEvent.currentTarget);
    const start = fromInputValue(fields.get("start"), timeZone);
    const end = fromInputValue(fields.get("end"), timeZone);
    // Written this way round, an empty date (NaN) is wrong too.
    if (!(end > start)) {
      setEndIsWrong(true);
      return;
    }
    const title = String(fields.get("title")).trim();
    onSave({ ...event, title, start: toIso(start), end: toIso(end) });
    onClose();
  }

  function handleDelete() {
    onDelete(event.id);
    onClose();
  }

  const input = (name: "start" | "end") => (
    <input name={name} type="datetime-local" defaultValue={toInputValue(event[name], timeZone)} />
  );

  return (
    <form
      aria-label={isNew ? text.newEvent : text.editEvent}
      onSubmit={handleSubmit}
      // Escape while typing Hindi or Japanese closes the popup of the keyboard, not the form.
      onKeyDown={(e) => e.key === "Escape" && !e.nativeEvent.isComposing && onClose()}
    >
      <label>
        {text.title}{" "}
        <input name="title" defaultValue={event.title} required pattern=".*\S.*" autoFocus />
      </label>
      <label>
        {text.start} {input("start")}
      </label>
      <label>
        {text.end} {input("end")}
      </label>
      {endIsWrong && <p role="alert">{text.endBeforeStart}</p>}
      <button type="submit">{text.save}</button>
      {!isNew && (
        <button type="button" onClick={handleDelete}>
          {text.delete}
        </button>
      )}
      <button type="button" onClick={onClose}>
        {text.cancel}
      </button>
    </form>
  );
}
