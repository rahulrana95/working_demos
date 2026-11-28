/* NOT PART OF THE INTERVIEW. Tests for the fake server of the demo. */
import type { Op, ServerMessage } from "../collab";
import { createFakeServer } from "./fakeServer";

function op(site: string, seq: number): Op {
  return { type: "insert", id: { site, counter: seq }, after: null, text: "x", site, seq };
}

function connect(server: ReturnType<typeof createFakeServer>, site: string) {
  const received: ServerMessage[] = [];
  const connection = server.connect(site, (message) => received.push(message));
  return { connection, received };
}

describe("fake server", () => {
  it("answers hello with what the site misses and the last number it has of that site", () => {
    const server = createFakeServer();
    const a = connect(server, "a");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    a.connection.send({ type: "ops", ops: [op("a", 1), op("a", 2)] });
    const b = connect(server, "b");

    b.connection.send({ type: "hello", site: "b", vector: { a: 1 } });

    expect(b.received).toEqual([{ type: "sync", ack: 0, ops: [op("a", 2)] }]);
  });

  it("acknowledges, and passes new operations on to the others, not to the sender", () => {
    const server = createFakeServer();
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
    const server = createFakeServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    b.connection.send({ type: "hello", site: "b", vector: {} });

    a.connection.send({ type: "ops", ops: [op("a", 1)] });
    a.connection.send({ type: "ops", ops: [op("a", 1)] });

    expect(server.getLog()).toEqual([op("a", 1)]);
    expect(a.received.filter((message) => message.type === "ack")).toHaveLength(2);
    expect(b.received).toHaveLength(2);
  });

  it("does not store an operation that skips a number, or that names another site", () => {
    const server = createFakeServer();
    const a = connect(server, "a");
    a.connection.send({ type: "hello", site: "a", vector: {} });

    a.connection.send({ type: "ops", ops: [op("a", 2), op("b", 1)] });

    expect(server.getLog()).toEqual([]);
    expect(a.received[1]).toEqual({ type: "ack", seq: 0 });
  });

  it("sends new operations only to sites that have said hello", () => {
    const server = createFakeServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });

    a.connection.send({ type: "ops", ops: [op("a", 1)] });

    expect(b.received).toEqual([]);
  });

  it("sends nothing on a closed line, and takes nothing from it", () => {
    const server = createFakeServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send({ type: "hello", site: "a", vector: {} });
    b.connection.send({ type: "hello", site: "b", vector: {} });

    b.connection.close();
    a.connection.send({ type: "ops", ops: [op("a", 1)] });
    b.connection.send({ type: "ops", ops: [op("b", 1)] });

    expect(b.received).toHaveLength(1);
    expect(server.getLog()).toEqual([op("a", 1)]);
  });
});
