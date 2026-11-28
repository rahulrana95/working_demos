/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Write it last. It only joins the hook to the two parts of the screen.
 * The 60-minute answer adds `messages` and `locale`.
 */
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { defaultMessages } from "./messages";
import type { ChatMessages } from "./messages";
import { useChat } from "./useChat";
import type { ChatDeps } from "./useChat";

export interface ChatProps extends ChatDeps {
  conversationId: string;
  /** The name of the other person. It is also the name of the message list for a screen reader. */
  peerName: string;
  /** Your own texts, for another language. Texts you leave out stay in English. */
  messages?: Partial<ChatMessages>;
  /** For the time of a message, for example "hi-IN". The default is the language of the browser. */
  locale?: string;
}

export function Chat({ conversationId, peerName, messages, locale, ...deps }: ChatProps) {
  const chat = useChat(conversationId, deps);
  const text = { ...defaultMessages, ...messages };

  return (
    <div className="chat">
      <MessageList chat={chat} currentUserId={deps.currentUserId} {...{ peerName, text, locale }} />
      <Composer text={text} onSend={chat.send} />
    </div>
  );
}
