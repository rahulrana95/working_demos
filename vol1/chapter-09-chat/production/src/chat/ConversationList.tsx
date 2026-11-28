/*
 * NOT PART OF THE INTERVIEW: production version.
 * The list of conversations, with the last message and the unread count of
 * each. It holds no logic: `useConversations` gives it the rows.
 */
import { plural } from "./messages";
import type { ChatMessages } from "./messages";
import type { UseConversationsReturn } from "./useConversations";
import type { ConversationSummary } from "./types";

export interface ConversationListProps {
  /** What `useConversations` returns. */
  list: UseConversationsReturn;
  openConversationId: string | null;
  onOpen: (conversationId: string) => void;
  currentUserId: string;
  text: ChatMessages;
  locale?: string;
}

function preview({ lastMessage }: ConversationSummary, currentUserId: string, text: ChatMessages) {
  if (lastMessage === undefined) {
    return text.noMessagesYet;
  }
  const content = lastMessage.text === "" && lastMessage.attachment ? text.image : lastMessage.text;
  return lastMessage.senderId === currentUserId ? `${text.you}: ${content}` : content;
}

export function ConversationList({
  list,
  openConversationId,
  onOpen,
  currentUserId,
  text,
  locale,
}: ConversationListProps) {
  return (
    <nav className="conversations" aria-label={text.conversations}>
      {list.status === "loading" && <p>{text.loading}</p>}
      {list.status === "error" && <p role="alert">{text.conversationsFailed}</p>}
      <ul>
        {list.conversations.map((conversation) => (
          <li key={conversation.id}>
            {/* aria-current marks the open conversation for a screen reader. The CSS draws a border for it. */}
            <button
              type="button"
              aria-current={conversation.id === openConversationId ? "true" : undefined}
              onClick={() => onOpen(conversation.id)}
            >
              <span className="conversations__title">{conversation.title}</span>
              {/* The preview is text of another person: React draws it as text. */}
              <span className="conversations__preview">
                {preview(conversation, currentUserId, text)}
              </span>
              {conversation.unreadCount > 0 && (
                <span className="conversations__unread">
                  {plural(text.unread, conversation.unreadCount, locale)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
