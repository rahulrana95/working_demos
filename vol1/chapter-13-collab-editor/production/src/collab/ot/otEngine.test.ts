/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tests for the OT engine with its server: the same promises as the CRDT
 * engine, kept in another way.
 */
import { createOtServer } from "../../server/otServer";
import { createRandom, pickIndex } from "../crdt/testHelpers";
import type { CollabEvent, EngineOptions } from "../engine";
import { createTestLink, deliverAll } from "../testNetwork";
import { OtEngine } from "./otEngine";
import { applyOps } from "./transform";

function setup(sites: string[], options: Partial<EngineOptions> = {}) {
  const server = createOtServer();
  const links = sites.map((site) => {
    const link = createTestLink(server, new OtEngine({ site, name: site, ...options }));
    link.open();
    return link;
  });
  deliverAll(links);
  return { server, links, engines: links.map((link) => link.session) };
}

function typeAt(engine: OtEngine, index: number, text: string): void {
  [...text].forEach((char, offset) => {
    const old = engine.text();
    const at = index + offset;
    engine.edit(old.slice(0, at) + char + old.slice(at), at + 1);
  });
}

function deleteRange(engine: OtEngine, from: number, to: number): void {
  const old = engine.text();
  engine.edit(old.slice(0, from) + old.slice(to), from);
}

