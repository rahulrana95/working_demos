/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you draw the state machine and walk through two or three
 * of these cases aloud. Here every transition is a test.
 */
import {
  INITIAL_STATE,
  MAX_AUTO_RETRIES,
  MEDIA_SIGNALS,
  TRANSITIONS,
  backoffMs,
  reducePlayer,
  wantsToPlay,
} from "./playerMachine";
import type { PlayerEvent, PlayerState, PlayerStatus } from "./playerMachine";

const ALL_STATUSES = Object.keys(TRANSITIONS) as PlayerStatus[];

const ALL_EVENTS: PlayerEvent[] = [
  ...MEDIA_SIGNALS.map((type) => ({ type })),
  { type: "load" },
  { type: "play" },
  { type: "play_rejected" },
  { type: "retry" },
  { type: "stalled" },
  { type: "error", kind: "decode" },
  { type: "error", kind: "network" },
  { type: "progress", buffered: [[0, 20]] },
  { type: "ratechange", playbackRate: 1.5 },
  { type: "loadedmetadata", duration: 300 },
  { type: "timeupdate", currentTime: 12 },
  { type: "seek", time: 30 },
];

function stateWith(status: PlayerStatus, rest: Partial<PlayerState> = {}): PlayerState {
  return { ...INITIAL_STATE, status, currentTime: 10, duration: 300, ...rest };
}

/** Sends the events one after the other and returns the last state. */
function run(start: PlayerState, events: PlayerEvent[]): PlayerState {
  return events.reduce(reducePlayer, start);
}

describe("reducePlayer: the path of a normal play", () => {
  it("starts idle, with no time and no duration", () => {
    expect(INITIAL_STATE).toMatchObject({ status: "idle", currentTime: 0, duration: 0 });
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

    expect(state).toMatchObject({ status: "loading", currentTime: 42.5, duration: 300 });
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

    expect(state).toMatchObject({ status: "ended", currentTime: 300, duration: 300 });
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

    expect(state).toMatchObject({ status: "paused", currentTime: 20, duration: 300 });
  });
});

