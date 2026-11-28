/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tests for the CRDT engine: what is sent, what is applied, what happens
 * after a time offline, undo, and everything the first week adds. No test
 * here draws anything.
 */
import { CrdtEngine } from "./crdtEngine";
import { createRandom, expectedText, pickIndex } from "./testHelpers";
import { createCrdtServer } from "../../server/crdtServer";
import { createTestLink, deliverAll } from "../testNetwork";
import type { TestLink } from "../testNetwork";
import type { CollabEvent, EngineOptions } from "../engine";
import type { ClientMessage, Op, ServerMessage } from "./types";

type CrdtLink = TestLink<CrdtEngine, ClientMessage, ServerMessage>;

const FLUSH_MS = 50;

beforeEach(() => {
  // `performance` too, so the test can say how long a sync took.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the sessions send the edits that wait to be joined. */
function flush(): void {
  vi.advanceTimersByTime(FLUSH_MS);
}

/** Types at the end, one key press for each character, as a user does. */
function typeAtEnd(session: CrdtEngine, text: string): void {
  for (const char of text) {
    const next = session.doc.text() + char;
    session.edit(next, next.length);
  }
}

/** Types the text at the given place, one key press for each character. */
function typeAt(session: CrdtEngine, index: number, text: string): void {
  [...text].forEach((char, offset) => {
    const old = session.doc.text();
    const at = index + offset;
    session.edit(old.slice(0, at) + char + old.slice(at), at + 1);
  });
}

function deleteRange(session: CrdtEngine, from: number, to: number): void {
  const old = session.doc.text();
  session.edit(old.slice(0, from) + old.slice(to), from);
}

/** Lets every site say what it has seen, a few times over, until nothing moves. */
function quiet(links: CrdtLink[]): void {
  for (let round = 0; round < 4; round += 1) {
    vi.advanceTimersByTime(1000);
    deliverAll(links);
  }
}

function setup(sites: string[], options: Partial<EngineOptions> = {}) {
  const server = createCrdtServer();
  const links = sites.map((site) => {
    const link = createTestLink(
      server,
      new CrdtEngine({ site, name: site.toUpperCase(), flushMs: FLUSH_MS, ...options }),
    );
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

/** The last message of one kind. */
function lastOf<T extends ServerMessage["type"]>(messages: ServerMessage[], type: T) {
  const matches = (message: ServerMessage): message is Extract<ServerMessage, { type: T }> =>
    message.type === type;
  return messages.filter(matches).pop();
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
    const server = createCrdtServer();
    const link = createTestLink(
      server,
      new CrdtEngine({ site: "a", name: "A", flushMs: FLUSH_MS }),
    );
    link.open();

    typeAtEnd(link.session, "hi");
    flush();
    expect(opsIn(link.toServer)).toEqual([]);
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

    expect(opsIn(links[0].sentToServer)).toHaveLength(1);
    expect(lastOf(links[0].sentToClient, "sync")).toEqual({ type: "sync", ack: 1, ops: [] });
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
    expect(links[1].toServer).toContainEqual({ type: "hello", site: "b", vector: {} });
    deliverAll(links);
    expect(b.doc.text()).toBe("one two");
  });

  it("ignores a message that arrives after the line was closed", () => {
    const { links, sessions } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "hi");
    flush();
    links[0].deliverToServer();
    const late = links[1].toClient.filter((message) => message.type === "ops")[0];

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

    const sync = lastOf(links[1].sentToClient, "sync");
    expect(sync?.ops.map((op) => op.seq)).toEqual([2, 3]);
    expect(sessions[1].doc.text()).toBe("one two three");
  });

  it("does not get its own operations back", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "mine");
    settle();

    links[0].close();
    links[0].open();
    deliverAll(links);

    expect(lastOf(links[0].sentToClient, "sync")).toEqual({ type: "sync", ack: 1, ops: [] });
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
  function runRandomSession(seed: number, steps: number, crowded = false) {
    const random = createRandom(seed);
    const events: CollabEvent[] = [];
    const { server, links } = setup(["a", "b", "c"], { onEvent: (event) => events.push(event) });

    const act = (link: CrdtLink) => {
      const session = link.session;
      const length = session.doc.text().length;
      // Crowded: everybody works on the first three characters, and deletes
      // as much as they type. That is where a tombstone removed too early
      // does harm.
      const place = (max: number) => pickIndex(random, crowded ? Math.min(max, 3) : max);
      const dice = random();
      if (dice < (crowded ? 0.15 : 0.3)) {
        typeAt(session, place(length + 1), "abcdefgh".slice(pickIndex(random, crowded ? 3 : 8)));
      } else if (dice < (crowded ? 0.3 : 0.4) && length > 0) {
        const from = place(length);
        deleteRange(session, from, Math.min(length, from + 1 + pickIndex(random, 3)));
      } else if (dice < 0.45) {
        session.undo();
      } else if (dice < 0.48) {
        flush();
      } else if (dice < (crowded ? 0.55 : 0.5)) {
        vi.advanceTimersByTime(600); // Long enough for "this is what I have seen".
      } else if (dice < (crowded ? 0.57 : 0.55)) {
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
    quiet(links);
    return { server, events, sessions: links.map((link) => link.session) };
  }

  it("400 steps: the three people end with the same text, with tombstones removed on the way (40 seeds)", () => {
    let collected = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { server, events, sessions } = runRandomSession(seed, 400);
      // Computed from the whole log, by a reader that never removes a tombstone.
      const expected = expectedText(server.getLog());
      collected += server.getCollectedCount();
      expect(events.filter((event) => event.type === "divergence_detected")).toEqual([]);

      for (const session of sessions) {
        if (session.doc.text() !== expected || session.doc.waitingCount !== 0) {
          throw new Error(`seed ${seed}: ${session.site} has "${session.doc.text()}"`);
        }
        expect(session.pendingCount).toBe(0);
      }
    }
    expect(collected).toBeGreaterThan(1000);
  });

  it("crowded editing at the first three characters, with as many deletes as inserts (150 seeds)", () => {
    let collected = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const { server, events, sessions } = runRandomSession(seed, 300, true);
      const expected = expectedText(server.getLog());
      collected += server.getCollectedCount();

      expect(events.filter((event) => event.type === "divergence_detected")).toEqual([]);
      for (const session of sessions) {
        if (session.doc.text() !== expected || session.doc.waitingCount !== 0) {
          throw new Error(`seed ${seed}: ${session.site} has "${session.doc.text()}"`);
        }
      }
    }
    expect(collected).toBeGreaterThan(1000);
  });

  it("when everybody is back and quiet, no tombstone is left that the server has released", () => {
    const { server, sessions } = runRandomSession(3, 600);
    const deleted = server
      .getLog()
      .reduce((sum, op) => sum + (op.type === "delete" ? op.ids.length : 0), 0);

    expect(deleted).toBeGreaterThan(50);
    // A site that was offline when a "collect" was sent keeps those. No site has more.
    for (const session of sessions) {
      expect(session.doc.tombstoneCount).toBeLessThanOrEqual(deleted - 1);
    }
    expect(Math.min(...sessions.map((session) => session.doc.tombstoneCount))).toBeLessThan(
      deleted / 2,
    );
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

describe("carets of other people", () => {
  it("shows where the other person is, as a place in our own text", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("hello world", 11);
    settle();

    sessions[1].setSelection(6, 11); // "world"
    vi.advanceTimersByTime(100);
    deliverAll(links);

    expect(sessions[0].peers()).toEqual([{ site: "b", name: "B", start: 6, end: 11 }]);
  });

  it("keeps the caret of the other person on the same characters when the text changes", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("hello world", 11);
    settle();
    sessions[1].setSelection(6, 11);
    vi.advanceTimersByTime(100);
    deliverAll(links);

    sessions[0].edit(">> hello world", 3);

    const [peer] = sessions[0].peers();
    expect(sessions[0].text().slice(peer.start, peer.end)).toBe("world");
  });

  it("sends one caret message for many fast moves, with the last place", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    sessions[0].edit("hello world", 11);
    settle();
    vi.advanceTimersByTime(1000);
    deliverAll(links);
    links[1].sentToServer.length = 0;

    for (let index = 0; index <= 11; index += 1) {
      sessions[1].setSelection(index, index);
    }
    vi.advanceTimersByTime(100);

    const sent = links[1].sentToServer.filter((message) => message.type === "presence");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ presence: { site: "b", name: "B", end: { counter: 11 } } });
  });

  it("tells a person who arrives later where the others are", () => {
    const { server, links, sessions } = setup(["a", "b"]);
    sessions[0].setSelection(0, 0);
    vi.advanceTimersByTime(100);
    deliverAll(links);

    const late = createTestLink(server, new CrdtEngine({ site: "c", name: "C" }));
    late.open();
    deliverAll([late]);

    expect(late.session.peers().map((peer) => peer.name)).toContain("A");
  });

  it("removes a person who leaves, and forgets everybody when we go offline ourselves", () => {
    const { links, sessions } = setup(["a", "b", "c"]);
    vi.advanceTimersByTime(100);
    deliverAll(links);
    expect(sessions[0].peers()).toHaveLength(2);

    links[1].close();
    deliverAll(links);
    expect(sessions[0].peers().map((peer) => peer.site)).toEqual(["c"]);
    links[0].close();

    expect(sessions[0].peers()).toEqual([]);
  });

  it("does not let a site send a caret in the name of another site", () => {
    const { links, sessions } = setup(["a", "b"]);
    links[1].toServer.push({
      type: "presence",
      presence: { site: "a", name: "Fake", start: null, end: null },
    });

    deliverAll(links);

    expect(sessions[0].peers().map((peer) => peer.site)).toEqual(["b"]);
  });
});

