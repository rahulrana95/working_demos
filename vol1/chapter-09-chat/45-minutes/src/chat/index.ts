/* NOT PART OF THE INTERVIEW. It only makes imports shorter. */
export { Chat } from "./Chat";
export type { ChatProps } from "./Chat";
export { Composer } from "./Composer";
export { MessageList } from "./MessageList";
export { messagesReducer } from "./messagesReducer";
export { useChat } from "./useChat";
export type { ChatDeps, ChatState } from "./useChat";
export { MAX_MESSAGE_LENGTH } from "./types";
export type {
  Connect,
  FetchMessages,
  Message,
  MessageStatus,
  SendMessage,
  ServerFrame,
} from "./types";
