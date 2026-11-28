/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Write it after the message list. Say the Enter rules aloud while you type.
 * The 60-minute answer takes its two texts from `text`.
 */
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ChatMessages } from "./messages";
import { MAX_MESSAGE_LENGTH } from "./types";

export interface ComposerProps {
  /** `composerLabel` is the visible label of the text box. Screen readers read it out too. */
  text: ChatMessages;
  /** Returns false when the message was not accepted. The text then stays in the box. */
  onSend: (text: string) => boolean;
}

export function Composer({ text: messages, onSend }: ComposerProps) {
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
        {messages.composerLabel}
        <textarea
          ref={inputRef}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      <button type="button" onClick={submit}>
        {messages.send}
      </button>
    </div>
  );
}
