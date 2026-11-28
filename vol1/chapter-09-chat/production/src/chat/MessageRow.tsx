/*
 * NOT PART OF THE INTERVIEW: production version.
 * One message. The text and the image address come from another person, so
 * neither is trusted: the text is drawn as text, and only safe addresses
 * become a link or an image.
 */
import { safeImageUrl, splitLinks } from "./linkify";
import { fill } from "./messages";
import type { ChatMessages } from "./messages";
import type { Message } from "./types";

export interface MessageRowProps {
  message: Message;
  isMine: boolean;
  /** "You", or the name of the other person. */
  senderName: string;
  /** The time, already written for the user's language. Empty when the server sent a broken time. */
  time: string;
  text: ChatMessages;
  onRetry: (clientId: string) => void;
  onCancel: (clientId: string) => void;
}

export function MessageRow({
  message,
  isMine,
  senderName,
  time,
  text,
  onRetry,
  onCancel,
}: MessageRowProps) {
  const { attachment, uploadProgress, status, clientId } = message;
  const imageUrl = attachment === undefined ? null : safeImageUrl(attachment.url);
  const isUploading = status === "sending" && uploadProgress !== undefined && uploadProgress < 1;
  const percent = Math.round((uploadProgress ?? 0) * 100);
  const meta = [senderName, time, isMine ? text[status] : ""].filter((part) => part !== "");

  return (
    <div className={isMine ? "message message--mine" : "message"}>
      <p className="message__meta">{meta.join(" · ")}</p>

      {attachment !== undefined &&
        (imageUrl === null ? (
          <p className="message__text">{text.image}</p>
        ) : (
          // The box has a fixed size in the CSS, so a slow image does not move the list.
          <img className="message__image" src={imageUrl} alt={attachment.name || text.image} />
        ))}

      {message.text !== "" && (
        <p className="message__text">
          {splitLinks(message.text).map((part, index) =>
            part.href === undefined ? (
              part.text
            ) : (
              // noopener: the new page gets no handle on this one.
              // noreferrer: the other site is not told where the user came from.
              <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">
                {part.text}
              </a>
            ),
          )}
        </p>
      )}

      {isUploading && (
        <progress value={percent} max={100} aria-label={fill(text.uploading, { percent })} />
      )}
      {status === "failed" && (
        <button type="button" onClick={() => onRetry(clientId)}>
          {text.retry}
        </button>
      )}
      {isMine && message.id === undefined && (isUploading || status === "failed") && (
        <button type="button" onClick={() => onCancel(clientId)}>
          {text.cancelUpload}
        </button>
      )}
    </div>
  );
}
