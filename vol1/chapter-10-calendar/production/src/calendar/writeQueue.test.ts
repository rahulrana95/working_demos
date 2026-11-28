/*
 * NOT PART OF THE INTERVIEW: production version.
 * The queue is tested without React. The test answers each request by hand.
 */
import { createDeferred } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import { ConflictError, OfflineError } from "./types";
import type { CalendarEvent } from "./types";
import { WriteQueue } from "./writeQueue";
import type { QueuedWrite, WriteResult } from "./writeQueue";

const STORAGE_KEY = "test-queue";

function makeEvent(id: string, title = id): CalendarEvent {
  return { id, title, start: "2026-03-03T04:30:00.000Z", end: "2026-03-03T05:30:00.000Z" };
}

function write(event: CalendarEvent, action: QueuedWrite["action"] = "move"): QueuedWrite {
  return { id: event.id, event, action, by: "form", startedAt: 0 };
}

const remove = (id: string): QueuedWrite => ({
  id,
  event: null,
  action: "delete",
  by: "form",
  startedAt: 0,
});

/** A storage that lives in a Map, like localStorage. */
function createStorage(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    saved: (): QueuedWrite[] => JSON.parse(data.get(STORAGE_KEY) ?? "[]"),
  };
}

function createQueue(storage: ReturnType<typeof createStorage> | null = createStorage()) {
  const sent: (Deferred<CalendarEvent | null> & { write: QueuedWrite; signal: AbortSignal })[] = [];
  const results: [QueuedWrite, WriteResult][] = [];
  const onChange = vi.fn();
  const queue = new WriteQueue({
    send: (item, signal) => {
      const call = { write: item, signal, ...createDeferred<CalendarEvent | null>() };
      sent.push(call);
      return call.promise;
    },
    onResult: (item, result) => results.push([item, result]),
    onChange,
    timeoutMs: 1000,
    storage,
    storageKey: STORAGE_KEY,
  });
  return { queue, sent, results, onChange, storage };
}

