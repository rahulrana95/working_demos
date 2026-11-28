/*
 * NOT PART OF THE INTERVIEW.
 * Tests for the hook: what is sent to the server and when, presence,
 * autosave and events. The transport is two functions that write down what
 * they were given.
 */
import { act, renderHook } from "@testing-library/react";
import type { BoardAction } from "./board";
import type { BoardEvent } from "./events";
import type { Presence } from "./presence";
import type { Operation } from "./sync";
import { useWhiteboard } from "./useWhiteboard";
import type { UseWhiteboardOptions } from "./useWhiteboard";

function createTransport() {
  const sent: Operation[] = [];
  const presences: Presence[] = [];
  return {
    sent,
    presences,
    transport: {
      send: (operation: Operation) => void sent.push(operation),
      sendPresence: (presence: Presence) => void presences.push(presence),
    },
  };
}

function setup(overrides: Partial<UseWhiteboardOptions> = {}) {
  const wire = createTransport();
  const events: BoardEvent[] = [];
  const initialProps: UseWhiteboardOptions = {
    userId: "a",
    userName: "Asha",
    userColour: "orange",
    transport: wire.transport,
    isOnline: true,
    onEvent: (event) => events.push(event),
    ...overrides,
  };
  const hook = renderHook((props: UseWhiteboardOptions) => useWhiteboard(props), { initialProps });
  const dispatchAll = (...actions: BoardAction[]) =>
    act(() => actions.forEach((action) => hook.result.current.dispatch(action)));
  const drawRect = (x: number) =>
    dispatchAll(
      { type: "tool", tool: "rect" },
      { type: "down", point: { x, y: 10 } },
      { type: "drag", point: { x: x + 40, y: 50 } },
      { type: "up" },
    );
  return { ...wire, events, hook, initialProps, dispatchAll, drawRect };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sending operations", () => {
  it("sends a new operation once, and not again on later renders", () => {
    const { sent, drawRect, dispatchAll } = setup();

    drawRect(10);
    dispatchAll({ type: "pan", dx: 5, dy: 5 });
    dispatchAll({ type: "tool", tool: "select" });

    expect(sent.map((operation) => operation.id)).toEqual(["a-1"]);
    expect(sent[0]).toMatchObject({ userId: "a", command: { type: "add" } });
  });

  it("sends nothing while offline, and keeps the operations waiting", () => {
    const { sent, drawRect, hook } = setup({ isOnline: false });

    drawRect(10);
    drawRect(100);

    expect(sent).toEqual([]);
    expect(hook.result.current.state.sync.unconfirmed).toHaveLength(2);
    expect(hook.result.current.state.sync.scene.order).toEqual(["a-1", "a-2"]);
  });

  it("sends the waiting operations, in order and with the same ids, when the connection is back", () => {
    const { sent, drawRect, hook, initialProps, events } = setup({ isOnline: false });
    drawRect(10);
    drawRect(100);

    hook.rerender({ ...initialProps, isOnline: true });

    expect(sent.map((operation) => operation.id)).toEqual(["a-1", "a-2"]);
    expect(events).toContainEqual({ type: "reconnect", resent: 2 });
  });

  it("sends an operation again, with the same id, when the connection dropped before the server confirmed it", () => {
    const { sent, drawRect, hook, initialProps } = setup();
    drawRect(10);
    expect(sent).toHaveLength(1);

    hook.rerender({ ...initialProps, isOnline: false });
    hook.rerender({ ...initialProps, isOnline: true });

    expect(sent.map((operation) => operation.id)).toEqual(["a-1", "a-1"]);
    expect(sent[1]).toBe(sent[0]);
  });

  it("does not send a confirmed operation again after a reconnect", () => {
    const { sent, drawRect, hook, initialProps } = setup();
    drawRect(10);
    act(() => hook.result.current.receiveOperation(1, sent[0]));
    expect(hook.result.current.state.sync.unconfirmed).toEqual([]);

    hook.rerender({ ...initialProps, isOnline: false });
    hook.rerender({ ...initialProps, isOnline: true });

    expect(sent).toHaveLength(1);
  });

  it("the shape is there once after its operation was sent twice and confirmed once", () => {
    const { sent, drawRect, hook, initialProps } = setup();
    drawRect(10);
    hook.rerender({ ...initialProps, isOnline: false });
    hook.rerender({ ...initialProps, isOnline: true });
    expect(sent).toHaveLength(2);

    // The server ignores the second copy and confirms the operation once.
    act(() => hook.result.current.receiveOperation(1, sent[0]));
    // A transport that delivers it a second time does no harm either.
    act(() => hook.result.current.receiveOperation(1, sent[0]));

    expect(hook.result.current.state.sync.scene.order).toEqual(["a-1"]);
    expect(hook.result.current.state.sync.lastSeq).toBe(1);
  });

  it("an undo is sent as a new operation with its own id", () => {
    const { sent, drawRect, dispatchAll } = setup();
    drawRect(10);

    dispatchAll({ type: "undo" });

    expect(sent.map((operation) => [operation.id, operation.command.type])).toEqual([
      ["a-1", "add"],
      ["a-2", "remove"],
    ]);
  });
});

