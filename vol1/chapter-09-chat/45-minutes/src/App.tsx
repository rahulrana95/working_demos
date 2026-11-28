/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. Two screens of one conversation, side by side, on one fake
 * server. Each screen has its own network switches. The panel at the bottom
 * shows every request and every frame.
 *
 * `?seed=5000&page=5000` starts with 5,000 old messages and loads them in
 * one page. The measurement script uses it.
 */
import { useState } from "react";
import { CONVERSATION_ID, createFakeServer } from "./api/fakeServer";
import type { FakeClient, FakeNetwork } from "./api/fakeServer";
import { Chat } from "./chat";

const LOG_LINES_SHOWN = 30;

const SWITCHES: { key: keyof FakeNetwork; label: string }[] = [
  { key: "isDropped", label: "Drop the connection" },
  { key: "isSlow", label: "Slow network" },
  { key: "failNextSend", label: "Fail the next send" },
  { key: "loseNextAnswer", label: "Lose the answer to the next send" },
];

function numberFromUrl(name: string, fallback: number): number {
  const value = Number(new URLSearchParams(window.location.search).get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

interface ScreenProps {
  client: FakeClient;
  userName: string;
  peerName: string;
  onSwitch: () => void;
}

function Screen({ client, userName, peerName, onSwitch }: ScreenProps) {
  return (
    <section className="screen" aria-label={`The screen of ${userName}`}>
      <h2>{userName}</h2>
      <Chat
        conversationId={CONVERSATION_ID}
        peerName={peerName}
        currentUserId={client.userId}
        fetchMessages={client.fetchMessages}
        sendMessage={client.sendMessage}
        connect={client.connect}
      />
      <fieldset className="screen__switches">
        <legend>The network of {userName}</legend>
        {SWITCHES.map(({ key, label }) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={client.network[key]}
              onChange={(event) => {
                client.network[key] = event.target.checked;
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
  // The switches live in the fake server. This counter only draws the page again.
  const [, setSwitchCount] = useState(0);
  const redraw = () => setSwitchCount((count) => count + 1);

  // useState with a function creates the server once.
  const [clients] = useState(() => {
    const server = createFakeServer({
      seedCount: numberFromUrl("seed", 60),
      pageSize: numberFromUrl("page", 20),
      onLog: (line) => setLog((lines) => [...lines, line]),
      onNetworkChange: redraw,
    });
    return { asha: server.join("asha"), ravi: server.join("ravi") };
  });

  return (
    <main className="page">
      <h1>Chapter 9: Chat</h1>
      <p className="page__intro">
        Two people in one conversation. Type in one screen and press <kbd>Enter</kbd>. Use{" "}
        <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line.
      </p>

      <div className="screens">
        <Screen client={clients.asha} userName="Asha" peerName="Ravi" onSwitch={redraw} />
        <Screen client={clients.ravi} userName="Ravi" peerName="Asha" onSwitch={redraw} />
      </div>

      <section className="panel" aria-label="What is happening">
        <p>
          <strong>Requests and frames: {log.length}</strong> (the last {LOG_LINES_SHOWN} are shown)
        </p>
        <ol className="panel__log">
          {log.slice(-LOG_LINES_SHOWN).map((line, index) => (
            <li key={log.length - index}>{line}</li>
          ))}
        </ol>
        <p className="panel__hint">
          Every message you send is pushed back to you by the server. It is on your screen once,
          because both copies carry the same client id.
        </p>
      </section>
    </main>
  );
}
