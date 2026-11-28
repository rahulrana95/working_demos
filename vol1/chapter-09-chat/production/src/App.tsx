/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. The screens of two people, side by side, on one fake
 * server. Each screen has a conversation list, the open conversation and its
 * own network switches. The panel at the bottom shows the events for
 * monitoring, and every request and frame.
 *
 * `?seed=5000&page=5000` starts with 5,000 old messages and loads them in
 * one page. The measurement script uses it.
 */
import { useEffect, useState } from "react";
import { createFakeServer, NAMES } from "./api/fakeServer";
import type { FakeClient, FakeNetwork } from "./api/fakeServer";
import { LANGUAGES } from "./api/translations";
import type { Language } from "./api/translations";
import {
  askForNotifications,
  Chat,
  ConversationList,
  createChatSocket,
  defaultMessages,
  fill,
  notificationState,
  showNotification,
  useConversations,
  useTitleBadge,
} from "./chat";
import type { ChatEvent, ChatSocket } from "./chat";

const LOG_LINES_SHOWN = 30;
const EVENTS_SHOWN = 8;

const SWITCHES: { key: keyof FakeNetwork; label: string }[] = [
  { key: "isDropped", label: "Drop the connection" },
  { key: "isSlow", label: "Slow network" },
  { key: "failNextSend", label: "Fail the next send" },
  { key: "loseNextAnswer", label: "Lose the answer to the next send" },
  { key: "isSocketBlocked", label: "Block the WebSocket (use long polling)" },
];

function numberFromUrl(name: string, fallback: number): number {
  const value = Number(new URLSearchParams(window.location.search).get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

interface ScreenProps {
  client: FakeClient;
  language: Language;
  /** One screen of the two owns the title of the tab and the notifications. */
  ownsTitle: boolean;
  onSwitch: () => void;
  onEvent: (event: ChatEvent) => void;
}

interface ScreenBodyProps extends ScreenProps {
  socket: ChatSocket;
}

function ScreenBody({ client, socket, language, ownsTitle, onEvent }: ScreenBodyProps) {
  const [openId, setOpenId] = useState<string | null>(`asha-ravi`);
  const text = { ...defaultMessages, ...language.messages };

  const list = useConversations(openId, {
    currentUserId: client.userId,
    fetchConversations: client.fetchConversations,
    socket,
    onUnseenMessage: (_message, conversation) => {
      if (ownsTitle) {
        showNotification(
          fill(text.notificationTitle, { name: conversation.title }),
          conversation.id,
        );
      }
    },
  });
  useTitleBadge(ownsTitle ? list.unreadTotal : 0);

  const open = list.conversations.find((conversation) => conversation.id === openId);

  return (
    <div className="screen__body" dir={language.dir} lang={language.locale}>
      <ConversationList
        list={list}
        openConversationId={openId}
        onOpen={setOpenId}
        currentUserId={client.userId}
        text={text}
        locale={language.locale}
      />
      {openId !== null && (
        <Chat
          conversationId={openId}
          peerName={open?.title ?? ""}
          messages={language.messages}
          locale={language.locale}
          currentUserId={client.userId}
          fetchMessages={client.fetchMessages}
          sendMessage={client.sendMessage}
          uploadFile={client.uploadFile}
          socket={socket}
          onEvent={onEvent}
        />
      )}
    </div>
  );
}

function Screen(props: ScreenProps) {
  const { client, onSwitch, onEvent } = props;
  const userName = NAMES[client.userId];
  const [socket, setSocket] = useState<ChatSocket | null>(null);

  // One connection for the whole screen. It is made in an effect, so it is
  // closed when the screen is removed.
  useEffect(() => {
    const created = createChatSocket({ connect: client.connect, poll: client.poll, onEvent });
    setSocket(created);
    return () => created.close();
  }, [client, onEvent]);

  return (
    <section className="screen" aria-label={`The screen of ${userName}`}>
      <h2>{userName}</h2>
      {socket !== null && <ScreenBody {...props} socket={socket} />}
      <fieldset className="screen__switches">
        <legend>The network of {userName}</legend>
        {SWITCHES.map(({ key, label }) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={client.network[key]}
              onChange={(event) => {
                client.setNetwork(key, event.target.checked);
                onSwitch();
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </section>
  );
}

export function App() {
  const [log, setLog] = useState<string[]>([]);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [languageKey, setLanguageKey] = useState("en");
  const [permission, setPermission] = useState(notificationState);
  const language = LANGUAGES[languageKey];
  // The switches live in the fake server. This counter only draws the page again.
  const [, setSwitchCount] = useState(0);
  const redraw = () => setSwitchCount((count) => count + 1);

  // useState with a function creates these once.
  const [onEvent] = useState(() => (event: ChatEvent) => setEvents((all) => [...all, event]));
  const [demo] = useState(() => {
    const server = createFakeServer({
      seedCount: numberFromUrl("seed", 60),
      pageSize: numberFromUrl("page", 20),
      onLog: (line) => setLog((lines) => [...lines, line]),
      onNetworkChange: redraw,
    });
    return { server, asha: server.join("asha"), ravi: server.join("ravi") };
  });

  return (
    <main className="page">
      <h1>Chapter 9: Chat</h1>
      <p className="page__intro">
        Two people, three conversations. Type in one screen and press <kbd>Enter</kbd>. Use{" "}
        <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line.
      </p>

      <div className="page__tools">
        <label>
          Language of the chat{" "}
          <select value={languageKey} onChange={(event) => setLanguageKey(event.target.value)}>
            {Object.entries(LANGUAGES).map(([key, { name }]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => demo.server.sendAs("meera", "asha-meera", "Asha, do you have a minute?")}
        >
          Meera writes to Asha
        </button>
        {/* The browser is asked only after this click, never when the page loads. */}
        <button
          type="button"
          disabled={permission !== "default"}
          onClick={async () => setPermission(await askForNotifications())}
        >
          Notifications for Asha: {permission === "default" ? "turn on" : permission}
        </button>
      </div>

      <div className="screens">
        <Screen
          client={demo.asha}
          language={language}
          ownsTitle
          onSwitch={redraw}
          onEvent={onEvent}
        />
        <Screen
          client={demo.ravi}
          language={language}
          ownsTitle={false}
          onSwitch={redraw}
          onEvent={onEvent}
        />
      </div>

      <section className="panel" aria-label="What is happening">
        <p>
          <strong>Events for monitoring: {events.length}</strong> (the last {EVENTS_SHOWN} are
          shown). They hold numbers and fixed words, never the text of a message.
        </p>
        <ol className="panel__log">
          {events.slice(-EVENTS_SHOWN).map((event, index) => (
            <li key={events.length - index}>{JSON.stringify(event)}</li>
          ))}
        </ol>
        <p>
          <strong>Requests and frames: {log.length}</strong> (the last {LOG_LINES_SHOWN} are shown)
        </p>
        <ol className="panel__log">
          {log.slice(-LOG_LINES_SHOWN).map((line, index) => (
            <li key={log.length - index}>{line}</li>
          ))}
        </ol>
        <p className="panel__hint">
          Tick "Drop the connection" for Asha, send a message and reload the page. The message is
          still there, and it is sent.
        </p>
      </section>
    </main>
  );
}