describe("receiving", () => {
  it("applies an operation of another user", () => {
    const { hook } = setup();
    const operation: Operation = {
      id: "b-1",
      userId: "b",
      command: {
        type: "add",
        index: 0,
        shape: { id: "b-1", kind: "rect", x: 0, y: 0, width: 5, height: 5, stroke: "red" },
      },
    };

    act(() => hook.result.current.receiveOperation(1, operation));

    expect(hook.result.current.state.sync.scene.order).toEqual(["b-1"]);
  });

  it("keeps the presence of the others, not its own, and drops a user who left", () => {
    const { hook } = setup();
    const bela = {
      userId: "b",
      name: "Bela",
      colour: "purple",
      cursor: { x: 1, y: 2 },
      selectedId: null,
    };

    act(() => {
      hook.result.current.receivePresence(bela);
      hook.result.current.receivePresence({ ...bela, userId: "a", name: "Asha" });
    });
    expect(hook.result.current.state.peers).toEqual({ b: bela });

    act(() => hook.result.current.removePeer("b"));
    expect(hook.result.current.state.peers).toEqual({});
  });
});

describe("presence", () => {
  it("sends the pointer as a board position, with the name and the colour", () => {
    const { presences, hook, dispatchAll } = setup();
    dispatchAll({ type: "pan", dx: -100, dy: -100 });
    presences.length = 0;
    act(() => vi.advanceTimersByTime(100));

    act(() => hook.result.current.reportCursor({ x: 30, y: 40 }));

    expect(presences).toEqual([
      { userId: "a", name: "Asha", colour: "orange", cursor: { x: 130, y: 140 }, selectedId: null },
    ]);
  });

  it("sends at most one message in 50 milliseconds, and the last position is never lost", () => {
    const { presences, hook } = setup();
    act(() => vi.advanceTimersByTime(100));
    presences.length = 0;

    act(() => {
      for (let move = 1; move <= 200; move++) {
        hook.result.current.reportCursor({ x: move, y: 0 });
        vi.advanceTimersByTime(1);
      }
      vi.advanceTimersByTime(100);
    });

    expect(presences.length).toBeLessThanOrEqual(6);
    expect(presences[presences.length - 1].cursor).toEqual({ x: 200, y: 0 });
  });

  it("sends the selection when it changes, and null when the pointer leaves", () => {
    const { presences, hook, drawRect } = setup();
    drawRect(10);
    act(() => vi.advanceTimersByTime(100));
    expect(presences[presences.length - 1].selectedId).toBe("a-1");

    act(() => hook.result.current.reportCursor(null));
    act(() => vi.advanceTimersByTime(100));

    expect(presences[presences.length - 1].cursor).toBeNull();
  });

  it("sends no presence while offline", () => {
    const { presences, hook } = setup({ isOnline: false });

    act(() => {
      hook.result.current.reportCursor({ x: 30, y: 40 });
      vi.advanceTimersByTime(200);
    });

    expect(presences).toEqual([]);
  });

  it("leaves no timer behind when the board is removed", () => {
    const { hook } = setup();
    act(() => {
      hook.result.current.reportCursor({ x: 1, y: 1 });
      hook.result.current.reportCursor({ x: 2, y: 2 });
    });

    hook.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("autosave", () => {
  it("saves a moment after the last change, once for many quick changes", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { drawRect, events } = setup({ storageKey: "board", saveDelayMs: 500 });

    drawRect(10);
    act(() => vi.advanceTimersByTime(300));
    drawRect(100);
    act(() => vi.advanceTimersByTime(300));
    drawRect(200);
    expect(setItem).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));

    expect(setItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(setItem.mock.calls[0][1]) as { order: string[] };
    expect(saved.order).toEqual(["a-1", "a-2", "a-3"]);
    expect(events).toContainEqual({
      type: "save",
      ok: true,
      size: setItem.mock.calls[0][1].length,
    });
  });

  it("does not save when nothing was drawn, or when no key is given", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const withKey = setup({ storageKey: "board" });
    withKey.dispatchAll({ type: "pan", dx: 5, dy: 5 });
    const withoutKey = setup();
    withoutKey.drawRect(10);

    act(() => vi.advanceTimersByTime(5000));

    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not throw when the storage is full, reports the failure, and tries again after the next change", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    const { drawRect, events, hook } = setup({ storageKey: "board", saveDelayMs: 500 });

    drawRect(10);
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
    expect(events).toContainEqual({ type: "save", ok: false, size: 0 });
    expect(hook.result.current.state.sync.scene.order).toEqual(["a-1"]);

    setItem.mockRestore();
    const working = vi.spyOn(Storage.prototype, "setItem");
    drawRect(100);
    act(() => vi.advanceTimersByTime(500));

    expect(working).toHaveBeenCalledTimes(1);
  });

  it("saves at once when the page is hidden before the wait is over", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { drawRect } = setup({ storageKey: "board", saveDelayMs: 500 });
    drawRect(10);

    act(() => void window.dispatchEvent(new Event("pagehide")));

    expect(setItem).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("drops the waiting save when the board is removed", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { drawRect, hook } = setup({ storageKey: "board", saveDelayMs: 500 });
    drawRect(10);

    hook.unmount();
    vi.advanceTimersByTime(1000);

    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("events", () => {
  it("reports a new shape, an undo and a redo", () => {
    const { drawRect, dispatchAll, events } = setup();

    drawRect(10);
    dispatchAll({ type: "undo" }, { type: "redo" });

    expect(events).toEqual([
      { type: "shape_created", kind: "rect" },
      { type: "undo", applied: true },
      { type: "redo", applied: true },
    ]);
  });

  it("calls the newest onEvent function", () => {
    const { drawRect, hook, initialProps, events } = setup();
    const newer: BoardEvent[] = [];

    hook.rerender({ ...initialProps, onEvent: (event) => newer.push(event) });
    drawRect(10);

    expect(events).toEqual([]);
    expect(newer).toEqual([{ type: "shape_created", kind: "rect" }]);
  });

  it("makes one frame event a second out of many redraws", () => {
    const { hook, events } = setup();
    // 120 frames, 16 milliseconds apart: a little under two seconds.
    let now = 5000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    act(() => {
      for (let frame = 0; frame < 120; frame++) {
        hook.result.current.reportFrame(1.5, 40);
        now += 16;
      }
    });

    const frames = events.filter((event) => event.type === "frame");
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ type: "frame", drawMs: 1.5, shapesDrawn: 40 });
  });

  it("works without an onEvent function", () => {
    const { drawRect, dispatchAll } = setup({ onEvent: undefined });

    expect(() => {
      drawRect(10);
      dispatchAll({ type: "undo" });
    }).not.toThrow();
  });

  it("never puts a position, a colour, an id or a name in an event, with everything switched on", () => {
    const { drawRect, dispatchAll, events, hook, initialProps } = setup({
      userId: "user-7f3a",
      userName: "Asha Rao",
      storageKey: "board",
    });
    dispatchAll({ type: "stroke", stroke: "#b42318" });
    drawRect(137);
    dispatchAll({ type: "nudge", dx: 10, dy: 0, at: 0 }, { type: "undo" }, { type: "redo" });
    act(() => {
      hook.result.current.reportCursor({ x: 613, y: 287 });
      hook.result.current.reportFrame(2, 1);
      vi.advanceTimersByTime(1000);
    });
    hook.rerender({ ...initialProps, userId: "user-7f3a", isOnline: false });
    hook.rerender({ ...initialProps, userId: "user-7f3a", isOnline: true });

    const types = new Set(events.map((event) => event.type));
    expect(types).toEqual(new Set(["shape_created", "undo", "redo", "save", "frame", "reconnect"]));
    const text = JSON.stringify(events);
    for (const secret of [
      "137",
      "177",
      "613",
      "287",
      "#b42318",
      "user-7f3a",
      "Asha",
      "stroke",
      "points",
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});
