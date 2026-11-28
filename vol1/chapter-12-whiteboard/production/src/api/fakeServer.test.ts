/* NOT PART OF THE INTERVIEW. Tests for the fake server of the demo. */
import type { Operation } from "../whiteboard";
import { createFakeServer } from "./fakeServer";
import type { ServerHandlers } from "./fakeServer";

function operation(id: string): Operation {
  return { id, userId: id.split("-")[0], command: { type: "remove", id: "nothing" } };
}

function createClient() {
  const received: string[] = [];
  const left: string[] = [];
  const handlers: ServerHandlers = {
    onOperation: (seq, incoming) => received.push(`${seq}:${incoming.id}`),
    onPresence: (presence) => received.push(`presence:${presence.userId}`),
    onPeerLeft: (userId) => left.push(userId),
  };
  return { received, left, handlers };
}

describe("the fake server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("numbers the operations in the order it takes them, and sends each to everyone", () => {
    const server = createFakeServer({ delayMs: () => 10 });
    const a = createClient();
    const b = createClient();
    const fromA = server.connect("a", 0, a.handlers);
    const fromB = server.connect("b", 0, b.handlers);

    fromA.send(operation("a-1"));
    fromB.send(operation("b-1"));
    vi.advanceTimersByTime(100);

    expect(a.received).toEqual(["1:a-1", "2:b-1"]);
    expect(b.received).toEqual(["1:a-1", "2:b-1"]);
  });

  it("delivers in order even when a later message gets a shorter delay", () => {
    const delays = [5, 300, 5, 300, 5, 5, 5];
    const server = createFakeServer({ delayMs: () => delays.shift() ?? 5 });
    const a = createClient();
    const fromA = server.connect("a", 0, a.handlers);

    fromA.send(operation("a-1"));
    vi.advanceTimersByTime(6);
    fromA.send(operation("a-2"));
    vi.advanceTimersByTime(1000);

    expect(a.received).toEqual(["1:a-1", "2:a-2"]);
  });

  it("keeps the order for 200 operations with random delays", () => {
    let seed = 3;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const server = createFakeServer({ delayMs: () => random() * 40 });
    const a = createClient();
    const b = createClient();
    const fromA = server.connect("a", 0, a.handlers);
    server.connect("b", 0, b.handlers);

    for (let count = 1; count <= 200; count++) {
      fromA.send(operation(`a-${count}`));
      vi.advanceTimersByTime(Math.floor(random() * 5));
    }
    vi.advanceTimersByTime(20_000);

    const numbers = (received: string[]) => received.map((entry) => Number(entry.split(":")[0]));
    const inOrder = Array.from({ length: 200 }, (_unused, index) => index + 1);
    expect(numbers(a.received)).toEqual(inOrder);
    expect(numbers(b.received)).toEqual(inOrder);
  });

  it("takes an operation it has seen only once, however often it is sent", () => {
    const server = createFakeServer({ delayMs: () => 10 });
    const a = createClient();
    const fromA = server.connect("a", 0, a.handlers);

    fromA.send(operation("a-1"));
    fromA.send(operation("a-1"));
    vi.advanceTimersByTime(100);
    fromA.send(operation("a-1"));
    vi.advanceTimersByTime(100);

    expect(server.getLog().map((entry) => entry.id)).toEqual(["a-1"]);
    expect(a.received).toEqual(["1:a-1"]);
  });

  it("sends a client that connects later everything after the number it has", () => {
    const server = createFakeServer({ delayMs: () => 10 });
    const fromA = server.connect("a", 0, createClient().handlers);
    fromA.send(operation("a-1"));
    fromA.send(operation("a-2"));
    fromA.send(operation("a-3"));
    vi.advanceTimersByTime(100);

    const late = createClient();
    server.connect("b", 1, late.handlers);
    vi.advanceTimersByTime(100);

    expect(late.received).toEqual(["2:a-2", "3:a-3"]);
  });

  it("delivers nothing to a client that has closed, and tells the others it left", () => {
    const server = createFakeServer({ delayMs: () => 10 });
    const a = createClient();
    const b = createClient();
    const fromA = server.connect("a", 0, a.handlers);
    const fromB = server.connect("b", 0, b.handlers);

    fromB.send(operation("b-1"));
    fromA.close();
    vi.advanceTimersByTime(100);

    expect(a.received).toEqual([]);
    expect(b.received).toEqual(["1:b-1"]);
    expect(b.left).toEqual(["a"]);
  });

  it("still takes an operation that was sent just before the connection closed", () => {
    const server = createFakeServer({ delayMs: () => 10 });
    const fromA = server.connect("a", 0, createClient().handlers);

    fromA.send(operation("a-1"));
    fromA.close();
    vi.advanceTimersByTime(100);

    expect(server.getLog().map((entry) => entry.id)).toEqual(["a-1"]);
  });

  it("sends presence to the others and not back to the sender", () => {
    const server = createFakeServer({ delayMs: () => 10 });
    const a = createClient();
    const b = createClient();
    const fromA = server.connect("a", 0, a.handlers);
    server.connect("b", 0, b.handlers);

    fromA.sendPresence({
      userId: "a",
      name: "Asha",
      colour: "red",
      cursor: null,
      selectedId: null,
    });
    vi.advanceTimersByTime(100);

    expect(a.received).toEqual([]);
    expect(b.received).toEqual(["presence:a"]);
  });
});
