/*
 * PART OF THE INTERVIEW: yes (about 6 minutes).
 * Write it last. It is a plain form: title, start and end.
 * It is not a modal dialog, so it needs no focus trap. Focus moves into it
 * when it opens, and the calendar moves focus back when it closes.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { fromInputValue, toInputValue, toIso } from "./time";
import type { CalendarEvent } from "./types";

export interface EventFormProps {
  /** The event to edit. A new event arrives with an empty title. */
  event: CalendarEvent;
  /** A new event has no "Delete" button. */
  isNew: boolean;
  onSave: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  /** Called when the form is done: after Save, Delete, Cancel and Escape. */
  onClose: () => void;
}

export function EventForm({ event, isNew, onSave, onDelete, onClose }: EventFormProps) {
  const [endIsWrong, setEndIsWrong] = useState(false);

  // The browser checks the title first (`required`), then calls this.
  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    // The inputs keep their own text. We read it once, here.
    const fields = new FormData(submitEvent.currentTarget);
    const start = fromInputValue(fields.get("start"));
    const end = fromInputValue(fields.get("end"));
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

  return (
    <form
      aria-label={isNew ? "New event" : "Edit event"}
      onSubmit={handleSubmit}
      // Escape while typing Hindi or Japanese closes the popup of the keyboard, not the form.
      onKeyDown={(e) => e.key === "Escape" && !e.nativeEvent.isComposing && onClose()}
    >
      <label>
        Title <input name="title" defaultValue={event.title} required pattern=".*\S.*" autoFocus />
      </label>
      <label>
        Start <input name="start" type="datetime-local" defaultValue={toInputValue(event.start)} />
      </label>
      <label>
        End <input name="end" type="datetime-local" defaultValue={toInputValue(event.end)} />
      </label>
      {endIsWrong && <p role="alert">The end must be after the start.</p>}
      <button type="submit">Save</button>
      {!isNew && (
        <button type="button" onClick={handleDelete}>
          Delete
        </button>
      )}
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </form>
  );
}
