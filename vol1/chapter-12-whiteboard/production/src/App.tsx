/*
 * NOT PART OF THE INTERVIEW.
 * The demo page: two whiteboards for two users, joined by a fake server in
 * the page. The panels show what the users cannot see: the order the server
 * gave the operations, what still waits for the server, and the events.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFakeServer } from "./api/fakeServer";
import type { FakeConnection, FakeServer } from "./api/fakeServer";
import { createDemoScene } from "./demoScene";
import { Whiteboard, WhiteboardErrorBoundary, useWhiteboard } from "./whiteboard";
import type { BoardEvent, Operation, Scene, Transport } from "./whiteboard";

const MAX_EVENTS_SHOWN = 6;
const MAX_LOG_SHOWN = 12;

/** Counts the frames the browser draws, once a second. */
function useFramesPerSecond(): number {
  const [framesPerSecond, setFramesPerSecond] = useState(0);

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let frameId = requestAnimationFrame(function count(now) {
      frames += 1;
      if (now - windowStart >= 1000) {
        setFramesPerSecond(Math.round((frames * 1000) / (now - windowStart)));
        frames = 0;
        windowStart = now;
      }
      frameId = requestAnimationFrame(count);
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  return framesPerSecond;
}

interface UserBoardProps {
  server: FakeServer;
  scene: Scene;
  userId: string;
  userName: string;
  userColour: string;
}

function UserBoard({ server, scene, userId, userName, userColour }: UserBoardProps) {
  const [wantsOnline, setWantsOnline] = useState(true);
  const [connection, setConnection] = useState<FakeConnection | null>(null);
  const [events, setEvents] = useState<BoardEvent[]>([]);

  const transport = useMemo<Transport>(
    () => ({
      send: (operation) => connection?.send(operation),
      sendPresence: (presence) => connection?.sendPresence(presence),
    }),
    [connection],
  );

  const board = useWhiteboard({
    userId,
    userName,
    userColour,
    transport,
    isOnline: connection !== null,
    initialScene: scene,
    storageKey: `chapter-12-${userId}`,
    // Frame samples would push every other event out of the short list.
    onEvent: (event) =>
      event.type !== "frame" && setEvents((shown) => [...shown, event].slice(-MAX_EVENTS_SHOWN)),
  });
  const { state, receiveOperation, receivePresence, removePeer } = board;

  // The connect effect reads the last sequence number without running again for each one.
  const lastSeqRef = useRef(state.sync.lastSeq);
  useEffect(() => {
    lastSeqRef.current = state.sync.lastSeq;
  }, [state.sync.lastSeq]);

  useEffect(() => {
    if (!wantsOnline) {
      return;
    }
    const opened = server.connect(userId, lastSeqRef.current, {
      onOperation: receiveOperation,
      onPresence: receivePresence,
      onPeerLeft: removePeer,
    });
    setConnection(opened);
    return () => {
      opened.close();
      setConnection(null);
    };
  }, [wantsOnline, server, userId, receiveOperation, receivePresence, removePeer]);

  return (
    <section className="user" aria-label={userName} data-testid={`user-${userId}`}>
      <h2>
        <span className="user__dot" style={{ backgroundColor: userColour }} /> {userName}
      </h2>
      <label className="user__toggle">
        <input
          type="checkbox"
          checked={wantsOnline}
          onChange={(event) => setWantsOnline(event.target.checked)}
        />
        Connected to the server
      </label>

      <Whiteboard board={board} />

      <div className="panel">
        <p>
          <strong>Shapes:</strong>{" "}
          <span data-testid="shape-count">{state.sync.scene.order.length}</span>.{" "}
          <strong>Waiting for the server:</strong>{" "}
          <span data-testid="unconfirmed">{state.sync.unconfirmed.length}</span>.{" "}
          <strong>Undo steps:</strong>{" "}
          <span data-testid="undo-count">{state.history.undoStack.length}</span>.{" "}
          <strong>Redo steps:</strong>{" "}
          <span data-testid="redo-count">{state.history.redoStack.length}</span>.{" "}
          <strong>Conflicts:</strong> <span data-testid="conflicts">{state.conflictCount}</span>.
        </p>
        <p>
          <strong>Last events</strong>
        </p>
        <ol className="panel__log" data-testid="events">
          {events.map((event, index) => (
            <li key={index}>{JSON.stringify(event)}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const SCENE_SIZES = [0, 1000, 10000, 25000];

interface Session {
  id: number;
  scene: Scene;
  server: FakeServer;
}

function describeOperation({ userId, command }: Operation): string {
  return `${userId}: ${command.type}`;
}

export function App() {
  const [log, setLog] = useState<Operation[]>([]);
  const [session, setSession] = useState<Session>(() => createSession(0, 0));
  const framesPerSecond = useFramesPerSecond();

  function createSession(id: number, shapeCount: number): Session {
    return {
      id,
      scene: createDemoScene(shapeCount),
      server: createFakeServer({ onLog: setLog }),
    };
  }

  return (
    <main className="page">
      <h1>Chapter 12: Whiteboard, the production version</h1>
      <p className="page__intro">
        Two users draw on the same board. Each <kbd>Undo</kbd> takes back only that user&apos;s own
        work. Keys: <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>{" "}
        or <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo, arrows move the selected shape, <kbd>Shift</kbd>
        +arrows resize a rectangle, <kbd>Delete</kbd> removes it, <kbd>Escape</kbd> cancels a drag,{" "}
        <kbd>+</kbd> and <kbd>-</kbd> zoom. With the Rectangle tool, <kbd>Enter</kbd> on the board
        adds a rectangle. <kbd>Tab</kbd> from the board goes through the shapes in view. The wheel,
        or two fingers on a trackpad, moves the view. <kbd>Ctrl</kbd> and the wheel, or a pinch on a
        trackpad, zooms.
      </p>

      <div className="users">
        <WhiteboardErrorBoundary key={`asha-${session.id}`}>
          <UserBoard
            server={session.server}
            scene={session.scene}
            userId="asha"
            userName="Asha"
            userColour="#b45309"
          />
        </WhiteboardErrorBoundary>
        <WhiteboardErrorBoundary key={`bela-${session.id}`}>
          <UserBoard
            server={session.server}
            scene={session.scene}
            userId="bela"
            userName="Bela"
            userColour="#7c3aed"
          />
        </WhiteboardErrorBoundary>
      </div>

      <section className="panel" aria-label="The server">
        <p>
          <strong>Operations in the order of the server: {log.length}.</strong>{" "}
          <strong>Frames per second:</strong> {framesPerSecond}.
        </p>
        <ol
          className="panel__log"
          data-testid="server-log"
          start={log.length - Math.min(log.length, MAX_LOG_SHOWN) + 1}
        >
          {log.slice(-MAX_LOG_SHOWN).map((operation) => (
            <li key={operation.id}>{describeOperation(operation)}</li>
          ))}
        </ol>
        <p className="panel__hint">
          Untick &quot;Connected to the server&quot; for one user, draw, and tick it again: the
          waiting operations are sent, and nothing is drawn twice. The last size is over the limit
          of 20,000 shapes, so the boards refuse to open it.
        </p>
      </section>

      <p className="page__loaders">
        {SCENE_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => {
              setLog([]);
              setSession(createSession(session.id + 1, size));
            }}
          >
            {size === 0 ? "Empty boards" : `Load ${size.toLocaleString("en")} shapes`}
          </button>
        ))}
      </p>
    </main>
  );
}
