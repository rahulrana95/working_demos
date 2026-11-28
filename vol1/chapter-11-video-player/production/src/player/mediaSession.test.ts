/* NOT PART OF THE INTERVIEW. */
import { connectMediaSession } from "./mediaSession";
import { createPlayerStore } from "./store";

type Handler = ((details: { seekOffset?: number; seekTime?: number }) => void) | null;

/** A stand-in for `navigator.mediaSession`. jsdom has none. */
function installMediaSession(unknownActions: string[] = []) {
  const handlers = new Map<string, Handler>();
  const session = {
    metadata: null as unknown,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, handler: Handler) => {
      if (unknownActions.includes(action)) {
        throw new TypeError(`The action "${action}" is not supported.`);
      }
      handlers.set(action, handler);
    }),
    setPositionState: vi.fn(),
  };
  Object.defineProperty(navigator, "mediaSession", { configurable: true, value: session });
  vi.stubGlobal(
    "MediaMetadata",
    class {
      title: string;
      constructor(init: { title: string }) {
        this.title = init.title;
      }
    },
  );
  return { session, handlers };
}

function setup() {
  const store = createPlayerStore();
  store.dispatch({ type: "load" });
  store.dispatch({ type: "loadedmetadata", duration: 300 });
  store.dispatch({ type: "canplay" });
  const actions = { play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
  return { store, actions };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaSession");
  vi.unstubAllGlobals();
});

describe("connectMediaSession", () => {
  it("does nothing, without an error, in a browser that has no Media Session", () => {
    const { store, actions } = setup();

    const disconnect = connectMediaSession(store, actions, "A film");

    expect(() => disconnect()).not.toThrow();
  });

  it("sets the title and connects play, pause and the three seek actions", () => {
    const { session, handlers } = installMediaSession();
    const { store, actions } = setup();

    connectMediaSession(store, actions, "A film");

    expect(session.metadata).toMatchObject({ title: "A film" });
    expect([...handlers.keys()]).toEqual([
      "play",
      "pause",
      "seekbackward",
      "seekforward",
      "seekto",
    ]);

    handlers.get("play")?.({});
    handlers.get("pause")?.({});
    expect(actions.play).toHaveBeenCalledTimes(1);
    expect(actions.pause).toHaveBeenCalledTimes(1);
  });

  it("seeks 10 seconds by default, or as far as the system asks", () => {
    const { handlers } = installMediaSession();
    const { store, actions } = setup();
    store.dispatch({ type: "timeupdate", currentTime: 100 });
    connectMediaSession(store, actions, "A film");

    handlers.get("seekforward")?.({});
    handlers.get("seekbackward")?.({ seekOffset: 30 });
    handlers.get("seekto")?.({ seekTime: 42 });

    expect(actions.seek.mock.calls).toEqual([[110], [70], [42]]);
  });

  it("still connects the other actions when the browser does not know one of them", () => {
    const { handlers } = installMediaSession(["seekto"]);
    const { store, actions } = setup();

    expect(() => connectMediaSession(store, actions, "A film")).not.toThrow();

    expect([...handlers.keys()]).toEqual(["play", "pause", "seekbackward", "seekforward"]);
  });

  it("tells the system whether the video plays", () => {
    const { session } = installMediaSession();
    const { store, actions } = setup();
    connectMediaSession(store, actions, "A film");
    expect(session.playbackState).toBe("paused");

    store.dispatch({ type: "playing" });
    expect(session.playbackState).toBe("playing");

    store.dispatch({ type: "waiting" });
    expect(session.playbackState).toBe("playing");

    store.dispatch({ type: "pause" });
    expect(session.playbackState).toBe("paused");
  });

  it("tells the system the position on a change of status, not on every time update", () => {
    const { session } = installMediaSession();
    const { store, actions } = setup();
    connectMediaSession(store, actions, "A film");
    session.setPositionState.mockClear();

    store.dispatch({ type: "playing" });
    for (let time = 1; time <= 100; time++) {
      store.dispatch({ type: "timeupdate", currentTime: time });
    }
    expect(session.setPositionState).toHaveBeenCalledTimes(1);

    store.dispatch({ type: "pause" });
    expect(session.setPositionState).toHaveBeenLastCalledWith({
      duration: 300,
      position: 100,
      playbackRate: 1,
    });
  });

  it("goes on when the system refuses the position", () => {
    const { session } = installMediaSession();
    session.setPositionState.mockImplementation(() => {
      throw new TypeError("bad position");
    });
    const { store, actions } = setup();

    expect(() => connectMediaSession(store, actions, "A film")).not.toThrow();
  });

  it("removes its handlers, the title and the state when it disconnects", () => {
    const { session, handlers } = installMediaSession();
    const { store, actions } = setup();
    const disconnect = connectMediaSession(store, actions, "A film");

    disconnect();

    expect([...handlers.values()]).toEqual([null, null, null, null, null]);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");

    store.dispatch({ type: "playing" });
    expect(session.playbackState).toBe("none");
  });
});
