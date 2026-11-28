/*
 * NOT PART OF THE INTERVIEW: production version.
 * The state of the conversation list. It is normalised: every conversation
 * is stored once, under its id, and `order` holds only ids. A new message
 * then changes one entry, and no list has to be searched or copied.
 */
import type { ConversationSummary, Message } from "./types";

export interface ConversationsState {
  byId: Record<string, ConversationSummary>;
  /** The ids, the conversation with the newest message first. */
  order: string[];
}

export type ConversationsAction =
  | { type: "loaded"; conversations: ConversationSummary[] }
  /** A new message arrived. `countsAsUnread`: another person wrote it and the user is not looking at it. */
  | { type: "message"; message: Message; countsAsUnread: boolean }
  /** The user opened a conversation and has seen its messages. */
  | { type: "opened"; conversationId: string };

export const NO_CONVERSATIONS: ConversationsState = { byId: {}, order: [] };

function sortedIds(byId: Record<string, ConversationSummary>): string[] {
  const time = (id: string) => byId[id].lastMessage?.createdAt ?? 0;
  // The id decides between two conversations with the same time, so the order never flickers.
  return Object.keys(byId).sort((a, b) => time(b) - time(a) || (a < b ? -1 : 1));
}

export function conversationsReducer(
  state: ConversationsState,
  action: ConversationsAction,
): ConversationsState {
  switch (action.type) {
    case "loaded": {
      const byId: Record<string, ConversationSummary> = {};
      for (const conversation of action.conversations) {
        const known = state.byId[conversation.id];
        // A message pushed while the list was loading is newer than the answer of the server.
        const isKnownNewer =
          (known?.lastMessage?.createdAt ?? 0) > (conversation.lastMessage?.createdAt ?? 0);
        byId[conversation.id] = isKnownNewer ? { ...conversation, ...known } : conversation;
      }
      return { byId, order: sortedIds(byId) };
    }
    case "message": {
      const { message, countsAsUnread } = action;
      const known = state.byId[message.conversationId];
      // An unknown conversation is not made up here: only the server knows its title.
      // An old or repeated message must not count twice.
      if (known === undefined || message.createdAt <= (known.lastMessage?.createdAt ?? 0)) {
        return state;
      }
      const { senderId, text, createdAt, attachment } = message;
      const byId = {
        ...state.byId,
        [known.id]: {
          ...known,
          lastMessage: { senderId, text, createdAt, attachment },
          unreadCount: known.unreadCount + (countsAsUnread ? 1 : 0),
        },
      };
      return { byId, order: sortedIds(byId) };
    }
    case "opened": {
      const known = state.byId[action.conversationId];
      if (known === undefined || known.unreadCount === 0) {
        return state;
      }
      return { ...state, byId: { ...state.byId, [known.id]: { ...known, unreadCount: 0 } } };
    }
  }
}