describe("reducePlayer: seeking", () => {
  it("moves the time at once, without waiting for the element", () => {
    expect(reducePlayer(stateWith("playing"), { type: "seek", time: 120 })).toMatchObject({
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

describe("reducePlayer: errors by kind", () => {
  it.each<PlayerStatus>(["loading", "ready", "playing", "paused", "buffering", "ended"])(
    "goes to error from %s for a decode error, and keeps the kind",
    (status) => {
      expect(reducePlayer(stateWith(status), { type: "error", kind: "decode" })).toMatchObject({
        status: "error",
        errorKind: "decode",
      });
    },
  );

  it("shows a source that is not supported as an error at once, with no try by itself", () => {
    expect(
      reducePlayer(stateWith("loading"), { type: "error", kind: "unsupported" }),
    ).toMatchObject({
      status: "error",
      errorKind: "unsupported",
      retries: 0,
    });
  });

  it("goes back to loading after a network error, and counts the try", () => {
    expect(reducePlayer(stateWith("playing"), { type: "error", kind: "network" })).toMatchObject({
      status: "loading",
      errorKind: null,
      retries: 1,
    });
  });

  it("keeps the time and the duration while it tries again, so the bar does not jump to zero", () => {
    const state = run(stateWith("playing", { currentTime: 42 }), [
      { type: "error", kind: "network" },
      // The element reports 0 while the source loads again.
      { type: "timeupdate", currentTime: 0 },
    ]);

    expect(state).toMatchObject({ status: "loading", currentTime: 42, duration: 300 });
  });

  it("accepts the time again when the video is back at the place of the user", () => {
    const state = run(stateWith("playing", { currentTime: 42 }), [
      { type: "error", kind: "network" },
      { type: "timeupdate", currentTime: 0 },
      { type: "timeupdate", currentTime: 42 },
      { type: "canplay" },
      { type: "timeupdate", currentTime: 42.25 },
    ]);

    expect(state).toMatchObject({ status: "ready", currentTime: 42.25 });
  });

  it(`shows the network error to the user after ${MAX_AUTO_RETRIES} tries by itself`, () => {
    let state = stateWith("playing");
    for (let attempt = 1; attempt <= MAX_AUTO_RETRIES; attempt++) {
      state = reducePlayer(state, { type: "error", kind: "network" });
      expect(state).toMatchObject({ status: "loading", retries: attempt });
    }

    state = reducePlayer(state, { type: "error", kind: "network" });

    expect(state).toMatchObject({ status: "error", errorKind: "network" });
  });

  it("gives a later network error all its tries again, once the video has played", () => {
    const state = run(stateWith("playing"), [
      { type: "error", kind: "network" },
      { type: "error", kind: "network" },
      { type: "canplay" },
      { type: "playing" },
    ]);

    expect(state).toMatchObject({ status: "playing", retries: 0 });
  });

  it("leaves error only by retry or by a new source", () => {
    const error = stateWith("error", { errorKind: "decode" });

    for (const event of ALL_EVENTS) {
      const next = reducePlayer(error, event);
      if (event.type === "retry" || event.type === "load") {
        expect(next.status).toBe("loading");
        expect(next.errorKind).toBeNull();
      } else if (event.type === "ratechange") {
        expect(next.status).toBe("error");
      } else {
        expect(next).toBe(error);
      }
    }
  });

  it("starts the count of tries again when the user presses Try again", () => {
    const state = reducePlayer(
      stateWith("error", { errorKind: "network", retries: MAX_AUTO_RETRIES }),
      { type: "retry" },
    );

    expect(state).toMatchObject({ status: "loading", retries: 0, currentTime: 10, duration: 300 });
  });

  it("ignores retry when there is no error", () => {
    const playing = stateWith("playing");

    expect(reducePlayer(playing, { type: "retry" })).toBe(playing);
  });

  it.each(ALL_STATUSES)(
    "starts from zero in loading when a new source is set while %s",
    (status) => {
      const before = stateWith(status, { retries: 2, errorKind: "decode", buffered: [[0, 5]] });

      expect(reducePlayer(before, { type: "load" })).toEqual({
        ...INITIAL_STATE,
        status: "loading",
      });
    },
  );

  it("keeps the speed of the user for the next video", () => {
    const state = run(INITIAL_STATE, [{ type: "ratechange", playbackRate: 1.5 }, { type: "load" }]);

    expect(state.playbackRate).toBe(1.5);
  });

  it("ignores every event but load while idle", () => {
    const others = ALL_EVENTS.filter(({ type }) => type !== "load" && type !== "ratechange");

    for (const event of others) {
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

describe("reducePlayer: a stall that the element does not report", () => {
  it("goes to buffering when the stall detector says the picture stands still", () => {
    expect(reducePlayer(stateWith("playing"), { type: "stalled" })).toMatchObject({
      status: "buffering",
      isStalled: true,
    });
  });

  it("goes back to playing when the time moves again, without a playing event", () => {
    const state = run(stateWith("playing"), [
      { type: "stalled" },
      { type: "timeupdate", currentTime: 10.25 },
    ]);

    expect(state).toMatchObject({ status: "playing", isStalled: false, currentTime: 10.25 });
  });

  it("stays buffering while the time does not move", () => {
    const state = run(stateWith("playing"), [
      { type: "stalled" },
      { type: "timeupdate", currentTime: 10 },
    ]);

    expect(state.status).toBe("buffering");
  });

  it("does not start playing on a time update when the element itself said waiting", () => {
    const state = run(stateWith("playing"), [
      { type: "waiting" },
      { type: "timeupdate", currentTime: 10.25 },
    ]);

    expect(state.status).toBe("buffering");
  });

  it.each<PlayerStatus>(["idle", "loading", "ready", "paused", "buffering", "ended", "error"])(
    "ignores a stall report while %s",
    (status) => {
      const state = stateWith(status);

      expect(reducePlayer(state, { type: "stalled" })).toBe(state);
    },
  );

  it("forgets the stall when the user pauses", () => {
    const state = run(stateWith("playing"), [{ type: "stalled" }, { type: "pause" }]);

    expect(state).toMatchObject({ status: "paused", isStalled: false });
  });
});

describe("reducePlayer: downloaded ranges and speed", () => {
  it("keeps the downloaded ranges that the element reports", () => {
    const buffered = [
      [0, 20],
      [40, 55],
    ] as const;

    expect(reducePlayer(stateWith("playing"), { type: "progress", buffered }).buffered).toBe(
      buffered,
    );
  });

  it("keeps the playback speed", () => {
    expect(
      reducePlayer(stateWith("playing"), { type: "ratechange", playbackRate: 2 }).playbackRate,
    ).toBe(2);
  });
});

describe("wantsToPlay", () => {
  it("is true while playing and while buffering, and false in every other state", () => {
    expect(ALL_STATUSES.filter(wantsToPlay)).toEqual(["playing", "buffering"]);
  });
});

describe("backoffMs", () => {
  it("waits 1, 2 and 4 seconds for the first three tries", () => {
    expect([1, 2, 3].map((retry) => backoffMs(retry, 0))).toEqual([1000, 2000, 4000]);
  });

  it("never waits longer than 8 seconds", () => {
    expect(backoffMs(4, 0)).toBe(8000);
    expect(backoffMs(20, 0)).toBe(8000);
  });

  it("takes off up to a quarter at random, so many players do not come back at one moment", () => {
    expect(backoffMs(1, 1)).toBe(750);
    expect(backoffMs(3, 0.5)).toBe(3500);
  });
});

describe("reducePlayer: every pair of state and event", () => {
  it("moves only as the table says, and returns the same object when nothing changes", () => {
    for (const status of ALL_STATUSES) {
      for (const event of ALL_EVENTS) {
        const state = stateWith(status);
        const next = reducePlayer(state, event);
        const table = TRANSITIONS[status][event.type] ?? status;
        const isRetriedByItself =
          event.type === "error" &&
          event.kind === "network" &&
          TRANSITIONS[status].error === "error";
        const expected = event.type === "load" || isRetriedByItself ? "loading" : table;

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
