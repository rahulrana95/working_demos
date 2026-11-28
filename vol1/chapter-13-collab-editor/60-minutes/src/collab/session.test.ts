/*
 * NOT PART OF THE INTERVIEW.
 * Tests for the session: what is sent, what is applied, what happens after
 * a time offline, and undo. No test here draws anything.
 */
import { CollabSession } from "./session";
import { createRandom, expectedText, pickIndex } from "./testHelpers";
import { createFakeServer, createTestLink, deliverAll } from "./testNetwork";
import type { TestLink } from "./testNetwork";
import type { ClientMessage, Op } from "./types";

const FLUSH_MS = 50;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the sessions send the edits that wait to be joined. */
function flush(): void {
  vi.advanceTimersByTime(FLUSH_MS);
}

/** Types at the end, one key press for each character, as a user does. */
function typeAtEnd(session: CollabSession, text: string): void {
  for (const char of text) {
    const next = session.doc.text() + char;
    session.edit(next, next.length);
  }
}

/** Types the text at the given place, one key press for each character. */
function typeAt(session: CollabSession, index: number, text: string): void {
  [...text].forEach((char, offset) => {
    const old = session.doc.text();
    const at = index + offset;
    session.edit(old.slice(0, at) + char + old.slice(at), at + 1);
  });
}

function deleteRange(session: CollabSession, from: number, to: number): void {
  const old = session.doc.text();
  session.edit(old.slice(0, from) + old.slice(to), from);
}

function setup(sites: string[]) {
  const server = createFakeServer();
  const links = sites.map((site) => {
    const link = createTestLink(server, new CollabSession({ site, flushMs: FLUSH_MS }));
    link.open();
    return link;
  });
  deliverAll(links);
  /** Sends what waits and delivers everything. */
  const settle = () => {
    flush();
    deliverAll(links);
  };
  return { server, links, settle, sessions: links.map((link) => link.session) };
}

function opsIn(messages: ClientMessage[]): Op[] {
  return messages.flatMap((message) => (message.type === "ops" ? message.ops : []));
}

