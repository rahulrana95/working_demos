/* NOT PART OF THE INTERVIEW: production version. Tests for the CRDT server of the demo. */
import type { Id, Op, ServerMessage, VersionVector } from "../collab";
import { createCrdtServer } from "./crdtServer";

function op(site: string, seq: number): Op {
  return { type: "insert", id: { site, counter: seq }, after: null, text: "x", site, seq };
}

function connect(server: ReturnType<typeof createCrdtServer>, site: string) {
  const received: ServerMessage[] = [];
  const connection = server.connect(site, (message) => received.push(message));
  return { connection, received };
}

describe("CRDT server: relay", () => {
  it("answers hello with what the site misses and the last number it has of that site", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    a.connection.send({ type: "ops", ops: [op("a", 1), op("a", 2)] });
    const b = connect(server, "b");

    b.connection.send({ type: "hello", site: "b", vector: { a: 1 } });

    expect(b.received).toEqual([{ type: "sync", ack: 0, ops: [op("a", 2)] }]);
  });

  it("acknowledges, and passes new operations on to the others, not to the sender", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    b.connection.send({ type: "hello", site: "b", vector: {} });

    a.connection.send({ type: "ops", ops: [op("a", 1)] });

    expect(a.received[1]).toEqual({ type: "ack", seq: 1 });
    expect(a.received).toHaveLength(2);
    expect(b.received[1]).toEqual({ type: "ops", ops: [op("a", 1)] });
  });

  it("stores an operation once when it is sent twice, and acknowledges both times", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    b.connection.send({ type: "hello", site: "b", vector: {} });

    a.connection.send({ type: "ops", ops: [op("a", 1)] });
    a.connection.send({ type: "ops", ops: [op("a", 1)] });

    expect(server.getLog()).toEqual([op("a", 1)]);
    expect(a.received.filter((message) => message.type === "ack")).toHaveLength(2);
    expect(b.received.filter((message) => message.type === "ops")).toHaveLength(1);
  });

  it("does not store an operation that skips a number, or that names another site", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    a.connection.send({ type: "hello", site: "a", vector: {} });

    a.connection.send({ type: "ops", ops: [op("a", 2), op("b", 1)] });

    expect(server.getLog()).toEqual([]);
    expect(a.received[1]).toEqual({ type: "ack", seq: 0 });
  });

  it("sends new operations only to sites that have said hello", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });

    a.connection.send({ type: "ops", ops: [op("a", 1)] });

    expect(b.received).toEqual([]);
  });

  it("sends nothing on a closed line, and takes nothing from it", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    b.connection.send({ type: "hello", site: "b", vector: {} });

    b.connection.close();
    a.connection.send({ type: "ops", ops: [op("a", 1)] });
    b.connection.send({ type: "ops", ops: [op("b", 1)] });

    expect(b.received).toHaveLength(1);
    expect(server.getLog()).toEqual([op("a", 1)]);
    expect(a.received).toContainEqual({ type: "left", site: "b" });
  });
});

describe("CRDT server: carets", () => {
  it("passes a caret on to the others, under the site of the line it came on", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    b.connection.send({ type: "hello", site: "b", vector: {} });

    b.connection.send({
      type: "presence",
      presence: { site: "a", name: "Ravi", start: null, end: null },
    });

    const presence = { site: "b", name: "Ravi", start: null, end: null };
    expect(a.received).toContainEqual({ type: "presence", presence });
    expect(b.received.some((message) => message.type === "presence")).toBe(false);
  });

  it("tells a site that arrives later where the others are, and forgets a site that left", () => {
    const server = createCrdtServer();
    const a = connect(server, "a");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    a.connection.send({
      type: "presence",
      presence: { site: "a", name: "Asha", start: null, end: null },
    });
    const b = connect(server, "b");

    b.connection.send({ type: "hello", site: "b", vector: {} });
    a.connection.close();
    const c = connect(server, "c");
    c.connection.send({ type: "hello", site: "c", vector: {} });

    expect(b.received.filter((message) => message.type === "presence")).toHaveLength(1);
    expect(b.received).toContainEqual({ type: "left", site: "a" });
    expect(c.received.some((message) => message.type === "presence")).toBe(false);
  });
});

describe("CRDT server: which tombstones can go", () => {
  const id = (site: string, counter: number): Id => ({ site, counter });
  const remove = (site: string, seq: number, ids: Id[]): Op => ({ type: "delete", ids, site, seq });
  const seen = (site: string, vector: VersionVector) =>
    ({ type: "seen", digest: { site, vector, hash: 0 } }) as const;
  const collected = (received: ServerMessage[]) =>
    received.flatMap((message) => (message.type === "collect" ? message.ids : []));

  /** Two sites. a has typed one character and deleted it. */
  function setup() {
    const server = createCrdtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    b.connection.send({ type: "hello", site: "b", vector: {} });
    a.connection.send({ type: "ops", ops: [op("a", 1), remove("a", 2, [id("a", 1)])] });
    return { server, a, b };
  }

  it("releases a tombstone when every site says it has seen the whole log", () => {
    const { server, a, b } = setup();

    b.connection.send(seen("b", { a: 2 }));

    expect(collected(a.received)).toEqual([id("a", 1)]);
    expect(collected(b.received)).toEqual([id("a", 1)]);
    expect(server.getCollectedCount()).toBe(1);
  });

  it("does not release it while a site has not seen the delete", () => {
    const { server, b } = setup();

    b.connection.send(seen("b", { a: 1 }));

    expect(server.getCollectedCount()).toBe(0);
  });

  it("does not count what a site says in hello: it may still hold edits it has not sent", () => {
    const { server, b } = setup();

    b.connection.close();
    const again = connect(server, "b");
    again.connection.send({ type: "hello", site: "b", vector: { a: 2 } });

    expect(server.getCollectedCount()).toBe(0);
  });

  it("waits for a site that is away, also after the others have seen everything", () => {
    const { server, a, b } = setup();
    const c = connect(server, "c");
    c.connection.send({ type: "hello", site: "c", vector: {} });
    c.connection.close();

    b.connection.send(seen("b", { a: 2 }));
    a.connection.send(seen("a", { a: 2 }));

    expect(server.getCollectedCount()).toBe(0);
  });

  it("waits a second step when the log grew after every site had seen the delete", () => {
    const { server, a, b } = setup();
    // b has seen the delete, and sent one edit of its own before it said so.
    b.connection.send({ type: "ops", ops: [op("b", 1)] });
    b.connection.send(seen("b", { a: 2, b: 1 }));
    // Every site has seen the delete now, but a has not seen the edit of b.
    expect(server.getCollectedCount()).toBe(0);

    a.connection.send(seen("a", { a: 2, b: 1 }));

    expect(server.getCollectedCount()).toBe(1);
  });

  it("releases each tombstone once", () => {
    const { server, a, b } = setup();
    b.connection.send(seen("b", { a: 2 }));

    b.connection.send(seen("b", { a: 2 }));
    a.connection.send(seen("a", { a: 2 }));

    expect(collected(a.received)).toEqual([id("a", 1)]);
    expect(server.getCollectedCount()).toBe(1);
  });

  it("passes what a site has seen on to the others, to compare hashes", () => {
    const { a, b } = setup();

    b.connection.send({ type: "seen", digest: { site: "a", vector: { a: 2 }, hash: 77 } });

    const digest = { site: "b", vector: { a: 2 }, hash: 77 };
    expect(a.received).toContainEqual({ type: "digest", digest });
  });
});
