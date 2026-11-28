/*
 * NOT PART OF THE INTERVIEW: production version.
 * The list of the 60-minute answer, plus: a window of rows (`windowing.ts`),
 * a line for every new day, and rows with links, images and receipts.
 *
 * Why it holds at scale: the scroll position is corrected before the
 * browser paints, so an older page or a new message never moves the text
 * the user is reading. The page holds a window of the loaded messages, not
 * all of them.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageRow } from "./MessageRow";
import type { ChatMessages } from "./messages";
import type { ChatState } from "./useChat";
import { isSameDay, isValidTime, stepUp, windowStart } from "./windowing";
import type { Message } from "./types";

export interface MessageListProps {
  /** What `useChat` returns. */
  chat: ChatState;
  currentUserId: string;
  /** The name of the other person. */
  peerName: string;
  text: ChatMessages;
  /** For times and dates, for example "hi-IN". The default is the language of the browser. */
  locale?: string;
}

/** Closer to an edge than this counts as "at the edge". */
const EDGE_PX = 40;

export function MessageList({ chat, currentUserId, peerName, text, locale }: MessageListProps) {
  // Made once for a draw. Making a formatter for every row is slow in a long list.
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const { messages, loadStatus, hasOlder, loadOlder } = chat;
  const logRef = useRef<HTMLDivElement>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  /** The message the window is pinned to. `null`: the window follows the newest messages. */
  const [topId, setTopId] = useState<string | null>(null);
  /** The oldest message in memory at the moment the user asked the server for an older page. */
  const askedAbove = useRef<string | null>(null);
  /** What the list looked like after the last draw. */
  const drawn = useRef({ rows: [] as Message[], scrollHeight: 0, isAtBottom: true });

  const start = windowStart(messages, topId);
  const rows = start === 0 ? messages : messages.slice(start);

  // A layout effect runs after React changed the page and before the browser
  // paints. So the user never sees the wrong scroll position. It has no
  // list of dependencies: it must see the height after every draw.
  useLayoutEffect(() => {
    // React sets the ref before it runs a layout effect.
    const log = logRef.current!;
    const before = drawn.current;
    const last = rows[rows.length - 1];
    // A message that is sending is one object until its status or its progress changes.
    const isOwnNewMessage =
      last?.status === "sending" &&
      !before.rows.some((message) => message.clientId === last.clientId);
    const staysAtBottom = before.isAtBottom || isOwnNewMessage;

    if (staysAtBottom) {
      log.scrollTop = log.scrollHeight;
    } else if (rows[0]?.clientId !== before.rows[0]?.clientId) {
      // Rows were added on top: an older page, or a step of the window. The
      // list grew by their height, so we move down by the same amount.
      log.scrollTop += log.scrollHeight - before.scrollHeight;
    } else if (rows.length > before.rows.length) {
      setHasNewBelow(true);
    }
    drawn.current = { rows, scrollHeight: log.scrollHeight, isAtBottom: staysAtBottom };
  });

  /** Shows older messages: the ones in memory first, then a page from the server. */
  function showOlder() {
    if (start > 0) {
      setTopId(stepUp(messages, start));
    } else if (hasOlder && loadStatus !== "loading") {
      askedAbove.current = messages[0]?.clientId ?? null;
      loadOlder();
    }
  }

  // The page the user asked for arrives above a pinned window, where it is
  // not drawn. This shows its newest part.
  useEffect(() => {
    const asked = askedAbove.current;
    if (asked !== null && messages[0]?.clientId !== asked) {
      askedAbove.current = null;
      const isPinned = messages[start]?.clientId === topId;
      if (start > 0 && isPinned) {
        setTopId(stepUp(messages, start));
      }
    }
  });

  function handleScroll() {
    // The handler is on the element of the ref, so the ref is set.
    const log = logRef.current!;
    const isAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < EDGE_PX;
    drawn.current.isAtBottom = isAtBottom;
    setHasNewBelow((hadNew) => hadNew && !isAtBottom);
    if (isAtBottom) {
      // Back at the newest messages: the window may shrink to its normal size.
      setTopId(null);
    } else if (topId === null && rows.length > 0) {
      // The user reads older messages. Pin the window, so a new message
      // below does not remove a row on top and move the text.
      setTopId(rows[0].clientId);
    }
    // After a failed load only the button asks again. Scrolling must not
    // hit a server that is in trouble on every scroll event.
    if (log.scrollTop < EDGE_PX && !isAtBottom && (start > 0 || loadStatus === "ready")) {
      showOlder();
    }
  }

  function goToNewest() {
    // The layout effect scrolls down after the next draw.
    drawn.current.isAtBottom = true;
    setHasNewBelow(false);
    setTopId(null);
    // The button is removed now. Focus must not be lost with it.
    logRef.current?.focus();
  }

  const canShowOlder = start > 0 || hasOlder;

  return (
    <div className="chat__body">
      <div className="chat__older">
        {loadStatus === "error" && <p role="alert">{text.loadFailed}</p>}
        {/* The button stays while a page loads, so a keyboard user keeps the focus on it. */}
        {canShowOlder && (
          <button type="button" aria-disabled={loadStatus === "loading"} onClick={showOlder}>
            {loadStatus === "loading" ? text.loading : text.loadOlder}
          </button>
        )}
        {/* The element is always there. A screen reader then reads the text when it appears. */}
        <p role="status">{!chat.isOpen && text.connecting}</p>
      </div>

      {/* A log reads out rows that are added. "additions": a status that
          changes from "Sending…" to "Sent" is not read out again.
          tabIndex: a keyboard user can focus the list and scroll it.
          onClick: "Retry" and "Cancel" are removed when they are pressed.
          The click then reaches the list, and the list takes the focus.
          A click on a link keeps the focus on the link. */}
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
        onClick={(event) => {
          if ((event.target as Element).closest("button") !== null) {
            event.currentTarget.focus();
          }
        }}
      >
        {rows.map((message, index) => {
          const isMine = message.senderId === currentUserId;
          const hasTime = isValidTime(message.createdAt);
          const startsDay =
            hasTime && (index === 0 || !isSameDay(rows[index - 1].createdAt, message.createdAt));
          return (
            <Fragment key={message.clientId}>
              {startsDay && (
                // A plain paragraph: the role "separator" would hide the date from a screen reader.
                <p className="chat__day">{dayFormat.format(message.createdAt)}</p>
              )}
              <MessageRow
                message={message}
                isMine={isMine}
                senderName={isMine ? text.you : peerName}
                time={hasTime ? timeFormat.format(message.createdAt) : ""}
                text={text}
                onRetry={chat.retry}
                onCancel={chat.cancel}
              />
            </Fragment>
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
