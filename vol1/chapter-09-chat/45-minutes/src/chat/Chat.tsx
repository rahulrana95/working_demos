/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Write it last. It only joins the hook to the two parts of the screen.
 */
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { useChat } from "./useChat";
import type { ChatDeps } from "./useChat";

export interface ChatProps extends ChatDeps {
  conversationId: string;
  /** The name of the other person. */
  peerName: string;
}

export function Chat({ conversationId, peerName, ...deps }: ChatProps) {
  const chat = useChat(conversationId, deps);

  return (
    <section className="chat" aria-label={`Chat with ${peerName}`}>
      <MessageList chat={chat} currentUserId={deps.currentUserId} peerName={peerName} />
      <Composer label={`Message to ${peerName}`} onSend={chat.send} />
    </section>
  );
}
