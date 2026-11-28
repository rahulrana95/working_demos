/* NOT PART OF THE INTERVIEW: production version. Tests for the OT server of the demo. */
import type { OtClientMessage, OtServerMessage } from "../collab";
import { createOtServer } from "./otServer";

function connect(server: ReturnType<typeof createOtServer>, site: string) {
  const received: OtServerMessage[] = [];
  const connection = server.connect(site, (message) => received.push(message));
  connection.send({ type: "hello", site, revision: 0 });
  return { connection, received };
}

function submit(site: string, id: number, revision: number, pos: number, text: string) {
  const message: OtClientMessage = {
    type: "submit",
    site,
    id,
    revision,
    ops: [{ type: "insert", pos, text }],
  };
  return message;
}

describe("OT server", () => {
  it("gives every submit the next revision, and sends the entry to everybody, the sender too", () => {
    const server = createOtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");

    a.connection.send(submit("a", 1, 0, 0, "x"));

    const entry = { site: "a", id: 1, revision: 1, ops: [{ type: "insert", pos: 0, text: "x" }] };
    expect(a.received[1]).toEqual({ type: "entry", entry });
    expect(b.received[1]).toEqual({ type: "entry", entry });
  });

  it("transforms a submit against the entries its site had not seen", () => {
    const server = createOtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");
    a.connection.send(submit("a", 1, 0, 0, "abc"));

    b.connection.send(submit("b", 1, 0, 0, "X")); // b had not seen "abc".

    expect(server.getHistory()[1].ops).toEqual([{ type: "insert", pos: 3, text: "X" }]);
  });

  it("answers hello with the entries after the revision of the site", () => {
    const server = createOtServer();
    const a = connect(server, "a");
    a.connection.send(submit("a", 1, 0, 0, "x"));
    a.connection.send(submit("a", 2, 1, 1, "y"));
    const received: OtServerMessage[] = [];

    server
      .connect("b", (message) => received.push(message))
      .send({
        type: "hello",
        site: "b",
        revision: 1,
      });

    expect(received).toEqual([{ type: "sync", entries: [server.getHistory()[1]] }]);
  });

  it("does not store a submit twice, or one that skips a number or names a revision that is not there", () => {
    const server = createOtServer();
    const a = connect(server, "a");
    a.connection.send(submit("a", 1, 0, 0, "x"));

    a.connection.send(submit("a", 1, 0, 0, "x"));
    a.connection.send(submit("a", 3, 1, 0, "y"));
    a.connection.send(submit("a", 2, 9, 0, "z"));

    expect(server.getHistory()).toHaveLength(1);
  });

  it("sends nothing on a closed line, and takes nothing from it", () => {
    const server = createOtServer();
    const a = connect(server, "a");
    const b = connect(server, "b");

    b.connection.close();
    a.connection.send(submit("a", 1, 0, 0, "x"));
    b.connection.send(submit("b", 1, 0, 0, "y"));

    expect(b.received).toHaveLength(1);
    expect(server.getHistory()).toHaveLength(1);
  });
});
