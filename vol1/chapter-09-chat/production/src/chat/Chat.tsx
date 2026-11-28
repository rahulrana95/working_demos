/*
 * NOT PART OF THE INTERVIEW: production version.
 * One open conversation. It joins the hook to the parts of the screen.
 */
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { defaultMessages, fill } from "./messages";
import type { ChatMessages } from "./messages";
import { useChat } from "./useChat";
import type { ChatDeps } from "./useChat";

export interface ChatProps extends ChatDeps {
  conversationId: string;
  /** The name of the other person. It is also the name of the message list for a screen reader. */
  peerName: string;
  /** Your own texts, for another language. Texts you leave out stay in English. */
  messages?: Partial<ChatMessages>;
  /** For times and dates, for example "hi-IN". The default is the language of the browser. */
  locale?: string;
}

export function Chat({ conversationId, peerName, messages, locale, ...deps }: ChatProps) {
  const chat = useChat(conversationId, deps);
  const text = { ...defaultMessages, ...messages };

  return (
    <div className="chat">
      <MessageList chat={chat} currentUserId={deps.currentUserId} {...{ peerName, text, locale }} />
      {/* Not a live region: it changes too often to be read out. The line keeps its height when empty. */}
      <p className="chat__typing">{chat.isPeerTyping && fill(text.typing, { name: peerName })}</p>
      <Composer
        text={text}
        onSend={chat.send}
        onTyping={chat.notifyTyping}
        onSendImage={deps.uploadFile === undefined ? undefined : chat.sendImage}
      />
    </div>
  );
}
