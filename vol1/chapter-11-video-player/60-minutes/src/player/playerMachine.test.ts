/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you draw the state machine and walk through two or three
 * of these cases aloud. Here every transition is a test.
 */
import { INITIAL_STATE, MEDIA_SIGNALS, TRANSITIONS, reducePlayer } from "./playerMachine";
import type { PlayerEvent, PlayerState, PlayerStatus } from "./playerMachine";

const ALL_STATUSES = Object.keys(TRANSITIONS) as PlayerStatus[];

const ALL_EVENTS: PlayerEvent[] = [
  ...MEDIA_SIGNALS.map((type) => ({ type })),
  { type: "load" },
  { type: "play" },
  { type: "play_rejected" },
  { type: "retry" },
  { type: "loadedmetadata", duration: 300 },
  { type: "timeupdate", currentTime: 12 },
  { type: "seek", time: 30 },
];

function stateWith(status: PlayerStatus, rest: Partial<PlayerState> = {}): PlayerState {
  return { status, currentTime: 10, duration: 300, ...rest };
}

/** Sends the events one after the other and returns the last state. */
function run(start: PlayerState, events: PlayerEvent[]): PlayerState {
  return events.reduce(reducePlayer, start);
}

describe("reducePlayer: the path of a normal play", () => {
  it("starts idle, with no time and no duration", () => {
    expect(INITIAL_STATE).toEqual({ status: "idle", currentTime: 0, duration: 0 });
  });

  it("goes idle, loading, ready, buffering, playing, paused, playing, ended", () => {
    const statuses: PlayerStatus[] = [];
    const events: PlayerEvent[] = [
      { type: "load" },
      { type: "loadedmetadata", duration: 300 },
      { type: "canplay" },
      { type: "play" },
      { type: "playing" },
      { type: "pause" },
      { type: "play" },
      { type: "playing" },
      { type: "pause" },
      { type: "ended" },
    ];

    events.reduce((state, event) => {
      const next = reducePlayer(state, event);
      statuses.push(next.status);
      return next;
    }, INITIAL_STATE);

    expect(statuses).toEqual([
      "loading",
      "loading",
      "ready",
      "buffering",
      "playing",
      "paused",
      "buffering",
      "playing",
      "paused",
      "ended",
    ]);
  });

  it("keeps the duration from loadedmetadata and the time from timeupdate", () => {
    const state = run(INITIAL_STATE, [
      { type: "load" },
      { type: "loadedmetadata", duration: 300 },
      { type: "timeupdate", currentTime: 42.5 },
    ]);

    expect(state).toEqual({ status: "loading", currentTime: 42.5, duration: 300 });
  });

  it("starts playing straight from loading when autoplay is allowed", () => {
    expect(reducePlayer(stateWith("loading"), { type: "playing" }).status).toBe("playing");
  });
});

describe("reducePlayer: the network stalls", () => {
  it("is in exactly one state, buffering, when the network stalls during play", () => {
    expect(reducePlayer(stateWith("playing"), { type: "waiting" }).status).toBe("buffering");
  });

  it("goes back to playing when the data arrives", () => {
    const state = run(stateWith("playing"), [{ type: "waiting" }, { type: "playing" }]);

    expect(state.status).toBe("playing");
  });

  it("stays paused when the user pauses during a stall and the data arrives later", () => {
    const state = run(stateWith("playing"), [
      { type: "waiting" },
      { type: "pause" },
      { type: "canplay" },
    ]);

    expect(state.status).toBe("paused");
  });

  it("ignores a second waiting while it is already buffering", () => {
    const buffering = stateWith("buffering");

    expect(reducePlayer(buffering, { type: "waiting" })).toBe(buffering);
  });

  it("ignores waiting while paused, so a seek in a paused video shows no spinner", () => {
    const paused = stateWith("paused");

    expect(reducePlayer(paused, { type: "waiting" })).toBe(paused);
  });
});

describe("reducePlayer: play is refused", () => {
  it("goes back to paused when the browser rejects play", () => {
    const state = run(stateWith("ready"), [{ type: "play" }, { type: "play_rejected" }]);

    expect(state.status).toBe("paused");
  });

  it("stays loading when autoplay is rejected before the video can play", () => {
    const state = run(stateWith("loading"), [{ type: "play" }, { type: "play_rejected" }]);

    expect(state.status).toBe("loading");
  });

  it("ignores a rejection that arrives after the video started playing", () => {
    const playing = stateWith("playing");

    expect(reducePlayer(playing, { type: "play_rejected" })).toBe(playing);
  });
});