/** Lets the promises that are ready run. The queue has a few steps between two sends. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await Promise.resolve();
  }
}

const ids = (queue: WriteQueue) => queue.writes.map((item) => item.id);

describe("WriteQueue: sending", () => {
  it("sends a write at once and keeps it until the server answers", async () => {
    const { queue, sent } = createQueue();
    const lunch = makeEvent("lunch");

    queue.add(write(lunch));
    await settle();

    expect(sent).toHaveLength(1);
    expect(sent[0].write.event).toEqual(lunch);
    expect(ids(queue)).toEqual(["lunch"]);
  });

  it("removes the write and reports the stored event when the server answers", async () => {
    const { queue, sent, results } = createQueue();
    const lunch = makeEvent("lunch");
    queue.add(write(lunch));
    await settle();

    const stored = { ...lunch, updatedAt: "2026-03-03T06:00:00.000Z" };
    sent[0].resolve(stored);
    await settle();

    expect(ids(queue)).toEqual([]);
    expect(results).toEqual([[write(lunch), { status: "saved", event: stored }]]);
  });

  it("sends one write at a time, in the order they were made", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    queue.add(write(makeEvent("b")));
    queue.add(write(makeEvent("c")));
    await settle();
    expect(sent.map((call) => call.write.id)).toEqual(["a"]);

    sent[0].resolve(makeEvent("a"));
    await settle();
    expect(sent.map((call) => call.write.id)).toEqual(["a", "b"]);

    sent[1].resolve(makeEvent("b"));
    await settle();
    expect(sent.map((call) => call.write.id)).toEqual(["a", "b", "c"]);
  });

  it("sends a delete as a write with no event, and reports null", async () => {
    const { queue, sent, results } = createQueue();
    queue.add(remove("lunch"));
    await settle();

    sent[0].resolve(null);
    await settle();

    expect(results[0][1]).toEqual({ status: "saved", event: null });
  });

  it("drops a write that the server refuses, reports it, and goes on with the next", async () => {
    const { queue, sent, results } = createQueue();
    queue.add(write(makeEvent("a")));
    queue.add(write(makeEvent("b")));
    await settle();

    sent[0].reject(new Error("500"));
    await settle();

    expect(results[0][1]).toEqual({ status: "failed" });
    expect(ids(queue)).toEqual(["b"]);
    expect(sent).toHaveLength(2);
  });

  it("tells the owner about every change of the queue", async () => {
    const { queue, sent, onChange } = createQueue();

    queue.add(write(makeEvent("a")));
    expect(onChange).toHaveBeenCalled();
    onChange.mockClear();
    await settle();
    sent[0].resolve(makeEvent("a"));
    await settle();

    expect(onChange).toHaveBeenCalled();
  });
});

describe("WriteQueue: two edits of one event", () => {
  it("keeps the second edit behind the one in flight, and sends it after", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a", "First")));
    await settle();

    queue.add(write(makeEvent("a", "Second")));
    await settle();

    expect(queue.writes.map((item) => item.event?.title)).toEqual(["First", "Second"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].signal.aborted).toBe(false);

    sent[0].resolve(makeEvent("a", "First"));
    await settle();
    expect(sent[1].write.event?.title).toBe("Second");
  });

  it("replaces an edit that still waits with a newer edit of the same event", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    await settle();
    queue.add(write(makeEvent("b", "First")));
    queue.add(write(makeEvent("c")));

    queue.add(write(makeEvent("b", "Second")));

    expect(queue.writes.map((item) => item.event?.title)).toEqual(["a", "Second", "c"]);
    expect(sent).toHaveLength(1);
  });

  it("gives the edit behind a save the new `updatedAt`, so it is not a conflict with our own save", async () => {
    const { queue, sent } = createQueue();
    const old = { ...makeEvent("a", "First"), updatedAt: "2026-03-01T00:00:00.000Z" };
    queue.add(write(old));
    await settle();
    queue.add(write({ ...old, title: "Second" }));

    sent[0].resolve({ ...old, updatedAt: "2026-03-03T09:00:00.000Z" });
    await settle();

    expect(sent[1].write.event).toMatchObject({
      title: "Second",
      updatedAt: "2026-03-03T09:00:00.000Z",
    });
  });

  it("needs no request for an event that is made and deleted before it was sent", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    await settle();
    queue.add(write(makeEvent("new"), "create"));

    queue.add(remove("new"));

    expect(ids(queue)).toEqual(["a"]);
    sent[0].resolve(makeEvent("a"));
    await settle();
    expect(sent).toHaveLength(1);
  });

  it("still tells the server it is a new event when a new event is edited before it was sent", async () => {
    const { queue } = createQueue();
    queue.add(write(makeEvent("a")));
    await settle();
    queue.add(write(makeEvent("new", "First"), "create"));

    queue.add(write(makeEvent("new", "Second"), "move"));

    expect(queue.writes[1]).toMatchObject({ action: "create", event: { title: "Second" } });
  });
});

describe("WriteQueue: conflicts", () => {
  it("reports the server's version when someone else changed the event first", async () => {
    const { queue, sent, results } = createQueue();
    const theirs = makeEvent("a", "Theirs");
    queue.add(write(makeEvent("a", "Mine")));
    await settle();

    sent[0].reject(new ConflictError(theirs));
    await settle();

    expect(results[0][1]).toEqual({ status: "conflict", current: theirs });
    expect(ids(queue)).toEqual([]);
  });

  it("drops the later edits of that event too, because they were made on the version that lost", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a", "Mine")));
    await settle();
    queue.add(write(makeEvent("a", "Mine again")));
    queue.add(write(makeEvent("b")));

    sent[0].reject(new ConflictError(makeEvent("a", "Theirs")));
    await settle();

    expect(ids(queue)).toEqual(["b"]);
  });
});

describe("WriteQueue: offline", () => {
  it("keeps the write and waits when the server cannot be reached", async () => {
    const { queue, sent, results } = createQueue();
    queue.add(write(makeEvent("a")));
    await settle();
    expect(queue.isWaiting).toBe(false);

    sent[0].reject(new OfflineError());
    await settle();

    expect(queue.isWaiting).toBe(true);
    expect(ids(queue)).toEqual(["a"]);
    expect(results).toEqual([]);
  });

  it("does not try again by itself", async () => {
    vi.useFakeTimers();
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    await vi.advanceTimersByTimeAsync(0);
    sent[0].reject(new OfflineError());

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(sent).toHaveLength(1);
    vi.useRealTimers();
  });

  it("keeps the writes behind it waiting too, so the order is kept", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    queue.add(write(makeEvent("b")));
    await settle();

    sent[0].reject(new OfflineError());
    await settle();

    expect(sent).toHaveLength(1);
    expect(ids(queue)).toEqual(["a", "b"]);
  });

  it("sends the same write again on flush, and then the rest", async () => {
    const { queue, sent, results } = createQueue();
    queue.add(write(makeEvent("a")));
    queue.add(write(makeEvent("b")));
    await settle();
    sent[0].reject(new OfflineError());
    await settle();

    void queue.flush();
    await settle();
    expect(queue.isWaiting).toBe(false);
    expect(sent[1].write.id).toBe("a");

    sent[1].resolve(makeEvent("a"));
    await settle();
    sent[2].resolve(makeEvent("b"));
    await settle();

    expect(results.map(([item]) => item.id)).toEqual(["a", "b"]);
    expect(ids(queue)).toEqual([]);
  });

  it("tries again when the user makes the next edit", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    await settle();
    sent[0].reject(new OfflineError());
    await settle();

    queue.add(write(makeEvent("b")));
    await settle();

    expect(sent.map((call) => call.write.id)).toEqual(["a", "a"]);
  });

  it("replaces the waiting write when the user edits that event again", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a", "First")));
    await settle();
    sent[0].reject(new OfflineError());
    await settle();

    queue.add(write(makeEvent("a", "Second")));
    await settle();

    expect(queue.writes).toHaveLength(1);
    expect(sent[1].write.event?.title).toBe("Second");
  });

  it("does not start a second run when flush is called while it is sending", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    await settle();

    void queue.flush();
    void queue.flush();
    await settle();

    expect(sent).toHaveLength(1);
  });
});

describe("WriteQueue: time limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts a request that takes too long and keeps the write, because the server may have got it", async () => {
    const { queue, sent, results } = createQueue();
    queue.add(write(makeEvent("a")));
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(1000);

    expect(sent[0].signal.aborted).toBe(true);
    expect(queue.isWaiting).toBe(true);
    expect(ids(queue)).toEqual(["a"]);
    expect(results).toEqual([]);
  });
});

describe("WriteQueue: storage", () => {
  it("saves the queue after every change", async () => {
    const { queue, sent, storage } = createQueue();
    queue.add(write(makeEvent("a")));
    queue.add(write(makeEvent("b")));
    expect(storage?.saved().map((item) => item.id)).toEqual(["a", "b"]);

    await settle();
    sent[0].resolve(makeEvent("a"));
    await settle();

    expect(storage?.saved().map((item) => item.id)).toEqual(["b"]);
  });

  it("starts with the writes that were saved on the last visit, and sends them on flush", async () => {
    const saved = JSON.stringify([write(makeEvent("a")), remove("b")]);
    const { queue, sent } = createQueue(createStorage(saved));
    expect(ids(queue)).toEqual(["a", "b"]);
    expect(sent).toHaveLength(0);

    void queue.flush();
    await settle();

    expect(sent[0].write.id).toBe("a");
  });

  it("starts empty when the saved text is broken or is not a list", () => {
    expect(ids(createQueue(createStorage("{not json")).queue)).toEqual([]);
    expect(ids(createQueue(createStorage('{"a":1}')).queue)).toEqual([]);
  });

  it("works in memory when there is no storage", async () => {
    const { queue, sent } = createQueue(null);

    queue.add(write(makeEvent("a")));
    await settle();

    expect(sent).toHaveLength(1);
  });

  it("keeps working when the storage is full", async () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      saved: () => [],
    };
    const { queue, sent } = createQueue(full);

    queue.add(write(makeEvent("a")));
    await settle();

    expect(sent).toHaveLength(1);
  });
});

describe("WriteQueue: stop", () => {
  it("does not abort the request in flight, so that edit still reaches the server", async () => {
    const { queue, sent } = createQueue();
    queue.add(write(makeEvent("a")));
    await settle();

    queue.stop();

    expect(sent[0].signal.aborted).toBe(false);
  });

  it("sends nothing more, and leaves the rest in storage for the next visit", async () => {
    const { queue, sent, storage, onChange } = createQueue();
    queue.add(write(makeEvent("a")));
    queue.add(write(makeEvent("b")));
    await settle();

    queue.stop();
    onChange.mockClear();
    sent[0].resolve(makeEvent("a"));
    await settle();

    expect(sent).toHaveLength(1);
    expect(storage?.saved().map((item) => item.id)).toEqual(["b"]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
