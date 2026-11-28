/*
 * PART OF THE INTERVIEW: yes (about 12 minutes).
 * Order to write it in:
 *   1. The rows: who, when, the status as text, "Retry".     (4 minutes)
 *   2. Stay at the bottom, or show "New messages".            (4 minutes)
 *   3. Keep the place when an older page is added on top.     (3 minutes)
 *
 * Why it holds at scale: the scroll position is corrected before the
 * browser paints, so an older page or a new message never moves the text
 * the user is reading. This answer draws every loaded message. The
 * production version draws a window of them.
 *
 * The 60-minute answer adds: `text` and `locale`, and the line that says
 * that we are connecting.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { ChatMessages } from "./messages";
import type { ChatState } from "./useChat";
import type { Message } from "./types";

export interface MessageListProps {
  /** What `useChat` returns. */
  chat: ChatState;
  currentUserId: string;
  /** The name of the other person. */
  peerName: string;
  text: ChatMessages;
  /** For the time of a message, for example "hi-IN". The default is the language of the browser. */
  locale?: string;
}

/** Closer to an edge than this counts as "at the edge". */
const EDGE_PX = 40;

export function MessageList({ chat, currentUserId, peerName, text, locale }: MessageListProps) {
  // Made once for a draw. Making a formatter for every row is slow in a long list.
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const { messages, loadStatus, hasOlder, loadOlder } = chat;
  const logRef = useRef<HTMLDivElement>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  /** What the list looked like after the last draw. */
  const drawn = useRef({ messages: [] as Message[], scrollHeight: 0, isAtBottom: true });

  // A layout effect runs after React changed the page and before the browser
  // paints. So the user never sees the wrong scroll position. It has no
  // list of dependencies: it must see the height after every draw.
  useLayoutEffect(() => {
    // React sets the ref before it runs a layout effect.
    const log = logRef.current!;
    const before = drawn.current;
    const last = messages[messages.length - 1];
    // A message that is sending is one object until its status changes.
    const isOwnNewMessage = last?.status === "sending" && !before.messages.includes(last);
    const staysAtBottom = before.isAtBottom || isOwnNewMessage;

    if (staysAtBottom) {
      log.scrollTop = log.scrollHeight;
    } else if (messages[0]?.clientId !== before.messages[0]?.clientId) {
      // An older page was added on top. The list grew by its height, so we
      // move down by the same amount. Every visible row stays where it was.
      log.scrollTop += log.scrollHeight - before.scrollHeight;
    } else if (messages.length > before.messages.length) {
      setHasNewBelow(true);
    }
    drawn.current = { messages, scrollHeight: log.scrollHeight, isAtBottom: staysAtBottom };
  });

  function handleScroll() {
    // The handler is on the element of the ref, so the ref is set.
    const log = logRef.current!;
    const isAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < EDGE_PX;
    drawn.current.isAtBottom = isAtBottom;
    setHasNewBelow((hadNew) => hadNew && !isAtBottom);
    if (log.scrollTop < EDGE_PX && hasOlder && loadStatus === "ready") {
      loadOlder();
    }
  }

  function goToNewest() {
    // The layout effect scrolls down after the next draw.
    drawn.current.isAtBottom = true;
    setHasNewBelow(false);
    // The button is removed now. Focus must not be lost with it.
    logRef.current?.focus();
  }

  return (
    <div className="chat__body">
      <div className="chat__older">
        {loadStatus === "error" && <p role="alert">{text.loadFailed}</p>}
        {/* The button stays while a page loads, so a keyboard user keeps the focus on it. */}
        {hasOlder && (
          <button type="button" aria-disabled={loadStatus === "loading"} onClick={loadOlder}>
            {loadStatus === "loading" ? text.loading : text.loadOlder}
          </button>
        )}
        {/* The element is always there. A screen reader then reads the text when it appears. */}
        <p role="status">{!chat.isOpen && text.connecting}</p>
      </div>

      {/* A log reads out rows that are added. "additions": a status that
          changes from "Sending…" to "Sent" is not read out again.
          tabIndex: a keyboard user can focus the list and scroll it.
          onClick: "Retry" is removed when it is pressed. The click then
          reaches the list, and the list takes the focus. */}
      <div
        ref={logRef}
        className="chat__log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={loadStatus === "loading"}
        aria-label={peerName}
        tabIndex={0}
        onScroll={handleScroll}
        onClick={(event) => event.currentTarget.focus()}
      >
        {messages.map((message) => {
          const isMine = message.senderId === currentUserId;
          const time = timeFormat.format(message.createdAt);
          return (
            <div key={message.clientId} className={isMine ? "message message--mine" : "message"}>
              <p className="message__meta">
                {isMine
                  ? `${text.you} · ${time} · ${text[message.status]}`
                  : `${peerName} · ${time}`}
              </p>
              <p className="message__text">{message.text}</p>
              {message.status === "failed" && (
                <button type="button" onClick={() => chat.retry(message.clientId)}>
                  {text.retry}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {hasNewBelow && (
        <button type="button" className="chat__new" onClick={goToNewest}>
          {text.newMessages}
        </button>
      )}
    </div>
  );
}