describe("reducePlayer: the end", () => {
  it("accepts ended after the pause that the element sends just before it", () => {
    const state = run(stateWith("playing"), [{ type: "pause" }, { type: "ended" }]);

    expect(state).toEqual({ status: "ended", currentTime: 300, duration: 300 });
  });

  it("accepts ended without a pause before it", () => {
    expect(reducePlayer(stateWith("playing"), { type: "ended" }).status).toBe("ended");
  });

  it("plays again from ended", () => {
    const state = run(stateWith("ended"), [{ type: "play" }, { type: "playing" }]);

    expect(state.status).toBe("playing");
  });

  it("becomes paused when the user seeks back from the end", () => {
    const state = reducePlayer(stateWith("ended", { currentTime: 300 }), {
      type: "seek",
      time: 20,
    });

    expect(state).toEqual({ status: "paused", currentTime: 20, duration: 300 });
  });
});

describe("reducePlayer: seeking", () => {
  it("moves the time at once, without waiting for the element", () => {
    expect(reducePlayer(stateWith("playing"), { type: "seek", time: 120 })).toEqual({
      status: "playing",
      currentTime: 120,
      duration: 300,
    });
  });

  it("keeps a seek inside the video", () => {
    expect(reducePlayer(stateWith("paused"), { type: "seek", time: -5 }).currentTime).toBe(0);
    expect(reducePlayer(stateWith("paused"), { type: "seek", time: 999 }).currentTime).toBe(300);
    expect(reducePlayer(stateWith("paused"), { type: "seek", time: Infinity }).currentTime).toBe(
      300,
    );
  });

  it.each<PlayerStatus>(["idle", "loading", "error"])("ignores a seek while %s", (status) => {
    const state = stateWith(status);

    expect(reducePlayer(state, { type: "seek", time: 120 })).toBe(state);
  });
});

describe("reducePlayer: errors and a new source", () => {
  it.each<PlayerStatus>(["loading", "ready", "playing", "paused", "buffering", "ended"])(
    "goes to error from %s",
    (status) => {
      expect(reducePlayer(stateWith(status), { type: "error" }).status).toBe("error");
    },
  );

  it("leaves error only by retry or by a new source", () => {
    const error = stateWith("error");

    for (const event of ALL_EVENTS) {
      const next = reducePlayer(error, event);
      if (event.type === "retry" || event.type === "load") {
        expect(next.status).toBe("loading");
      } else {
        expect(next).toBe(error);
      }
    }
  });

  it("changes only the status on retry: the element then reports its own time", () => {
    expect(reducePlayer(stateWith("error"), { type: "retry" })).toEqual({
      status: "loading",
      currentTime: 10,
      duration: 300,
    });
  });

  it("ignores retry when there is no error", () => {
    const playing = stateWith("playing");

    expect(reducePlayer(playing, { type: "retry" })).toBe(playing);
  });

  it.each(ALL_STATUSES)(
    "starts from zero in loading when a new source is set while %s",
    (status) => {
      expect(reducePlayer(stateWith(status), { type: "load" })).toEqual({
        status: "loading",
        currentTime: 0,
        duration: 0,
      });
    },
  );

  it("ignores every event but load while idle", () => {
    for (const event of ALL_EVENTS.filter((candidate) => candidate.type !== "load")) {
      expect(reducePlayer(INITIAL_STATE, event)).toBe(INITIAL_STATE);
    }
  });

  it("stores 0 for a duration that is not a number, as a live stream reports", () => {
    expect(
      reducePlayer(stateWith("loading"), { type: "loadedmetadata", duration: Infinity }).duration,
    ).toBe(0);
    expect(
      reducePlayer(stateWith("loading"), { type: "loadedmetadata", duration: NaN }).duration,
    ).toBe(0);
  });
});

describe("reducePlayer: every pair of state and event", () => {
  it("moves only as the table says, and returns the same object when nothing changes", () => {
    for (const status of ALL_STATUSES) {
      for (const event of ALL_EVENTS) {
        const state = stateWith(status);
        const next = reducePlayer(state, event);
        const expected =
          event.type === "load" ? "loading" : (TRANSITIONS[status][event.type] ?? status);

        expect(`${status} + ${event.type} = ${next.status}`).toBe(
          `${status} + ${event.type} = ${expected}`,
        );
      }
    }
  });

  it("never leaves the eight states, whatever order 5,000 events arrive in", () => {
    // A small random number generator with a fixed start, so the test is the same every run.
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    let state = INITIAL_STATE;
    for (let step = 0; step < 5000; step++) {
      state = reducePlayer(state, ALL_EVENTS[Math.floor(random() * ALL_EVENTS.length)]);

      expect(ALL_STATUSES).toContain(state.status);
      expect(state.currentTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(state.duration)).toBe(true);
    }
  });
});
