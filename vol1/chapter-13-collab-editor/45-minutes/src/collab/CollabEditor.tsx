/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * Write it last. It is a plain textarea: all the hard work is in `rga.ts`.
 * The one thing to get right here is the caret.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Rga } from "./rga";
import { applyTextChange } from "./textChange";
import type { Id, Transport } from "./types";

export interface CollabEditorProps {
  /** The document of this editor. Create it once, with a site name no other editor has. */
  doc: Rga;
  transport: Transport;
  label: string;
  /** Called with the new text after every change, local or remote. */
  onTextChange?: (text: string) => void;
}

/** A selection, kept as the ids of the characters to the left of its two ends. */
interface CaretIds {
  start: Id | null;
  end: Id | null;
}

export function CollabEditor({ doc, transport, label, onTextChange }: CollabEditorProps) {
  const [text, setText] = useState(() => doc.text());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  // The caret to put back after a remote change is drawn.
  const caretToRestore = useRef<CaretIds | null>(null);

  // The parent may pass a new function on every render. We keep the latest
  // one in a ref, so a new function does not restart the listening below.
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  useEffect(() => {
    const show = () => {
      setText(doc.text());
      onTextChangeRef.current?.(doc.text());
    };
    show(); // The document may have changed, or may be another one now.

    return transport.subscribe((ops) => {
      const textarea = textareaRef.current;
      const textBefore = doc.text();
      const ids = doc.ids();
      ops.forEach((op) => doc.apply(op));

      // Remember the caret as ids, taken before the text changed. If an
      // older remote change is not drawn yet, the textarea still shows an
      // older text, and the ids we took then are still the right ones.
      if (textarea !== null && caretToRestore.current === null && doc.text() !== textBefore) {
        caretToRestore.current = {
          start: ids[textarea.selectionStart - 1] ?? null,
          end: ids[textarea.selectionEnd - 1] ?? null,
        };
      }
      show();
    });
  }, [doc, transport]);

  // A new value moves the caret of a textarea to the end. Put it back before
  // the browser paints, so the user never sees it jump.
  useLayoutEffect(() => {
    const caret = caretToRestore.current;
    const textarea = textareaRef.current;
    if (caret !== null && textarea !== null) {
      textarea.setSelectionRange(doc.caretIndex(caret.start), doc.caretIndex(caret.end));
    }
    caretToRestore.current = null;
  }, [doc, text]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const ops = applyTextChange(doc, event.target.value, event.target.selectionEnd);
    // The user just put the caret where it is. An older caret must not win.
    caretToRestore.current = null;
    setText(doc.text());
    onTextChange?.(doc.text());
    if (ops.length > 0) {
      transport.send(ops);
    }
  }

  return (
    <div className="collab-editor">
      <label className="collab-editor__label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        ref={textareaRef}
        id={inputId}
        className="collab-editor__input"
        value={text}
        onChange={handleChange}
        rows={8}
        spellCheck={false}
      />
    </div>
  );
}
