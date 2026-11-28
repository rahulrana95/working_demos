/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. Two editors share one document over a fake network. A panel
 * shows the operations that were sent and received, and whether the two
 * texts are equal.
 */
import { useEffect, useState } from "react";
import { CollabEditor, Rga } from "./collab";
import { createFakeNetwork } from "./network/fakeNetwork";

const PEOPLE = [
  { site: "asha", name: "Asha" },
  { site: "ravi", name: "Ravi" },
];
const MAX_DELAY_MS = 3000;

function createDemo() {
  const network = createFakeNetwork(PEOPLE.map((person) => person.site));
  return {
    network,
    editors: PEOPLE.map((person) => ({
      ...person,
      doc: new Rga(person.site),
      transport: network.transportFor(person.site),
    })),
  };
}

export function App() {
  // useState with a function creates the network and the documents once.
  const [{ network, editors }] = useState(createDemo);
  const [stats, setStats] = useState(network.getStats);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [offline, setOffline] = useState<Record<string, boolean>>({});

  useEffect(() => network.subscribe(() => setStats(network.getStats())), [network]);
  useEffect(() => () => network.dispose(), [network]);

  const areEqual = editors.every((editor) => texts[editor.site] === texts[editors[0].site]);

  return (
    <main className="page">
      <h1>Chapter 13: Collaborative editor</h1>
      <p className="page__intro">
        Two people type in the same document. Add a delay or take one side offline, type on both
        sides, and see that both end with the same text.
      </p>

      <div className="page__editors">
        {editors.map((editor) => (
          <section key={editor.site} className="side" aria-label={editor.name}>
            <CollabEditor
              doc={editor.doc}
              transport={editor.transport}
              label={`${editor.name}'s editor`}
              onTextChange={(text) => setTexts((old) => ({ ...old, [editor.site]: text }))}
            />
            <label className="side__control">
              Delay: {delays[editor.site] ?? 0} ms
              <input
                type="range"
                min={0}
                max={MAX_DELAY_MS}
                step={100}
                value={delays[editor.site] ?? 0}
                onChange={(event) => {
                  const ms = Number(event.target.value);
                  network.setDelay(editor.site, ms);
                  setDelays((old) => ({ ...old, [editor.site]: ms }));
                }}
              />
            </label>
            <label className="side__control side__control--toggle">
              <input
                type="checkbox"
                checked={offline[editor.site] ?? false}
                onChange={(event) => {
                  network.setOnline(editor.site, !event.target.checked);
                  setOffline((old) => ({ ...old, [editor.site]: event.target.checked }));
                }}
              />
              Go offline
            </label>
            <p className="side__numbers">
              Operations sent: <strong>{stats.sent[editor.site]}</strong>, received:{" "}
              <strong>{stats.received[editor.site]}</strong>
            </p>
          </section>
        ))}
      </div>

      <section className="panel" aria-label="What is happening">
        <p>
          <strong>The two texts are equal:</strong>{" "}
          <span data-testid="texts-equal">{areEqual ? "yes" : "no"}</span>
        </p>
        <p>
          <strong>Operations on their way:</strong>{" "}
          <span data-testid="in-flight">{stats.inFlight}</span>
        </p>
        <p className="panel__hint">
          Put the caret at the same place on both sides, set a delay, and type a word on each side.
          The words do not mix letter by letter, and both sides show them in the same order.
        </p>
      </section>
    </main>
  );
}
