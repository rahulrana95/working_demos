/*
 * NOT PART OF THE INTERVIEW: production version.
 * A plain textarea on top of any engine. It adds four things to the
 * 60-minute editor: a layer that shows where the other people are, a pause
 * for remote changes while the user builds a character with an input method,
 * a line for screen readers, and it does not care which engine it has.
 *
 * The text of the document and the names of people are untrusted. They are
 * only ever given to React as text, never as HTML.
 */
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from "react";
import type { EditorEngine } from "./engine";
import { DEFAULT_MESSAGES } from "./messages";
import type { CollabMessages } from "./messages";
import { presenceParts } from "./presence";

export interface CollabEditorProps {
  /** The engine of this editor. Create it once, and call `dispose` when you are done. */
  engine: EditorEngine;
  label: string;
  /** Translations. A missing text falls back to English. */
  messages?: Partial<CollabMessages>;
  className?: string;
  /** The shortest time between two "another person changed the text" for screen readers. */
  announceMs?: number;
}

/** How long the line for screen readers keeps its text. Empty again, it can say the same text later. */
const ANNOUNCEMENT_STAYS_MS = 2000;

export function CollabEditor({
  engine,
  label,
  messages,
  className,
  announceMs = 10_000,
}: CollabEditorProps) {
  // Draw again whenever the engine says that something changed.
  useSyncExternalStore(engine.subscribe, engine.version);
  const texts = { ...DEFAULT_MESSAGES, ...messages };
  const text = engine.text();
  const peers = engine.peers();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  // A new value moves the caret of a textarea to the end. After every draw,
  // put it where the engine says, before the browser paints.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const { start, end } = engine.selection();
    if (textarea !== null && (textarea.selectionStart !== start || textarea.selectionEnd !== end)) {
      textarea.setSelectionRange(start, end);
    }
  });

  // If the editor goes away in the middle of a character, let the remote changes in.
  useEffect(() => () => engine.setComposing(false), [engine]);

  // A screen reader must not read every remote key press. One short line,
  // at most once in `announceMs`, says that the text changed.
  const remoteChanges = engine.remoteChanges();
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef({ changes: remoteChanges, at: -Infinity });
  const remoteChangeText = texts.remoteChange;
  useEffect(() => {
    const isNew = remoteChanges !== announced.current.changes;
    if (isNew && performance.now() - announced.current.at >= announceMs) {
      announced.current = { changes: remoteChanges, at: performance.now() };
      setAnnouncement(remoteChangeText);
    }
  }, [remoteChanges, announceMs, remoteChangeText]);
  useEffect(() => {
    if (announcement === "") {
      return;
    }
    const timer = setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_STAYS_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    engine.edit(event.target.value, event.target.selectionEnd);
    engine.setSelection(event.target.selectionStart, event.target.selectionEnd);
  }

  function handleSelect(event: SyntheticEvent<HTMLTextAreaElement>) {
    engine.setSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // The undo of the browser knows nothing about remote edits. Ours takes
    // back only the changes of this user. There is no redo.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (!event.shiftKey) {
        engine.undo();
      }
    }
  }

  return (
    <div className={["collab-editor", className].filter(Boolean).join(" ")}>
      <label className="collab-editor__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="collab-editor__field">
        <div ref={layerRef} className="collab-editor__presence" aria-hidden="true">
          {presenceParts(text, peers).map((part, index) => (
            <Fragment key={index}>
              {part.carets.map((peer) => (
                <span key={peer.site} className="collab-editor__caret">
                  <span className="collab-editor__caret-name">{peer.name}</span>
                </span>
              ))}
              {part.selected ? <mark>{part.text}</mark> : part.text}
            </Fragment>
          ))}
          {
            // A textarea shows an empty last line after a final line break.
            // A div does not, without something after the break.
            "​"
          }
        </div>
        <textarea
          ref={textareaRef}
          id={inputId}
          className="collab-editor__input"
          value={text}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => engine.setComposing(true)}
          onCompositionEnd={() => engine.setComposing(false)}
          onScroll={(event) => layerRef.current?.scrollTo(0, event.currentTarget.scrollTop)}
          rows={8}
          spellCheck={false}
        />
      </div>
      <ul className="collab-editor__people" aria-label={texts.peopleHere}>
        {peers.map((peer) => (
          <li key={peer.site}>{peer.name}</li>
        ))}
      </ul>
      <p className="collab-editor__status" role="status">
        {engine.isOnline ? "" : texts.offline}
      </p>
      <p className="visually-hidden" role="status" data-testid="announcement">
        {announcement}
      </p>
    </div>
  );
}