describe("sending", () => {
  it("says hello with its version vector when the line opens", () => {
    const { links } = setup(["a"]);

    expect(links[0].sentToServer[0]).toEqual({ type: "hello", site: "a", vector: {} });
  });

  it("sends a word that is typed quickly as one operation", () => {
    const { links, sessions } = setup(["a"]);

    typeAtEnd(sessions[0], "hello");
    expect(opsIn(links[0].sentToServer)).toEqual([]);
    flush();

    expect(opsIn(links[0].sentToServer)).toEqual([
      {
        type: "insert",
        id: { site: "a", counter: 1 },
        after: null,
        text: "hello",
        site: "a",
        seq: 1,
      },
    ]);
  });

  it("sends a pasted text as one operation", () => {
    const { links, sessions } = setup(["a"]);

    sessions[0].edit("a whole page", 12);
    flush();

    expect(opsIn(links[0].sentToServer)).toHaveLength(1);
  });

  it("joins a run of Backspace into one delete", () => {
    const { links, sessions, settle } = setup(["a"]);
    typeAtEnd(sessions[0], "hello");
    settle();

    deleteRange(sessions[0], 4, 5);
    deleteRange(sessions[0], 3, 4);
    flush();

    const [, remove] = opsIn(links[0].sentToServer);
    expect(remove).toMatchObject({ type: "delete", seq: 2 });
    expect(remove.type === "delete" && remove.ids.map((id) => id.counter)).toEqual([5, 4]);
  });

  it("does not join typing at two places", () => {
    const { links, sessions } = setup(["a"]);

    typeAtEnd(sessions[0], "ad");
    typeAt(sessions[0], 1, "bc");
    flush();

    expect(opsIn(links[0].sentToServer).map((op) => op.type === "insert" && op.text)).toEqual([
      "ad",
      "bc",
    ]);
  });

  it("does not join a typed character to the run when the caret went back to the start", () => {
    const { links, sessions } = setup(["a"]);

    typeAtEnd(sessions[0], "b");
    typeAt(sessions[0], 0, "a");
    flush();

    expect(opsIn(links[0].sentToServer)).toHaveLength(2);
    expect(sessions[0].doc.text()).toBe("ab");
  });

  it("numbers its operations 1, 2, 3 with no gaps", () => {
    const { links, sessions } = setup(["a"]);

    for (const word of ["one", "two", "three"]) {
      typeAtEnd(sessions[0], word);
      flush();
    }

    expect(opsIn(links[0].sentToServer).map((op) => op.seq)).toEqual([1, 2, 3]);
  });

  it("sends nothing for an event that did not change the text", () => {
    const { links, sessions } = setup(["a"]);

    sessions[0].edit("", 0);
    flush();

    expect(opsIn(links[0].sentToServer)).toEqual([]);
    expect(sessions[0].pendingCount).toBe(0);
  });

  it("sends no operation before the server answered hello, and sends them after", () => {
    const server = createFakeServer();
    const link = createTestLink(server, new CollabSession({ site: "a", flushMs: FLUSH_MS }));
    link.open();

    typeAtEnd(link.session, "hi");
    flush();
    expect(link.toServer.map((message) => message.type)).toEqual(["hello"]);
    deliverAll([link]);

    expect(server.getLog()).toHaveLength(1);
    expect(link.session.pendingCount).toBe(0);
  });

  it("stops its timer on dispose, and sends nothing after", () => {
    const { links, sessions } = setup(["a"]);
    typeAtEnd(sessions[0], "hi");

    sessions[0].dispose();
    flush();

    expect(opsIn(links[0].sentToServer)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("acknowledgements", () => {
  it("keeps an operation until the server acknowledges it", () => {
    const { links, sessions } = setup(["a"]);

    typeAtEnd(sessions[0], "hi");
    expect(sessions[0].pendingCount).toBe(1);
    flush();
    links[0].deliverToServer();
    expect(sessions[0].pendingCount).toBe(1);
    links[0].deliverToClient();

    expect(links[0].sentToClient[links[0].sentToClient.length - 1]).toEqual({
      type: "ack",
      seq: 1,
    });
    expect(sessions[0].pendingCount).toBe(0);
  });

  it("sends again, after a reconnect, an operation that was lost on the way", () => {
    const { server, links, sessions } = setup(["a"]);
    typeAtEnd(sessions[0], "hi");
    flush();

    links[0].close(); // The operation was on its way. It is lost.
    expect(server.getLog()).toHaveLength(0);
    links[0].open();
    deliverAll(links);

    expect(server.getLog()).toHaveLength(1);
    expect(sessions[0].pendingCount).toBe(0);
  });

  it("does not send again an operation that arrived when only its acknowledgement was lost", () => {
    const { server, links, sessions } = setup(["a"]);
    typeAtEnd(sessions[0], "hi");
    flush();
    links[0].deliverToServer(); // The server has it. The ack is on its way.

    links[0].close();
    links[0].open();
    deliverAll(links);

    const sentAfterReconnect = links[0].sentToServer.slice(3);
    expect(sentAfterReconnect).toEqual([]);
    expect(links[0].sentToClient[links[0].sentToClient.length - 1]).toEqual({
      type: "sync",
      ack: 1,
      ops: [],
    });
    expect(server.getLog()).toHaveLength(1);
    expect(sessions[0].pendingCount).toBe(0);
  });
});

describe("receiving", () => {
  it("shows what another site typed", () => {
    const { sessions, settle } = setup(["a", "b"]);

    typeAtEnd(sessions[0], "hello");
    settle();

    expect(sessions[1].doc.text()).toBe("hello");
  });

  it("applies an operation once when it arrives twice", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "hi");
    settle();
    const [op] = opsIn(links[0].sentToServer);
    typeAtEnd(sessions[1], "!");
    const before = sessions[1].doc.text();

    sessions[1].receive({ type: "ops", ops: [op, op] });

    expect(sessions[1].doc.text()).toBe(before);
    expect(sessions[1].doc.ids()).toHaveLength(3);
  });

  it("applies nothing twice when the answer to hello arrives twice", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "hello");
    settle();
    links[1].close();
    typeAtEnd(sessions[0], " world");
    typeAtEnd(sessions[1], "!");
    settle();
    links[1].open();
    links[1].deliverToServer();
    const sync = links[1].toClient[0];

    sessions[1].receive(sync);
    sessions[1].receive(sync);
    settle();

    expect(sessions[1].doc.text()).toBe(sessions[0].doc.text());
    expect(sessions[1].doc.ids()).toHaveLength(12);
    const keys = opsIn(links[1].sentToServer).map((op) => op.seq);
    expect(new Set(keys).size).toBe(1); // The same operation, sent again: the server stores it once.
  });

  it("asks the server again when a number is missing, and applies nothing out of order", () => {
    const { links, sessions } = setup(["a", "b"]);
    const [a, b] = sessions;
    typeAtEnd(a, "one");
    flush();
    typeAtEnd(a, " two");
    flush();
    links[0].deliverToServer();
    links[0].deliverToServer();
    const second = opsIn(links[0].sentToServer)[1];
    links[1].toClient.length = 0; // Both messages for b are lost.

    b.receive({ type: "ops", ops: [second] });

    expect(b.doc.text()).toBe("");
    expect(links[1].toServer).toEqual([{ type: "hello", site: "b", vector: {} }]);
    deliverAll(links);
    expect(b.doc.text()).toBe("one two");
  });

  it("ignores a message that arrives after the line was closed", () => {
    const { links, sessions } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "hi");
    flush();
    links[0].deliverToServer();
    const [late] = links[1].toClient;

    links[1].close();
    sessions[1].receive(late);

    expect(sessions[1].doc.text()).toBe("");
  });

  it("tells its listeners about every change, and stops when asked", () => {
    const { sessions, settle } = setup(["a", "b"]);
    const listener = vi.fn();
    const stop = sessions[1].subscribe(listener);
    const versionBefore = sessions[1].version();

    typeAtEnd(sessions[0], "hi");
    settle();
    expect(listener).toHaveBeenCalled();
    expect(sessions[1].version()).toBeGreaterThan(versionBefore);
    listener.mockClear();
    stop();
    typeAtEnd(sessions[0], "!");
    settle();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("offline and back", () => {
  it("knows whether the line is open", () => {
    const { links, sessions } = setup(["a"]);

    expect(sessions[0].isOnline).toBe(true);
    links[0].close();

    expect(sessions[0].isOnline).toBe(false);
  });

  it("keeps edits made offline, and sends them when the line is back", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    links[0].close();

    typeAtEnd(sessions[0], "written on the train");
    flush();
    expect(sessions[0].pendingCount).toBe(1);
    links[0].open();
    settle();

    expect(sessions[1].doc.text()).toBe("written on the train");
    expect(sessions[0].pendingCount).toBe(0);
  });

  it("receives exactly the operations it missed, not the whole log", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "one");
    settle();
    links[1].close();
    typeAtEnd(sessions[0], " two");
    settle();
    typeAtEnd(sessions[0], " three");
    settle();

    links[1].open();
    expect(links[1].toServer).toEqual([{ type: "hello", site: "b", vector: { a: 1 } }]);
    deliverAll(links);

    const sync = links[1].sentToClient[links[1].sentToClient.length - 1];
    expect(sync.type === "sync" && sync.ops.map((op) => op.seq)).toEqual([2, 3]);
    expect(sessions[1].doc.text()).toBe("one two three");
  });

  it("does not get its own operations back", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "mine");
    settle();

    links[0].close();
    links[0].open();
    deliverAll(links);

    const sync = links[0].sentToClient[links[0].sentToClient.length - 1];
    expect(sync).toEqual({ type: "sync", ack: 1, ops: [] });
  });

  it("merges a long offline session on both sides", () => {
    const { server, links, sessions, settle } = setup(["a", "b"]);
    const [a, b] = sessions;
    typeAtEnd(a, "The meeting is on Monday.");
    settle();
    links.forEach((link) => link.close());
    const random = createRandom(13);

    // 300 changes on each side, with no network at all.
    for (let step = 0; step < 300; step += 1) {
      for (const session of [a, b]) {
        const length = session.doc.text().length;
        if (length > 5 && random() < 0.3) {
          const from = pickIndex(random, length - 2);
          deleteRange(session, from, from + 1 + pickIndex(random, 2));
        } else {
          typeAt(session, pickIndex(random, length + 1), session.site + step);
        }
        if (random() < 0.2) {
          flush();
        }
      }
    }
    expect(a.doc.text()).not.toBe(b.doc.text());
    links[1].open();
    links[0].open();
    settle();

    expect(a.doc.text()).toBe(b.doc.text());
    expect(a.doc.text()).toBe(expectedText(server.getLog()));
    expect(a.pendingCount + b.pendingCount).toBe(0);
    expect(a.doc.waitingCount + b.doc.waitingCount).toBe(0);
  });

  it("stores each operation once in the server log, whatever was sent twice", () => {
    const { server, links, sessions, settle } = setup(["a", "b"]);
    for (let round = 0; round < 5; round += 1) {
      typeAtEnd(sessions[0], `a${round}`);
      flush();
      links[0].deliverToServer(); // Arrives. Then the line drops before the ack.
      links[0].close();
      typeAtEnd(sessions[0], "+");
      links[0].open();
      settle();
    }

    const keys = server.getLog().map((op) => `${op.site}:${op.seq}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(sessions[1].doc.text()).toBe(sessions[0].doc.text());
    expect(sessions[0].doc.text()).toBe("a0+a1+a2+a3+a4+");
  });
});

describe("undo", () => {
  it("takes back the last typed character, here and for the others", () => {
    const { sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "hi");
    settle();

    sessions[0].undo();
    settle();

    expect(sessions[0].doc.text()).toBe("h");
    expect(sessions[1].doc.text()).toBe("h");
  });

  it("takes back a paste as a whole", () => {
    const { sessions } = setup(["a"]);
    sessions[0].edit("first ", 6);
    sessions[0].edit("first pasted text", 17);

    sessions[0].undo();

    expect(sessions[0].doc.text()).toBe("first ");
  });

  it("puts a deleted text back at the same place", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("big red bus", 11);
    deleteRange(sessions[0], 4, 8);
    settle();
    expect(sessions[1].doc.text()).toBe("big bus");

    sessions[0].undo();
    settle();

    expect(sessions[0].doc.text()).toBe("big red bus");
    expect(sessions[1].doc.text()).toBe("big red bus");
  });

  it("takes back a replaced selection in one step", () => {
    const { sessions } = setup(["a"]);
    sessions[0].edit("hello world", 11);
    sessions[0].edit("hello you", 9);

    sessions[0].undo();

    expect(sessions[0].doc.text()).toBe("hello world");
  });

  it("leaves the edits of another person alone", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("hello", 5);
    settle();
    sessions[1].edit("hello world", 11);
    settle();

    sessions[0].undo();
    settle();

    expect(sessions[0].doc.text()).toBe(" world");
    expect(sessions[1].doc.text()).toBe(" world");
  });

  it("does not take back the edit of another person, even when that one is newer", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("mine", 4);
    settle();
    sessions[1].edit("mine theirs", 11);
    settle();

    sessions[0].undo();
    sessions[0].undo(); // Nothing of a is left to take back.
    settle();

    expect(sessions[1].doc.text()).toBe(" theirs");
  });

  it("puts a deleted character back after what another person typed in front of it", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("ab", 2);
    settle();
    deleteRange(sessions[0], 1, 2); // "a"
    sessions[1].edit("aXb", 2); // b does not know about the delete yet.
    settle();
    expect(sessions[0].doc.text()).toBe("aX");

    sessions[0].undo();
    settle();

    expect(sessions[0].doc.text()).toBe("aXb");
    expect(sessions[1].doc.text()).toBe("aXb");
  });

  it("puts a deleted text back at the start when everything on its left is gone", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("abc", 3);
    settle();
    deleteRange(sessions[0], 1, 3); // "a"
    settle();
    deleteRange(sessions[1], 0, 1); // ""
    settle();

    sessions[0].undo();
    settle();

    expect(sessions[0].doc.text()).toBe("bc");
    expect(sessions[1].doc.text()).toBe("bc");
  });

  it("does nothing when there is nothing to take back", () => {
    const { links, sessions } = setup(["a"]);

    sessions[0].undo();
    flush();

    expect(opsIn(links[0].sentToServer)).toEqual([]);
  });

  it("remembers the last 100 changes, not more", () => {
    const { sessions } = setup(["a"]);
    typeAtEnd(sessions[0], "x".repeat(130));

    for (let step = 0; step < 200; step += 1) {
      sessions[0].undo();
    }

    expect(sessions[0].doc.text()).toBe("x".repeat(30));
  });

  it("works offline, and the others get the result later", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("keep this", 9);
    settle();
    links[0].close();
    sessions[0].edit("keep this, not this", 19);

    sessions[0].undo();
    links[0].open();
    settle();

    expect(sessions[1].doc.text()).toBe("keep this");
  });
});

describe("the selection", () => {
  it("is 0 to 0 at the start", () => {
    const { sessions } = setup(["a"]);

    expect(sessions[0].selection()).toEqual({ start: 0, end: 0 });
  });

  it("stays on the same characters when another person types before it", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("one two three", 13);
    settle();
    sessions[1].setSelection(4, 7); // "two"

    typeAt(sessions[0], 0, ">> ");
    settle();

    const { start, end } = sessions[1].selection();
    expect(sessions[1].doc.text().slice(start, end)).toBe("two");
  });

  it("stays in place when the character on its left is deleted", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("abcd", 4);
    settle();
    sessions[1].setSelection(2, 2); // ab|cd

    deleteRange(sessions[0], 1, 2);
    settle();

    expect(sessions[1].selection()).toEqual({ start: 1, end: 1 }); // a|cd
  });
});

describe("random sessions with a bad network (seeded, so a failure can be repeated)", () => {
  /**
   * Three people type, delete and undo. Lines open and close at any moment,
   * and lose what was on its way. Messages of one line keep their order,
   * but the lines move at different speeds.
   */
  function runRandomSession(seed: number, steps: number) {
    const random = createRandom(seed);
    const { server, links, settle } = setup(["a", "b", "c"]);

    const act = (link: TestLink) => {
      const session = link.session;
      const length = session.doc.text().length;
      const dice = random();
      if (dice < 0.3) {
        typeAt(session, pickIndex(random, length + 1), "abcdefgh".slice(pickIndex(random, 8)));
      } else if (dice < 0.4 && length > 0) {
        const from = pickIndex(random, length);
        deleteRange(session, from, Math.min(length, from + 1 + pickIndex(random, 3)));
      } else if (dice < 0.45) {
        session.undo();
      } else if (dice < 0.5) {
        flush();
      } else if (dice < 0.55) {
        if (link.isOpen()) {
          link.close();
        } else {
          link.open();
        }
      } else if (dice < 0.8) {
        link.deliverToServer();
      } else {
        link.deliverToClient();
      }
    };

    for (let step = 0; step < steps; step += 1) {
      act(links[pickIndex(random, links.length)]);
    }
    links.filter((link) => !link.isOpen()).forEach((link) => link.open());
    settle();
    return { server, sessions: links.map((link) => link.session) };
  }

  it("400 steps: the three people end with the same text (40 seeds)", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { server, sessions } = runRandomSession(seed, 400);
      const expected = expectedText(server.getLog());

      for (const session of sessions) {
        if (session.doc.text() !== expected || session.doc.waitingCount !== 0) {
          throw new Error(`seed ${seed}: ${session.site} has "${session.doc.text()}"`);
        }
        expect(session.pendingCount).toBe(0);
      }
    }
  });

  it("the server log holds every operation once, in the order 1, 2, 3 for each site", () => {
    const { server } = runRandomSession(7, 1500);
    const next: Record<string, number> = {};

    expect(server.getLog().length).toBeGreaterThan(100);
    for (const op of server.getLog()) {
      expect(op.seq).toBe((next[op.site] ?? 0) + 1);
      next[op.site] = op.seq;
    }
  });
});
