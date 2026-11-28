/*
 * NOT PART OF THE INTERVIEW: production version.
 * The text box of the 60-minute answer, plus: it tells the parent when the
 * user types, and it can send an image.
 */
import { useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import type { ChatMessages } from "./messages";
import { MAX_MESSAGE_LENGTH } from "./types";

export interface ComposerProps {
  /** `composerLabel` is the visible label of the text box. Screen readers read it out too. */
  text: ChatMessages;
  /** Returns false when the message was not accepted. The text then stays in the box. */
  onSend: (text: string) => boolean;
  /** Called while the user types a text that is not empty. */
  onTyping?: () => void;
  /** Returns false when the file was refused. Leave it out to hide the image button. */
  onSendImage?: (file: File) => boolean;
}

export function Composer({ text: messages, onSend, onTyping, onSendImage }: ComposerProps) {
  const [text, setText] = useState("");
  const [isImageRefused, setIsImageRefused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (onSend(text)) {
      setText("");
    }
    // A click on "Send" moves focus to the button. Bring it back for the next message.
    inputRef.current?.focus();
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    if (event.target.value.trim() !== "") {
      onTyping?.();
    }
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

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file !== undefined && onSendImage !== undefined) {
      setIsImageRefused(!onSendImage(file));
    }
    // Empty the field, so the same file can be chosen again.
    event.target.value = "";
  }

  // There is no <form>: Enter in a text box of several lines never submits one.
  return (
    <div className="composer">
      <label className="composer__text">
        {messages.composerLabel}
        <textarea
          ref={inputRef}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </label>
      {onSendImage !== undefined && (
        // A real file field inside its label: the keyboard and screen readers
        // use it like any other field. Only its own drawing is hidden.
        <label className="composer__attach">
          {messages.attachImage}
          <input type="file" accept="image/*" className="visually-hidden" onChange={handleFile} />
        </label>
      )}
      <button type="button" onClick={submit}>
        {messages.send}
      </button>
      {/* The element is always there. A screen reader then reads the text when it appears. */}
      <p className="composer__error" role="alert">
        {isImageRefused && messages.imageRefused}
      </p>
    </div>
  );
}