describe("OT engine", () => {
  it("shows what another site typed", () => {
    const { links, engines } = setup(["a", "b"]);

    typeAt(engines[0], 0, "hello");
    deliverAll(links);

    expect(engines[1].text()).toBe("hello");
  });

  it("gives both sites the same text after they typed at the same place at the same time", () => {
    const { links, engines } = setup(["a", "b"]);

    typeAt(engines[0], 0, "hello");
    typeAt(engines[1], 0, "world");
    deliverAll(links);

    // The lower site name goes first, and the two words do not mix.
    expect(engines[0].text()).toBe("helloworld");
    expect(engines[1].text()).toBe("helloworld");
  });

  it("puts an insert in the right place when another site deleted before it (the chapter's example)", () => {
    const { links, engines } = setup(["a", "b"]);
    engines[0].edit("abcdefg", 7);
    deliverAll(links);

    typeAt(engines[0], 5, "x"); // "insert at index 5"
    deleteRange(engines[1], 2, 3); // "delete index 2", at the same moment
    deliverAll(links);

    expect(engines[0].text()).toBe("abdexfg");
    expect(engines[1].text()).toBe("abdexfg");
  });

  it("has one submit on its way at a time, and sends the rest when the answer is back", () => {
    const { links, engines } = setup(["a"]);

    typeAt(engines[0], 0, "abc");

    expect(links[0].toServer).toHaveLength(1);
    expect(engines[0].pendingCount).toBe(2);
    deliverAll(links);
    expect(links[0].sentToServer.filter((message) => message.type === "submit")).toHaveLength(2);
    expect(engines[0].pendingCount).toBe(0);
  });

  it("keeps the caret after the same character when another site types before it", () => {
    const { links, engines } = setup(["a", "b"]);
    engines[0].edit("world", 5);
    deliverAll(links);
    engines[1].setSelection(3, 3); // wor|ld

    typeAt(engines[0], 0, "hello ");
    deliverAll(links);

    expect(engines[1].selection()).toEqual({ start: 9, end: 9 });
  });

  it("keeps edits made offline and merges them when the line is back", () => {
    const { links, engines } = setup(["a", "b"]);
    engines[0].edit("The meeting is on Monday.", 25);
    deliverAll(links);
    links.forEach((link) => link.close());

    typeAt(engines[0], 25, " Bring the report.");
    deleteRange(engines[1], 18, 24);
    typeAt(engines[1], 18, "Friday");
    links.forEach((link) => link.open());
    deliverAll(links);

    expect(engines[0].text()).toBe("The meeting is on Friday. Bring the report.");
    expect(engines[1].text()).toBe(engines[0].text());
  });

  it("sends a submit again when it was lost with the line", () => {
    const { server, links, engines } = setup(["a", "b"]);
    typeAt(engines[0], 0, "hi");

    links[0].close(); // The submit was on its way. It is lost.
    links[0].open();
    deliverAll(links);

    expect(engines[1].text()).toBe("hi");
    expect(server.getHistory().map((entry) => entry.id)).toEqual([1, 2]);
  });

  it("does not store a submit twice when only the answer was lost", () => {
    const { server, links, engines } = setup(["a", "b"]);
    typeAt(engines[0], 0, "h");
    links[0].deliverToServer(); // Arrives. The answer is on its way back.

    links[0].close();
    links[0].open();
    deliverAll(links);

    expect(server.getHistory()).toHaveLength(1);
    expect(engines[0].text()).toBe("h");
    expect(engines[0].pendingCount).toBe(0);
  });

  it("asks again when an entry is missing", () => {
    const { server, links, engines } = setup(["a", "b"]);
    typeAt(engines[0], 0, "ab");
    links[0].deliverToServer();
    links[0].deliverToClient();
    links[0].deliverToServer();
    links[1].toClient.shift(); // The first entry for b is lost.

    deliverAll(links);

    expect(server.getHistory()).toHaveLength(2);
    expect(engines[1].text()).toBe("ab");
  });

  it("ignores a message that arrives after the line was closed", () => {
    const { links, engines } = setup(["a", "b"]);
    typeAt(engines[0], 0, "h");
    links[0].deliverToServer();
    const [late] = links[1].toClient;

    links[1].close();
    engines[1].receive(late);

    expect(engines[1].text()).toBe("");
  });

  it("refuses a local edit over the size limit", () => {
    const events: CollabEvent[] = [];
    const engine = new OtEngine({
      site: "a",
      name: "A",
      maxLength: 5,
      onEvent: (e) => events.push(e),
    });

    engine.edit("123456", 6);

    expect(engine.text()).toBe("");
    expect(events).toEqual([{ type: "edit_rejected", reason: "too_long" }]);
  });

  it("holds remote changes while the user builds a character", () => {
    const { links, engines } = setup(["a", "b"]);
    engines[1].setComposing(true);

    typeAt(engines[0], 0, "hello");
    deliverAll(links);
    expect(engines[1].text()).toBe("");
    engines[1].setComposing(false);

    expect(engines[1].text()).toBe("hello");
    expect(engines[1].remoteChanges()).toBeGreaterThan(0);
  });

  it("has no carets of other people and no undo: it says so by doing nothing", () => {
    const { engines } = setup(["a"]);
    engines[0].edit("abc", 3);

    engines[0].undo();

    expect(engines[0].text()).toBe("abc");
    expect(engines[0].peers()).toEqual([]);
  });

  it("never puts text of the document in an event", () => {
    const events: CollabEvent[] = [];
    const { links, engines } = setup(["a", "b"], { onEvent: (event) => events.push(event) });

    typeAt(engines[0], 0, "ZEBRA-4417");
    links[1].close();
    typeAt(engines[1], 0, "ZEBRA");
    links[1].open();
    deliverAll(links);

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["op_sent", "op_received", "sync_started", "sync_finished"]),
    );
    expect(JSON.stringify(events)).not.toContain("ZEBRA");
    for (const event of events) {
      for (const [key, value] of Object.entries(event)) {
        expect(key === "type" || typeof value === "number").toBe(true);
      }
    }
  });

  it("tells its listeners about changes, and stops after dispose", () => {
    const { engines } = setup(["a"]);
    const listener = vi.fn();
    engines[0].subscribe(listener);
    const before = engines[0].version();

    engines[0].edit("a", 1);
    expect(listener).toHaveBeenCalled();
    expect(engines[0].version()).toBeGreaterThan(before);
    listener.mockClear();
    engines[0].dispose();
    engines[0].edit("ab", 2);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("random OT sessions with a bad network (seeded)", () => {
  it("300 steps: three sites end with the text of the server history (60 seeds)", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const random = createRandom(seed);
      const { server, links } = setup(["a", "b", "c"]);

      for (let step = 0; step < 300; step += 1) {
        const link = links[pickIndex(random, links.length)];
        const engine = link.session;
        const length = engine.text().length;
        const dice = random();
        if (dice < 0.3) {
          typeAt(engine, pickIndex(random, length + 1), "abcdefgh".slice(pickIndex(random, 8)));
        } else if (dice < 0.42 && length > 0) {
          const from = pickIndex(random, length);
          deleteRange(engine, from, Math.min(length, from + 1 + pickIndex(random, 3)));
        } else if (dice < 0.48) {
          if (link.isOpen()) {
            link.close();
          } else {
            link.open();
          }
        } else if (dice < 0.75) {
          link.deliverToServer();
        } else {
          link.deliverToClient();
        }
      }
      links.filter((link) => !link.isOpen()).forEach((link) => link.open());
      deliverAll(links);

      const expected = server.getHistory().reduce((text, entry) => applyOps(text, entry.ops), "");
      for (const link of links) {
        if (link.session.text() !== expected || link.session.pendingCount !== 0) {
          throw new Error(`seed ${seed}: ${link.session.site} has "${link.session.text()}"`);
        }
      }
    }
  });

  it("the history has every submit of a site once, in the order 1, 2, 3", () => {
    const { server, links, engines } = setup(["a", "b"]);
    for (let round = 0; round < 20; round += 1) {
      typeAt(engines[round % 2], 0, "x");
      if (round % 3 === 0) {
        links[0].deliverToServer();
        links[0].close();
        links[0].open();
      }
      deliverAll(links);
    }

    const next: Record<string, number> = {};
    for (const entry of server.getHistory()) {
      expect(entry.id).toBe((next[entry.site] ?? 0) + 1);
      next[entry.site] = entry.id;
    }
    expect(engines[0].text()).toHaveLength(20);
    expect(engines[1].text()).toBe(engines[0].text());
  });
});
