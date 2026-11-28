/* NOT PART OF THE INTERVIEW. Tests of the lock that two tabs share. */
import { withSendLock } from "./sendLock";

/** A small copy of the Web Locks API: one holder for a name, the others wait in a queue. */
function createFakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const requested: string[] = [];
  const locks = {
    request(name: string, options: { signal: AbortSignal }, task: () => Promise<unknown>) {
      requested.push(name);
      const before = queues.get(name) ?? Promise.resolve();
      const result = before
        .catch(() => {})
        .then(() => {
          if (options.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          return task();
        });
      queues.set(name, result);
      return result;
    },
  };
  return { locks, requested };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("withSendLock", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("runs the task directly when the browser has no Web Locks", async () => {
    vi.stubGlobal("navigator", {});

    await expect(withSendLock("a", new AbortController().signal, async () => "done")).resolves.toBe(
      "done",
    );
  });

  it("asks for a lock that is named after the message", async () => {
    const { locks, requested } = createFakeLocks();
    vi.stubGlobal("navigator", { locks });

    await withSendLock("a1", new AbortController().signal, async () => "done");

    expect(requested).toEqual(["chat-send:a1"]);
  });

  it("makes a second tab wait until the first one is done with the same message", async () => {
    const { locks } = createFakeLocks();
    vi.stubGlobal("navigator", { locks });
    const order: string[] = [];
    let finishFirst = () => {};
    const first = withSendLock("a", new AbortController().signal, async () => {
      order.push("first starts");
      await new Promise<void>((resolve) => (finishFirst = resolve));
      order.push("first ends");
    });
    const second = withSendLock("a", new AbortController().signal, async () => {
      order.push("second starts");
    });

    await flush();
    expect(order).toEqual(["first starts"]);

    finishFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first starts", "first ends", "second starts"]);
  });

  it("does not make two different messages wait for each other", async () => {
    const { locks } = createFakeLocks();
    vi.stubGlobal("navigator", { locks });
    const order: string[] = [];
    withSendLock(
      "a",
      new AbortController().signal,
      () => new Promise(() => order.push("a starts")),
    );
    await withSendLock("b", new AbortController().signal, async () => void order.push("b starts"));

    expect(order).toEqual(["a starts", "b starts"]);
  });

  it("gives the lock to the next tab when the task of the first one fails", async () => {
    const { locks } = createFakeLocks();
    vi.stubGlobal("navigator", { locks });

    const first = withSendLock("a", new AbortController().signal, async () => {
      throw new Error("500");
    });
    const second = withSendLock("a", new AbortController().signal, async () => "sent");

    await expect(first).rejects.toThrow("500");
    await expect(second).resolves.toBe("sent");
  });

  it("rejects, and never runs the task, when it is aborted while it waits", async () => {
    const { locks } = createFakeLocks();
    vi.stubGlobal("navigator", { locks });
    let finishFirst = () => {};
    const first = withSendLock(
      "a",
      new AbortController().signal,
      () => new Promise<void>((resolve) => (finishFirst = resolve)),
    );
    const controller = new AbortController();
    const task = vi.fn(async () => "sent");
    const second = withSendLock("a", controller.signal, task);
    await flush();

    controller.abort();
    finishFirst();
    await first;

    await expect(second).rejects.toThrow("Aborted");
    expect(task).not.toHaveBeenCalled();
  });
});
