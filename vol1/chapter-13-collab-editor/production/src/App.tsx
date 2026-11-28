/*
 * NOT PART OF THE INTERVIEW: production version.
 * The demo page. Two editors share one document through a fake server. A
 * switch picks the engine behind them: the CRDT or operational
 * transformation. A panel shows what the engines report.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { CollabEditor, CrdtEngine, OtEngine } from "./collab";
import type { CollabEvent, EditorEngine } from "./collab";
import { createCrdtServer } from "./server/crdtServer";
import { createFakeChannel } from "./server/fakeChannel";
import type { FakeChannel } from "./server/fakeChannel";
import { createOtServer } from "./server/otServer";

type EngineKind = "crdt" | "ot";

const PEOPLE = [
  { site: "asha", name: "Asha" },
  { site: "ravi", name: "Ravi" },
];
const MAX_DELAY_MS = 3000;
const LONG_TEXT_LENGTH = 100_000;
const EVENTS_SHOWN = 8;

interface Side {
  site: string;
  name: string;
  engine: EditorEngine;
  /** Only the CRDT engine has tombstones and can be saved. */
  crdt: CrdtEngine | null;
  channel: FakeChannel;
}

interface Demo {
  sides: Side[];
  getLogLength: () => number;
  dispose: () => void;
}

function createDemo(kind: EngineKind, onEvent: (site: string, event: CollabEvent) => void): Demo {
  const options = (person: (typeof PEOPLE)[number]) => ({
    ...person,
    onEvent: (event: CollabEvent) => onEvent(person.site, event),
  });
  let sides: Side[];
  let getLogLength: () => number;

  if (kind === "crdt") {
    const server = createCrdtServer();
    getLogLength = () => server.getLog().length;
    sides = PEOPLE.map((person) => {
      const engine = new CrdtEngine(options(person));
      return { ...person, engine, crdt: engine, channel: createFakeChannel(server, engine) };
    });
  } else {
    const server = createOtServer();
    getLogLength = () => server.getHistory().length;
    sides = PEOPLE.map((person) => {
      const engine = new OtEngine(options(person));
      return { ...person, engine, crdt: null, channel: createFakeChannel(server, engine) };
    });
  }

  return {
    sides,
    getLogLength,
    dispose() {
      sides.forEach((side) => {
        side.channel.dispose();
        side.engine.dispose();
      });
    },
  };
}

/** A long text of plain words, to try the editor with a large document. */
function createLongText(length: number): string {
  const words = "the quick brown fox jumps over the lazy dog\n";
  return words.repeat(Math.ceil(length / words.length)).slice(0, length);
}

function describeEvent(event: CollabEvent): string {
  const numbers = Object.entries(event)
    .filter(([key]) => key !== "type")
    .map(([key, value]) => `${key} ${value}`);
  return [event.type, ...numbers].join(", ");
}

function SidePanel({ side }: { side: Side }) {
  const [delayMs, setDelayMs] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  useSyncExternalStore(side.engine.subscribe, side.engine.version);

  return (
    <section className="side" aria-label={side.name}>
      <CollabEditor engine={side.engine} label={`${side.name}'s editor`} />
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
        Waiting for the server:{" "}
        <strong data-testid={`pending-${side.site}`}>{side.engine.pendingCount}</strong>
        {side.crdt !== null && (
          <>
            , tombstones:{" "}
            <strong data-testid={`tombstones-${side.site}`}>{side.crdt.doc.tombstoneCount}</strong>
          </>
        )}
      </p>
    </section>
  );
}

function DemoPage({ kind }: { kind: EngineKind }) {
  const [events, setEvents] = useState<string[]>([]);
  const [savedBytes, setSavedBytes] = useState<number | null>(null);
  // The demo is made in an effect, not during render: it opens lines and
  // starts timers, and the cleanup must close exactly what was opened.
  const [demo, setDemo] = useState<Demo | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    const created = createDemo(kind, (site, event) =>
      setEvents((old) => [`${site}: ${describeEvent(event)}`, ...old].slice(0, EVENTS_SHOWN)),
    );
    const stops = created.sides.map((side) =>
      side.engine.subscribe(() => redraw((count) => count + 1)),
    );
    setDemo(created);
    return () => {
      stops.forEach((stop) => stop());
      created.dispose();
    };
  }, [kind]);

  if (demo === null) {
    return null;
  }
  const { sides } = demo;
  const texts = sides.map((side) => side.engine.text());
  const areEqual = texts.every((text) => text === texts[0]);
  const firstCrdt = sides[0].crdt;

  return (
    <>
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
          <strong>Entries in the log of the server:</strong>{" "}
          <span data-testid="log-length">{demo.getLogLength()}</span>
        </p>
        <p>
          <strong>Characters in the document:</strong>{" "}
          <span data-testid="text-length">{texts[0].length}</span>
        </p>
        <div className="panel__buttons">
          <button
            type="button"
            className="panel__button"
            onClick={() => {
              const text = texts[0] + createLongText(LONG_TEXT_LENGTH);
              sides[0].engine.edit(text, text.length);
            }}
          >
            Add 100,000 characters
          </button>
          {firstCrdt !== null && (
            <button
              type="button"
              className="panel__button"
              onClick={() => setSavedBytes(JSON.stringify(firstCrdt.save()).length)}
            >
              Measure a snapshot
            </button>
          )}
        </div>
        {savedBytes !== null && (
          <p>
            <strong>Snapshot of {sides[0].name}&apos;s document:</strong>{" "}
            <span data-testid="snapshot-bytes">{savedBytes}</span> bytes as JSON
          </p>
        )}
        <p>
          <strong>Last events</strong> (numbers only, never text from the document):
        </p>
        <ol className="panel__log" data-testid="events">
          {events.map((event, index) => (
            <li key={events.length - index}>{event}</li>
          ))}
        </ol>
      </section>
    </>
  );
}

export function App() {
  const [kind, setKind] = useState<EngineKind>("crdt");

  return (
    <main className="page">
      <h1>Chapter 13: Collaborative editor</h1>
      <p className="page__intro">
        Two people type in the same document. Add a delay or take one side offline, type on both
        sides, and see that both end with the same text. Then switch the engine and do it again.
      </p>

      <fieldset className="page__engine">
        <legend>Engine</legend>
        <label>
          <input
            type="radio"
            name="engine"
            checked={kind === "crdt"}
            onChange={() => setKind("crdt")}
          />
          CRDT (the server only relays)
        </label>
        <label>
          <input
            type="radio"
            name="engine"
            checked={kind === "ot"}
            onChange={() => setKind("ot")}
          />
          Operational transformation (the server orders and transforms)
        </label>
      </fieldset>

      {/* The key makes a new page, with new engines, for the other kind. */}
      <DemoPage key={kind} kind={kind} />
    </main>
  );
}
