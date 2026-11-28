/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. Two editors share one document through a fake server. A
 * panel shows what was sent, what waits, and whether the two texts are equal.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { CollabEditor, CollabSession } from "./collab";
import { createFakeChannel } from "./server/fakeChannel";
import type { FakeChannel } from "./server/fakeChannel";
import { createFakeServer } from "./server/fakeServer";

const PEOPLE = [
  { site: "asha", name: "Asha" },
  { site: "ravi", name: "Ravi" },
];
const MAX_DELAY_MS = 3000;
const LONG_TEXT_LENGTH = 100_000;

interface Side {
  site: string;
  name: string;
  session: CollabSession;
  channel: FakeChannel;
}

function createDemo() {
  const server = createFakeServer();
  const sides: Side[] = PEOPLE.map((person) => {
    const session = new CollabSession({ site: person.site });
    return { ...person, session, channel: createFakeChannel(server, session) };
  });
  return { server, sides };
}

/** A long text of plain words, to try the editor with a large document. */
function createLongText(length: number): string {
  const words = "the quick brown fox jumps over the lazy dog\n";
  return words.repeat(Math.ceil(length / words.length)).slice(0, length);
}

function SidePanel({ side }: { side: Side }) {
  const [delayMs, setDelayMs] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const stats = useSyncExternalStore(side.channel.subscribe, side.channel.getStats);
  useSyncExternalStore(side.session.subscribe, side.session.version);

  return (
    <section className="side" aria-label={side.name}>
      <CollabEditor session={side.session} label={`${side.name}'s editor`} />
      <label className="side__control">
        Delay: {delayMs} ms
        <input
          type="range"
          min={0}
          max={MAX_DELAY_MS}
          step={100}
          value={delayMs}
          onChange={(event) => {
            side.channel.setDelay(Number(event.target.value));
            setDelayMs(Number(event.target.value));
          }}
        />
      </label>
      <label className="side__control side__control--toggle">
        <input
          type="checkbox"
          checked={isOffline}
          onChange={(event) => {
            side.channel.setOnline(!event.target.checked);
            setIsOffline(event.target.checked);
          }}
        />
        Go offline
      </label>
      <p className="side__numbers">
        Operations sent: <strong>{stats.sent}</strong>, received: <strong>{stats.received}</strong>,
        waiting for the server:{" "}
        <strong data-testid={`pending-${side.site}`}>{side.session.pendingCount}</strong>
      </p>
    </section>
  );
}

export function App() {
  // useState with a function creates the server and the sessions once.
  const [{ server, sides }] = useState(createDemo);
  const [, redraw] = useState(0);

  // Draw the panel again when either session changes.
  useEffect(() => {
    const stops = sides.map((side) => side.session.subscribe(() => redraw((count) => count + 1)));
    return () => stops.forEach((stop) => stop());
  }, [sides]);

  const texts = sides.map((side) => side.session.doc.text());
  const areEqual = texts.every((text) => text === texts[0]);

  return (
    <main className="page">
      <h1>Chapter 13: Collaborative editor</h1>
      <p className="page__intro">
        Two people type in the same document. Add a delay or take one side offline, type on both
        sides, and see that both end with the same text. Ctrl+Z (or Cmd+Z) takes back your own last
        change, and leaves the changes of the other person alone.
      </p>

      <div className="page__editors">
        {sides.map((side) => (
          <SidePanel key={side.site} side={side} />
        ))}
      </div>

      <section className="panel" aria-label="What is happening">
        <p>
          <strong>The two texts are equal:</strong>{" "}
          <span data-testid="texts-equal">{areEqual ? "yes" : "no"}</span>
        </p>
        <p>
          <strong>Operations in the log of the server:</strong>{" "}
          <span data-testid="log-length">{server.getLog().length}</span>
        </p>
        <p>
          <strong>Characters in the document:</strong>{" "}
          <span data-testid="text-length">{texts[0].length}</span>
        </p>
        <button
          type="button"
          className="panel__button"
          onClick={() => {
            const text = sides[0].session.doc.text() + createLongText(LONG_TEXT_LENGTH);
            sides[0].session.edit(text, text.length);
          }}
        >
          Add 100,000 characters
        </button>
        <p className="panel__hint">
          Type a word quickly: it is sent as one operation, not one per letter. Take a side offline,
          type on both sides, and bring it back: each side receives only what it missed.
        </p>
      </section>
    </main>
  );
}
