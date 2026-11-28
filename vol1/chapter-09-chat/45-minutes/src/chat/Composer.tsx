/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Write it after the message list. Say the Enter rules aloud while you type.
 */
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "./types";

export interface ComposerProps {
  /** Visible label of the text box. Screen readers read it out too. */
  label: string;
  /** Returns false when the message was not accepted. The text then stays in the box. */
  onSend: (text: string) => boolean;
}

export function Composer({ label, onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (onSend(text)) {
      setText("");
    }
    // A click on "Send" moves focus to the button. Bring it back for the next message.
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // This Enter confirms a word in a Hindi, Japanese or Chinese keyboard.
    // Safari reports it with keyCode 229 and not with `isComposing`.
    const isImeEnter = event.nativeEvent.isComposing || event.keyCode === 229;
    // Shift+Enter is a new line. The browser adds it by itself.
    if (event.key === "Enter" && !event.shiftKey && !isImeEnter) {
      event.preventDefault();
      submit();
    }
  }

  // There is no <form>: Enter in a text box of several lines never submits one.
  return (
    <div className="composer">
      <label>
        {label}
        <textarea
          ref={inputRef}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      <button type="button" onClick={submit}>
        Send
      </button>
    </div>
  );
}