describe("events for monitoring", () => {
  function setupWithEvents() {
    const events: Record<string, CollabEvent[]> = { a: [], b: [] };
    const server = createCrdtServer();
    const links = ["a", "b"].map((site) => {
      const engine = new CrdtEngine({
        site,
        name: `name-of-${site}`,
        flushMs: FLUSH_MS,
        onEvent: (event) => events[site].push(event),
      });
      const link = createTestLink(server, engine);
      link.open();
      return link;
    });
    deliverAll(links);
    return { links, events, sessions: links.map((link) => link.session) };
  }

  it("reports a sync with its duration and counts", () => {
    const { links, events, sessions } = setupWithEvents();
    links[1].close();
    typeAtEnd(sessions[0], "one");
    flush();
    deliverAll(links);
    typeAtEnd(sessions[1], "two");
    flush();
    events.b.length = 0;

    links[1].open();
    vi.advanceTimersByTime(120); // The answer of the server takes 120 ms.
    deliverAll(links);

    expect(events.b.slice(0, 4)).toEqual([
      { type: "sync_started" },
      { type: "op_sent", ops: 1, characters: 3 },
      { type: "op_received", ops: 1, characters: 3 },
      { type: "sync_finished", durationMs: 120, sent: 1, received: 1 },
    ]);
  });

  it("reports operations sent and received as counts", () => {
    const { links, events, sessions } = setupWithEvents();
    events.a.length = 0;
    events.b.length = 0;

    typeAtEnd(sessions[0], "hello");
    flush();
    deliverAll(links);

    expect(events.a).toEqual([{ type: "op_sent", ops: 1, characters: 5 }]);
    expect(events.b).toEqual([{ type: "op_received", ops: 1, characters: 5 }]);
  });

  it("never puts text of the document, a name or a site in an event", () => {
    const { links, events, sessions } = setupWithEvents();
    const secret = "ZEBRA-4417";

    typeAtEnd(sessions[0], secret);
    sessions[0].edit(`${secret} pasted ${secret}`, 28);
    deleteRange(sessions[0], 0, 3);
    sessions[0].undo();
    sessions[1].setSelection(2, 5);
    links[0].close();
    typeAtEnd(sessions[0], secret);
    links[0].open();
    quiet(links);
    sessions[0].edit("x".repeat(300_000), 300_000);

    const all = [...events.a, ...events.b];
    expect(all.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "op_sent",
        "op_received",
        "sync_started",
        "sync_finished",
        "edit_rejected",
        "tombstones_collected",
      ]),
    );
    for (const event of all) {
      for (const [key, value] of Object.entries(event)) {
        // Every value is a number, or one of a few fixed words.
        const isFixedWord = key === "type" || (key === "reason" && value === "too_long");
        expect(typeof value === "number" || isFixedWord).toBe(true);
      }
    }
    const serialised = JSON.stringify(all);
    for (const forbidden of [secret, "ZEBRA", "pasted", "name-of-a", "name-of-b"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe("the size limit", () => {
  it("refuses a local edit that makes the text longer than the limit, and says so", () => {
    const events: CollabEvent[] = [];
    const engine = new CrdtEngine({
      site: "a",
      name: "A",
      maxLength: 10,
      onEvent: (event) => events.push(event),
    });
    const listener = vi.fn();
    engine.edit("123456789", 9);
    engine.subscribe(listener);

    engine.edit("123456789 and a lot more", 24);

    expect(engine.text()).toBe("123456789");
    expect(events).toEqual([{ type: "edit_rejected", reason: "too_long" }]);
    expect(listener).toHaveBeenCalled(); // So the textarea shows the old text again.
    expect(engine.pendingCount).toBe(1);
  });

  it("allows an edit up to the limit, and a delete in a text that is over it", () => {
    const { sessions, settle } = setup(["a", "b"], { maxLength: 6 });
    sessions[0].edit("abcdef", 6);
    sessions[1].edit("uvwxyz", 6);
    settle();
    expect(sessions[0].text()).toHaveLength(12); // Two people can go over it together.

    sessions[0].edit(sessions[0].text().slice(1), 0);

    expect(sessions[0].text()).toHaveLength(11);
  });

  it("has a default of 200,000 characters", () => {
    const engine = new CrdtEngine({ site: "a", name: "A" });

    engine.edit("x".repeat(200_000), 200_000);
    engine.edit("x".repeat(200_001), 200_001);

    expect(engine.text()).toHaveLength(200_000);
  });
});

describe("the check that two sites with the same operations have the same text", () => {
  it("says nothing when the texts are equal", () => {
    const events: CollabEvent[] = [];
    const { links, sessions, settle } = setup(["a", "b"], {
      onEvent: (event) => events.push(event),
    });

    typeAtEnd(sessions[0], "hello");
    settle();
    typeAtEnd(sessions[1], " world");
    settle();
    quiet(links);

    expect(links[0].sentToClient.some((message) => message.type === "digest")).toBe(true);
    expect(events.filter((event) => event.type === "divergence_detected")).toEqual([]);
  });

  it("reports a divergence when a bug made one text different", () => {
    const events: Record<string, CollabEvent[]> = { a: [], b: [] };
    const server = createCrdtServer();
    const links = ["a", "b"].map((site) => {
      const onEvent = (event: CollabEvent) => events[site].push(event);
      const link = createTestLink(server, new CrdtEngine({ site, name: site, onEvent }));
      link.open();
      return link;
    });
    typeAtEnd(links[0].session, "hello");
    quiet(links);

    // The "bug": a character gets into one document without an operation.
    links[1].session.doc.apply({
      type: "insert",
      id: { site: "ghost", counter: 99 },
      after: null,
      text: "!",
    });
    typeAtEnd(links[0].session, ".");
    quiet(links);

    expect(events.a.filter((event) => event.type === "divergence_detected")).toHaveLength(1);
  });

  it("does not compare while one site has operations the other has not", () => {
    const events: CollabEvent[] = [];
    const { links, sessions, settle } = setup(["a", "b"], {
      onEvent: (event) => events.push(event),
    });
    typeAtEnd(sessions[0], "hello");
    settle();
    vi.advanceTimersByTime(500);
    links[1].deliverToServer(); // b says what it has. The digest is on its way to a.

    typeAtEnd(sessions[0], "!"); // a is ahead now.
    deliverAll(links);

    expect(events.filter((event) => event.type === "divergence_detected")).toEqual([]);
  });
});

describe("while the user builds a character with an input method", () => {
  it("holds remote changes, and applies them when the character is done", () => {
    const { sessions, settle } = setup(["a", "b"]);
    sessions[1].setComposing(true);

    typeAtEnd(sessions[0], "hello");
    settle();
    expect(sessions[1].text()).toBe("");
    sessions[1].edit("न", 1); // The half-built character is a normal local edit.
    sessions[1].setComposing(false);
    settle();

    expect(sessions[1].text()).toBe(sessions[0].text());
    expect(sessions[1].text()).toContain("hello");
    expect(sessions[1].text()).toContain("न");
  });

  it("drops what it held when the line closes, and gets it again from the server", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    sessions[1].setComposing(true);
    typeAtEnd(sessions[0], "hello");
    settle();

    links[1].close();
    sessions[1].setComposing(false);
    expect(sessions[1].text()).toBe("");
    links[1].open();
    settle();

    expect(sessions[1].text()).toBe("hello");
  });
});

describe("remote changes, counted for the screen reader line", () => {
  it("counts one for each batch of remote operations, and none for local edits", () => {
    const { sessions, settle } = setup(["a", "b"]);

    typeAtEnd(sessions[0], "hello");
    settle();
    typeAtEnd(sessions[0], " world");
    settle();

    expect(sessions[0].remoteChanges()).toBe(0);
    expect(sessions[1].remoteChanges()).toBe(2);
  });
});

describe("saving and loading", () => {
  it("opens a saved document with the same text, without any operation from the server", () => {
    const { sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "hello world");
    settle();
    deleteRange(sessions[1], 0, 6);
    settle();

    const saved = JSON.parse(JSON.stringify(sessions[0].save()));
    const reopened = new CrdtEngine({ site: "a", name: "A" }, saved);

    expect(reopened.text()).toBe("world");
    expect(saved.runs).toEqual([
      ["a", 1, 6],
      ["a", 7, "world"],
    ]);
  });

  it("asks only for the operations after the snapshot when it connects", () => {
    const { server, links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "one");
    settle();
    const saved = sessions[1].save();
    links[1].close();
    typeAtEnd(sessions[0], " two");
    settle();

    const reopened = createTestLink(server, new CrdtEngine({ site: "b", name: "B" }, saved));
    reopened.open();
    deliverAll([reopened]);

    expect(reopened.sentToServer[0]).toEqual({ type: "hello", site: "b", vector: { a: 1 } });
    expect(lastOf(reopened.sentToClient, "sync")?.ops.map((op) => op.seq)).toEqual([2]);
    expect(reopened.session.text()).toBe("one two");
  });

  it("keeps the edits that the server has not seen, and sends them after loading", () => {
    const { server, links, sessions, settle } = setup(["a", "b"]);
    links[0].close();
    typeAtEnd(sessions[0], "written offline");

    const saved = sessions[0].save();
    const reopened = createTestLink(server, new CrdtEngine({ site: "a", name: "A" }, saved));
    expect(reopened.session.pendingCount).toBe(1);
    reopened.open();
    deliverAll([reopened, links[1]]);
    settle();

    expect(sessions[1].text()).toBe("written offline");
    expect(reopened.session.pendingCount).toBe(0);
  });

  it("never uses an id twice after loading, also when the newest character was deleted and removed", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "abc");
    settle();
    deleteRange(sessions[0], 2, 3); // "c" had the highest counter.
    settle();
    quiet(links);
    expect(sessions[0].doc.tombstoneCount).toBe(0);

    const reopened = new CrdtEngine({ site: "a", name: "A" }, sessions[0].save());
    reopened.edit("abX", 3);

    expect(reopened.doc.ids().map((id) => id.counter)).toEqual([1, 2, 4]);
  });

  it("keeps an edit that still waits for a character", () => {
    const engine = new CrdtEngine({ site: "a", name: "A" });
    engine.doc.apply({
      type: "insert",
      id: { site: "b", counter: 2 },
      after: { site: "b", counter: 1 },
      text: "!",
    });

    const reopened = new CrdtEngine({ site: "a", name: "A" }, engine.save());
    reopened.doc.apply({ type: "insert", id: { site: "b", counter: 1 }, after: null, text: "hi" });

    // "hi" took the counters 1 and 2 here, so the waiting "!" was a part of it.
    expect(reopened.doc.waitingCount).toBe(0);
    expect(reopened.text()).toBe("hi");
  });

  it("is much smaller than the operations it replaces", () => {
    const { server, sessions, settle } = setup(["a", "b"]);
    for (let round = 0; round < 200; round += 1) {
      typeAtEnd(sessions[round % 2], `word${round} `);
      settle();
    }

    const snapshot = JSON.stringify(sessions[0].save().runs).length;
    const log = JSON.stringify(server.getLog()).length;

    expect(snapshot).toBeLessThan(log / 4);
  });

  it("refuses a saved document of another site", () => {
    const saved = new CrdtEngine({ site: "a", name: "A" }).save();

    expect(() => new CrdtEngine({ site: "b", name: "B" }, saved)).toThrow();
  });

  it("gives the same text as the others after loading and more editing (seeded)", () => {
    const random = createRandom(5);
    const { server, links, sessions, settle } = setup(["a", "b"]);
    for (let step = 0; step < 100; step += 1) {
      const session = sessions[pickIndex(random, 2)];
      typeAt(session, pickIndex(random, session.text().length + 1), "xy");
      if (session.text().length > 3 && random() < 0.4) {
        deleteRange(session, 1, 3);
      }
      if (random() < 0.3) {
        settle();
      }
    }
    quiet(links);

    links[0].close();
    const reopened = createTestLink(
      server,
      new CrdtEngine({ site: "a", name: "A" }, sessions[0].save()),
    );
    reopened.open();
    typeAt(reopened.session, 2, "after the reload");
    typeAt(sessions[1], 0, "meanwhile ");
    quiet([reopened, links[1]]);

    expect(reopened.session.text()).toBe(sessions[1].text());
    expect(reopened.session.text()).toBe(expectedText(server.getLog()));
  });
});

describe("removing old tombstones", () => {
  it("removes a tombstone when every site has seen the delete and all that was typed before", () => {
    const events: CollabEvent[] = [];
    const { links, sessions, settle } = setup(["a", "b", "c"], {
      onEvent: (event) => events.push(event),
    });
    typeAtEnd(sessions[0], "hello world");
    settle();
    deleteRange(sessions[1], 0, 6);
    settle();
    expect(sessions.map((session) => session.doc.tombstoneCount)).toEqual([6, 6, 6]);

    quiet(links);

    expect(sessions.map((session) => session.doc.tombstoneCount)).toEqual([0, 0, 0]);
    expect(sessions.map((session) => session.text())).toEqual(["world", "world", "world"]);
    expect(events).toContainEqual({ type: "tombstones_collected", count: 6 });
  });

  it("keeps every tombstone while one site is away", () => {
    const { server, links, sessions, settle } = setup(["a", "b", "c"]);
    typeAtEnd(sessions[0], "hello world");
    settle();
    quiet(links);
    links[2].close();

    deleteRange(sessions[1], 0, 6);
    settle();
    quiet(links);

    expect(server.getCollectedCount()).toBe(0);
    expect(sessions[0].doc.tombstoneCount).toBe(6);
  });

  it("removes them when the site that was away has caught up", () => {
    const { links, sessions, settle } = setup(["a", "b", "c"]);
    typeAtEnd(sessions[0], "hello world");
    settle();
    links[2].close();
    deleteRange(sessions[1], 0, 6);
    settle();

    links[2].open();
    quiet(links);

    expect(sessions.map((session) => session.doc.tombstoneCount)).toEqual([0, 0, 0]);
  });

  it("stays right when a site typed after the doomed character before it saw the delete", () => {
    // The dangerous case. T is deleted. Site c has not seen that, and types
    // D right after T. Site b has seen the delete but not D, and types X
    // after P. The place of X depends on T and D. A site that removed T too
    // early would put X on the other side of D.
    const { server, links, sessions, settle } = setup(["a", "b", "c"]);
    const [a, b, c] = sessions;
    a.edit("PT", 2);
    settle();
    quiet(links);
    links[2].close();
    typeAt(c, 2, "dddd"); // After T, with high counters. Not sent yet.
    deleteRange(a, 1, 2); // T is deleted.
    settle();
    quiet(links);
    expect(b.text()).toBe("P");

    links[2].open(); // c sends D, then says what it has seen.
    flush();
    links[2].deliverToServer();
    links[2].deliverToClient();
    links[2].deliverToServer();
    typeAt(b, 1, "X"); // b still has not seen D.
    // c says "I have seen the delete" before X of b reaches the server. A
    // server with the simple rule would release T at this moment.
    vi.advanceTimersByTime(600);
    while (links[2].deliverToServer()) {
      // Deliver everything c has sent.
    }
    expect(server.getCollectedCount()).toBe(0);
    quiet(links);

    expect(new Set(sessions.map((session) => session.text())).size).toBe(1);
    expect(a.text()).toBe(expectedText(server.getLog()));
    // A person who arrives now gets the whole log and must agree too.
    const late = createTestLink(server, new CrdtEngine({ site: "z", name: "Z" }));
    late.open();
    deliverAll([late]);
    expect(late.session.text()).toBe(a.text());
  });

  it("stays right in the dangerous case for 3,000 random orders of the edits, messages and timers", () => {
    let collected = 0;
    for (let seed = 1; seed <= 3000; seed += 1) {
      const random = createRandom(seed);
      const { server, links, sessions } = setup(["a", "b", "c"]);
      const [a, b, c] = sessions;
      a.edit("PT", 2);
      quiet(links);
      // The same three edits as in the test above, at any moment.
      const edits = [
        () => deleteRange(a, 1, 2),
        () => typeAt(b, 1, "X"),
        () => typeAt(c, c.text().length, "dd"),
        () => typeAt(a, 1, "y"),
      ];

      for (let step = 0; step < 40; step += 1) {
        const dice = random();
        const link = links[pickIndex(random, links.length)];
        if (dice < 0.15 && edits.length > 0) {
          edits.splice(pickIndex(random, edits.length), 1)[0]();
        } else if (dice < 0.3) {
          vi.advanceTimersByTime(600);
        } else if (dice < 0.65) {
          link.deliverToServer();
        } else {
          link.deliverToClient();
        }
      }
      edits.forEach((edit) => edit());
      quiet(links);

      collected += server.getCollectedCount();
      const expected = expectedText(server.getLog());
      for (const session of sessions) {
        if (session.text() !== expected) {
          throw new Error(
            `seed ${seed}: ${session.site} has "${session.text()}", not "${expected}"`,
          );
        }
      }
    }
    expect(collected).toBeGreaterThan(1000);
  });

  it("keeps the caret in place when the tombstone it was after is removed", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "abcd");
    settle();
    sessions[1].setSelection(3, 3); // abc|d
    deleteRange(sessions[0], 1, 3); // "ad": the caret of b is after a tombstone.
    settle();
    expect(sessions[1].selection()).toEqual({ start: 1, end: 1 });

    quiet(links);

    expect(sessions[1].doc.tombstoneCount).toBe(0);
    expect(sessions[1].selection()).toEqual({ start: 1, end: 1 }); // a|d
    expect(sessions[0].peers()[0]).toMatchObject({ start: 1, end: 1 });
  });

  it("can still undo a delete after its tombstones were removed", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "big red bus");
    settle();
    deleteRange(sessions[0], 4, 8);
    settle();
    quiet(links);
    expect(sessions[0].doc.tombstoneCount).toBe(0);

    sessions[0].undo();
    settle();

    expect(sessions[0].text()).toBe("big red bus");
    expect(sessions[1].text()).toBe("big red bus");
  });

  it("never makes an edit that comes after a tombstone", () => {
    const { links, sessions, settle } = setup(["a", "b"]);
    typeAtEnd(sessions[0], "abc");
    settle();
    deleteRange(sessions[0], 1, 3); // "a"
    sessions[0].undo(); // Puts "bc" back.
    typeAt(sessions[0], 1, "X");
    settle();

    const inserts = opsIn(links[0].sentToServer).filter((op) => op.type === "insert");
    const deleted = new Set(
      opsIn(links[0].sentToServer).flatMap((op) =>
        op.type === "delete" ? op.ids.map((id) => id.counter) : [],
      ),
    );
    for (const insert of inserts) {
      expect(
        insert.type === "insert" && insert.after && deleted.has(insert.after.counter),
      ).toBeFalsy();
    }
    expect(sessions[1].text()).toBe(sessions[0].text());
  });
});
