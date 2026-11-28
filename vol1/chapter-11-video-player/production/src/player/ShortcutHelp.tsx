/*
 * NOT PART OF THE INTERVIEW: production version.
 * The list of keyboard shortcuts, in a dialog. It follows the W3C modal
 * dialog pattern: the focus moves into the dialog when it opens, Tab stays
 * inside it, Escape closes it, and the focus then goes back to the button
 * that opened it (the parent does that last step).
 */
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { PlayerMessages } from "./messages";

export interface ShortcutHelpProps {
  messages: PlayerMessages;
  onClose: () => void;
}

export function ShortcutHelp({ messages, onClose }: ShortcutHelpProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const rows: [keys: string[], text: string][] = [
    [["Space", "K"], messages.helpPlay],
    [["←", "→"], messages.helpSeek],
    [["↑", "↓"], messages.helpVolume],
    [["M"], messages.helpMute],
    [["Home", "End"], messages.helpStartEnd],
    [["C"], messages.helpCaptions],
    [["F"], messages.helpFullscreen],
    [["?"], messages.helpHelp],
  ];

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      onClose();
    } else if (event.key === "Tab") {
      // "Close" is the only control in the dialog, so Tab has nowhere else to go.
      event.preventDefault();
    }
    // No key press in the dialog is a shortcut of the player behind it.
    event.stopPropagation();
  }

  return (
    <div
      className="player__help"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
    >
      <h2 id={titleId}>{messages.help}</h2>
      <dl>
        {rows.map(([keys, text]) => (
          <div key={text}>
            <dt>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <button type="button" ref={closeRef} onClick={onClose}>
        {messages.close}
      </button>
    </div>
  );
}
