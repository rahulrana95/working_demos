/*
 * NOT PART OF THE INTERVIEW.
 * Two whiteboards and the fake server together, as in the demo. Time is
 * moved by hand, so the tests decide what arrives when.
 */
import { act, renderHook } from "@testing-library/react";
import { createFakeServer } from "./api/fakeServer";
import type { FakeConnection, FakeServer } from "./api/fakeServer";
import { useWhiteboard } from "./whiteboard";
import type { BoardAction, Transport, UseWhiteboardReturn } from "./whiteboard";

const DELAY_MS = 20;

/** One user: the hook, joined to the server while `online` is true. */
function createUser(server: FakeServer, userId: string) {
  let connection: FakeConnection | null = null;
  const transport: Transport = {
    send: (operation) => connection?.send(operation),
    sendPresence: (presence) => connection?.sendPresence(presence),
  };
  const hook = renderHook(
    ({ isOnline }: { isOnline: boolean }) =>
      useWhiteboard({ userId, userName: userId, userColour: "black", transport, isOnline }),
    { initialProps: { isOnline: false } },
  );
  const board = (): UseWhiteboardReturn => hook.result.current;

  const user = {
    board,
    order: () => board().state.sync.scene.order,
    connect() {
      connection = server.connect(userId, board().state.sync.lastSeq, {
        onOperation: (seq, operation) => act(() => board().receiveOperation(seq, operation)),
        onPresence: (presence) => act(() => board().receivePresence(presence)),
        onPeerLeft: (peerId) => act(() => board().removePeer(peerId)),
      });
      hook.rerender({ isOnline: true });
    },
    disconnect() {
      connection?.close();
      connection = null;
      hook.rerender({ isOnline: false });
    },
    act(...actions: BoardAction[]) {
      act(() => actions.forEach((action) => board().dispatch(action)));
    },
    drawRect(x: number) {
      user.act(
        { type: "tool", tool: "rect" },
        { type: "down", point: { x, y: 10 } },
        { type: "drag", point: { x: x + 40, y: 50 } },
        { type: "up" },
      );
    },
  };
  user.connect();
  return user;
}

function settle() {
  act(() => vi.advanceTimersByTime(DELAY_MS * 20));
}

describe("two users on one board", () => {
  let server: FakeServer;

  beforeEach(() => {
    vi.useFakeTimers();
    server = createFakeServer({ delayMs: () => DELAY_MS });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("A draws, B draws, A presses undo: only A's shape goes, on both boards", () => {
    const a = createUser(server, "a");
    const b = createUser(server, "b");
    a.drawRect(10);
    settle();
    b.drawRect(200);
    settle();
    expect(a.order()).toEqual(["a-1", "b-1"]);
    expect(b.order()).toEqual(["a-1", "b-1"]);

    a.act({ type: "undo" });
    // A sees it at once. B sees it when the server has passed it on.
    expect(a.order()).toEqual(["b-1"]);
    expect(b.order()).toEqual(["a-1", "b-1"]);
    settle();

    expect(a.order()).toEqual(["b-1"]);
    expect(b.order()).toEqual(["b-1"]);
    expect(
      server.getLog().map((operation) => `${operation.userId}:${operation.command.type}`),
    ).toEqual(["a:add", "b:add", "a:remove"]);
  });

  it("a user sees their own shape at once, before the server answers", () => {
    const a = createUser(server, "a");

    a.drawRect(10);

    expect(a.order()).toEqual(["a-1"]);
    expect(a.board().state.sync.unconfirmed).toHaveLength(1);
    settle();
    expect(a.board().state.sync.unconfirmed).toEqual([]);
  });

  it("both draw at the same moment: both boards end with the same order, the server's", () => {
    const a = createUser(server, "a");
    const b = createUser(server, "b");

    b.drawRect(200);
    a.drawRect(10);
    expect(a.order()).toEqual(["a-1"]);
    expect(b.order()).toEqual(["b-1"]);
    settle();

    expect(a.order()).toEqual(b.order());
    expect(a.order()).toHaveLength(2);
  });

  it("what a user draws while offline is sent when they are back, and is drawn once everywhere", () => {
    const a = createUser(server, "a");
    const b = createUser(server, "b");
    a.disconnect();

    a.drawRect(10);
    a.drawRect(100);
    b.drawRect(300);
    settle();
    expect(a.order()).toEqual(["a-1", "a-2"]);
    expect(b.order()).toEqual(["b-1"]);

    a.connect();
    settle();

    // An add names its place in the drawing order. A drew on an empty board,
    // so A's shapes take places 0 and 1, under the shape B drew in the meantime.
    expect(b.order()).toEqual(["a-1", "a-2", "b-1"]);
    expect(a.order()).toEqual(["a-1", "a-2", "b-1"]);
    expect(a.board().state.sync.unconfirmed).toEqual([]);
  });

  it("an operation that reached the server just before the connection dropped is not drawn twice after the resend", () => {
    const a = createUser(server, "a");
    const b = createUser(server, "b");

    // The operation leaves, and the connection drops before the server confirms it.
    a.drawRect(10);
    a.disconnect();
    settle();
    expect(server.getLog()).toHaveLength(1);
    expect(a.board().state.sync.unconfirmed).toHaveLength(1);

    // Back online: A sends it again with the same id.
    a.connect();
    settle();

    expect(server.getLog()).toHaveLength(1);
    expect(a.order()).toEqual(["a-1"]);
    expect(b.order()).toEqual(["a-1"]);
    expect(a.board().state.sync.unconfirmed).toEqual([]);
  });

  it("shows the pointer of the other user, and removes it when they disconnect", () => {
    const a = createUser(server, "a");
    const b = createUser(server, "b");
    settle();

    act(() => b.board().reportCursor({ x: 70, y: 80 }));
    settle();
    expect(a.board().state.peers.b).toMatchObject({ cursor: { x: 70, y: 80 } });

    b.disconnect();
    settle();
    expect(a.board().state.peers).toEqual({});
  });
});
