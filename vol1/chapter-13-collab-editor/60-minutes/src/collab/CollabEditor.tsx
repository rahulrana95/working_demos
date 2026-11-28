/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * Write it last. It is a plain textarea: all the hard work is in `rga.ts`
 * and `session.ts`. The one thing to get right here is the caret.
 */
import { useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from "react";
import { DEFAULT_MESSAGES } from "./messages";
import type { CollabMessages } from "./messages";
import type { CollabSession } from "./session";

export interface CollabEditorProps {
  /** The session of this editor. Create it once, and call `dispose` when you are done. */
  session: CollabSession;
  label: string;
  /** Translations. A missing text falls back to English. */
  messages?: Partial<CollabMessages>;
  className?: string;
}

export function CollabEditor({ session, label, messages, className }: CollabEditorProps) {
  // Draw again whenever the session says that something changed.
  useSyncExternalStore(session.subscribe, session.version);
  const texts = { ...DEFAULT_MESSAGES, ...messages };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  // A new value moves the caret of a textarea to the end. After every draw,
  // put it where the session says, before the browser paints. The session
  // keeps it as ids, so it is right after a remote change too.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const { start, end } = session.selection();
    if (textarea !== null && (textarea.selectionStart !== start || textarea.selectionEnd !== end)) {
      textarea.setSelectionRange(start, end);
    }
  });

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    session.edit(event.target.value, event.target.selectionEnd);
    session.setSelection(event.target.selectionStart, event.target.selectionEnd);
  }

  function handleSelect(event: SyntheticEvent<HTMLTextAreaElement>) {
    session.setSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // The undo of the browser knows nothing about remote edits. Ours takes
    // back only the changes of this user. There is no redo.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (!event.shiftKey) {
        session.undo();
      }
    }
  }

  return (
    <div className={["collab-editor", className].filter(Boolean).join(" ")}>
      <label className="collab-editor__label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        ref={textareaRef}
        id={inputId}
        className="collab-editor__input"
        value={session.doc.text()}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        rows={8}
        spellCheck={false}
      />
      <p className="collab-editor__status" role="status">
        {session.isOnline ? "" : texts.offline}
      </p>
    </div>
  );
}
