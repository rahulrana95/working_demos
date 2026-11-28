/*
 * NOT PART OF THE INTERVIEW: production version.
 * The conversation list: the last message and the number of unread messages
 * of every conversation. It listens to the same connection as the open
 * conversation.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { conversationsReducer, NO_CONVERSATIONS } from "./conversationsReducer";
import type { ChatSocket } from "./socket";
import type { ConversationSummary, FetchConversations, Message } from "./types";

export interface ConversationsDeps {
  currentUserId: string;
  fetchConversations: FetchConversations;
  socket: ChatSocket;
  /** Called for a message of another person that the user is not looking at. */
  onUnseenMessage?: (message: Message, conversation: ConversationSummary) => void;
}

export interface UseConversationsReturn {
  /** The conversation with the newest message first. */
  conversations: ConversationSummary[];
  status: "loading" | "ready" | "error";
  unreadTotal: number;
}

/** True while the user can see the page: the tab is in front and the window is not minimised. */
function isPageVisible(): boolean {
  return document.visibilityState === "visible";
}

export function useConversations(
  openConversationId: string | null,
  deps: ConversationsDeps,
): UseConversationsReturn {
  const [state, dispatch] = useReducer(conversationsReducer, NO_CONVERSATIONS);
  const [status, setStatus] = useState<UseConversationsReturn["status"]>("loading");
  const { socket } = deps;

  // The listener of the connection runs long after the render that made it.
  // It reads the newest values from here.
  const latest = useRef({ deps, openConversationId, state });
  useEffect(() => {
    latest.current = { deps, openConversationId, state };
  });

  useEffect(() => {
    let request: AbortController | undefined;

    /** Loads the list. It runs at the start and after every reconnect: counts may have changed. */
    async function load() {
      request?.abort();
      const controller = (request = new AbortController());
      const list = latest.current.deps.fetchConversations(controller.signal);
      const conversations = await list.catch(() => null);
      if (controller.signal.aborted) {
        return;
      }
      setStatus((current) => (conversations === null && current !== "ready" ? "error" : "ready"));
      if (conversations !== null) {
        dispatch({ type: "loaded", conversations });
        // The server may still count messages that the user is looking at right now.
        const openId = latest.current.openConversationId;
        if (openId !== null && isPageVisible()) {
          dispatch({ type: "opened", conversationId: openId });
        }
      }
    }

    load();
    const unsubscribe = socket.subscribe({
      onStatus: (isOpen) => {
        if (isOpen) {
          load();
        }
      },
      onFrame: (frame) => {
        if (frame.type !== "message") {
          return;
        }
        const { message } = frame;
        const now = latest.current;
        const isSeen = message.conversationId === now.openConversationId && isPageVisible();
        const countsAsUnread = message.senderId !== now.deps.currentUserId && !isSeen;
        const conversation = now.state.byId[message.conversationId];
        const isNew = message.createdAt > (conversation?.lastMessage?.createdAt ?? 0);
        dispatch({ type: "message", message, countsAsUnread });
        if (countsAsUnread && isNew && conversation !== undefined) {
          now.deps.onUnseenMessage?.(message, conversation);
        }
      },
    });
    return () => {
      request?.abort();
      unsubscribe();
    };
  }, [socket]);

  // The open conversation is read when it opens, and again when the user comes back to the page.
  useEffect(() => {
    if (openConversationId === null) {
      return;
    }
    const markRead = () => {
      if (isPageVisible()) {
        dispatch({ type: "opened", conversationId: openConversationId });
      }
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [openConversationId]);

  const conversations = state.order.map((id) => state.byId[id]);
  const unreadTotal = conversations.reduce((total, { unreadCount }) => total + unreadCount, 0);
  return { conversations, status, unreadTotal };
}
