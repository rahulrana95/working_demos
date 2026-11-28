/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud and walk through the first two.
 * Here they are tests. The book says that every editor ends with the same
 * text, so the tests try every order of delivery for small cases, and many
 * random orders for large ones.
 */
import { goesFirst, Rga } from "./rga";
import { createRandom, expectedText, permutations, pickIndex, shuffled } from "./testHelpers";
import type { Edit, Id, InsertEdit } from "./types";

/** Types the text at the end of what this site sees. Returns the operations. */
function typeAtEnd(doc: Rga, text: string): InsertEdit[] {
  return typeAfter(doc, doc.ids()[doc.ids().length - 1] ?? null, text);
}

/** One edit for each character, as slow typing gives them. */
function typeAfter(doc: Rga, after: Id | null, text: string): InsertEdit[] {
  const ops: InsertEdit[] = [];
  let left = after;
  for (const char of text) {
    const op = doc.insertAfter(left, char);
    ops.push(op);
    left = op.id;
  }
  return ops;
}

/** A new document that receives the operations in the given order. */
function replay(ops: Edit[]): Rga {
  const doc = new Rga("reader");
  ops.forEach((op) => doc.apply(op));
  return doc;
}

describe("one site", () => {
  it("keeps typed characters in the order they were typed", () => {
    const doc = new Rga("a");
    typeAtEnd(doc, "hello");

    expect(doc.text()).toBe("hello");
  });

  it("inserts in the middle and at the start", () => {
    const doc = new Rga("a");
    typeAtEnd(doc, "ac");
    doc.insertAfter(doc.ids()[0], "b");
    doc.insertAfter(null, ">");

    expect(doc.text()).toBe(">abc");
  });

  it("hides a deleted character but keeps it as a tombstone to insert after", () => {
    const doc = new Rga("a");
    typeAtEnd(doc, "abc");
    const [, b] = doc.ids();
    doc.delete([b]);
    doc.insertAfter(b, "x");

    expect(doc.text()).toBe("axc");
    expect(doc.ids()).toHaveLength(3);
  });

  it("gives every character an id that is never used twice", () => {
    const doc = new Rga("a");
    const ops = typeAtEnd(doc, "abc");
    doc.delete([doc.ids()[1]]);
    ops.push(...typeAtEnd(doc, "d"));

    const keys = ops.map((op) => `${op.id.site}:${op.id.counter}`);
    expect(new Set(keys).size).toBe(4);
  });
});

describe("the order of two characters typed at the same place", () => {
  it("puts the higher counter first", () => {
    expect(goesFirst({ site: "a", counter: 5 }, { site: "b", counter: 4 })).toBe(true);
    expect(goesFirst({ site: "b", counter: 4 }, { site: "a", counter: 5 })).toBe(false);
  });

  it("lets the site name decide when the counters are equal", () => {
    expect(goesFirst({ site: "b", counter: 3 }, { site: "a", counter: 3 })).toBe(true);
    expect(goesFirst({ site: "a", counter: 3 }, { site: "b", counter: 3 })).toBe(false);
  });

  it("compares site names by character codes, not by the rules of a language", () => {
    // In Swedish, "ä" sorts after "z". By character code it also does. But
    // "Z" sorts before "a" by code, and after it in most languages.
    expect(goesFirst({ site: "a", counter: 1 }, { site: "Z", counter: 1 })).toBe(true);
  });

  it("gives a new character a higher counter than every character it has seen", () => {
    const a = new Rga("a");
    const b = new Rga("b");
    typeAtEnd(a, "abcd").forEach((op) => b.apply(op));

    const op = b.insertAfter(null, "x");

    expect(op.id.counter).toBe(5);
  });
});

describe("two sites that type at the same place at the same time", () => {
  function typeTogether() {
    const a = new Rga("a");
    const b = new Rga("b");
    const opA = a.insertAfter(null, "A");
    const opB = b.insertAfter(null, "B");
    return { a, b, opA, opB };
  }

  it("end with the same text, whichever operation arrives first", () => {
    const { a, b, opA, opB } = typeTogether();
    a.apply(opB);
    b.apply(opA);

    expect(a.text()).toBe("BA");
    expect(b.text()).toBe("BA");
    expect(replay([opA, opB]).text()).toBe("BA");
    expect(replay([opB, opA]).text()).toBe("BA");
  });

  it("do not mix two words letter by letter", () => {
    const a = new Rga("a");
    const b = new Rga("b");
    const hello = typeAtEnd(a, "hello");
    const world = typeAtEnd(b, "world");

    for (const order of [
      [...hello, ...world],
      [...world, ...hello],
      hello.flatMap((op, index) => [op, world[index]]),
    ]) {
      expect(replay(order).text()).toBe("worldhello");
    }
  });

  it("can mix two texts that were both typed back to front (a known limit of RGA)", () => {
    // Each person puts every new character at the very start, so all six
    // characters come after the same place and only their ids sort them.
    const a = new Rga("a");
    const b = new Rga("b");
    const fromA = ["c", "b", "a"].map((char) => a.insertAfter(null, char));
    const fromB = ["z", "y", "x"].map((char) => b.insertAfter(null, char));
    fromB.forEach((op) => a.apply(op));
    fromA.forEach((op) => b.apply(op));

    expect(a.text()).toBe("xaybzc");
    expect(b.text()).toBe("xaybzc");
  });

  it("keep a word typed later in front of an older word at the same place", () => {
    const a = new Rga("a");
    const b = new Rga("b");
    const old = typeAtEnd(a, "old");
    old.forEach((op) => b.apply(op));
    const fresh = typeAfter(b, null, "new ");
    fresh.forEach((op) => a.apply(op));

    expect(a.text()).toBe("new old");
    expect(b.text()).toBe("new old");
  });
});

describe("inserts and deletes that cross each other", () => {
  it("keeps a character typed after a character that another site deleted at the same time", () => {
    const a = new Rga("a");
    const b = new Rga("b");
    typeAtEnd(a, "abc").forEach((op) => b.apply(op));
    const idOfB = a.ids()[1];

    const deleteB = a.delete([idOfB]);
    const insertX = b.insertAfter(idOfB, "x");
    a.apply(insertX);
    b.apply(deleteB);

    expect(a.text()).toBe("axc");
    expect(b.text()).toBe("axc");
  });

  it("deletes a character once when two sites delete it at the same time", () => {
    const a = new Rga("a");
    const b = new Rga("b");
    typeAtEnd(a, "abc").forEach((op) => b.apply(op));

    const deleteByA = a.delete([a.ids()[1]]);
    const deleteByB = b.delete([b.ids()[1]]);
    a.apply(deleteByB);
    b.apply(deleteByA);

    expect(a.text()).toBe("ac");
    expect(b.text()).toBe("ac");
  });
});

describe("a network that sends twice or in the wrong order", () => {
  it("ignores an operation that arrives a second time", () => {
    const a = new Rga("a");
    const ops: Edit[] = typeAtEnd(a, "abc");
    ops.push(a.delete([a.ids()[0]]));

    const doc = replay([...ops, ...ops, ops[0], ops[3]]);

    expect(doc.text()).toBe("bc");
    expect(doc.ids()).toHaveLength(2);
  });

  it("holds a delete that arrives before its insert, and applies it when the insert arrives", () => {
    const a = new Rga("a");
    const [insert] = typeAtEnd(a, "a");
    const remove = a.delete([insert.id]);
    const doc = new Rga("reader");

    doc.apply(remove);
    expect(doc.waitingCount).toBe(1);
    doc.apply(insert);

    expect(doc.text()).toBe("");
    expect(doc.waitingCount).toBe(0);
  });

  it("holds an insert that arrives before the character on its left", () => {
    const a = new Rga("a");
    const [first, second, third] = typeAtEnd(a, "abc");
    const doc = new Rga("reader");

    doc.apply(third);
    doc.apply(second);
    expect(doc.text()).toBe("");
    expect(doc.waitingCount).toBe(2);
    doc.apply(first);

    expect(doc.text()).toBe("abc");
    expect(doc.waitingCount).toBe(0);
  });

  it("applies 50,000 characters that arrive in reverse order without a stack overflow", () => {
    const a = new Rga("a");
    const ops = typeAtEnd(a, "x".repeat(50_000));

    const doc = replay([...ops].reverse());

    expect(doc.text()).toHaveLength(50_000);
  });

  it("counts a character that arrives late when it gives out the next id", () => {
    const a = new Rga("a");
    const b = new Rga("b");
    const [first, second] = typeAtEnd(a, "ab");

    b.apply(second); // Waits for `first`, but its counter is already seen.
    const mine = b.insertAfter(null, "x");
    b.apply(first);

    expect(mine.id.counter).toBe(3);
    expect(b.text()).toBe("xab");
  });
});

describe("every order of delivery (small cases, all tried)", () => {
  /**
   * Three sites. Each case gives six or seven operations, some typed at the
   * same time and some that need an earlier one.
   */
  const cases: Record<string, () => Edit[]> = {
    "three sites type at the start at the same time": () => {
      const [a, b, c] = [new Rga("a"), new Rga("b"), new Rga("c")];
      return [...typeAtEnd(a, "ab"), ...typeAtEnd(b, "cd"), ...typeAtEnd(c, "ef")];
    },
    "two sites type after the same character, and one deletes it": () => {
      const [a, b, c] = [new Rga("a"), new Rga("b"), new Rga("c")];
      const base = typeAtEnd(a, "ab");
      base.forEach((op) => [b, c].forEach((doc) => doc.apply(op)));
      return [
        ...base,
        ...typeAfter(a, base[0].id, "x"),
        ...typeAfter(b, base[0].id, "yz"),
        c.delete([base[0].id]),
        c.delete([base[1].id]),
      ];
    },
    "a site types, deletes its own character and types again": () => {
      const [a, b] = [new Rga("a"), new Rga("b")];
      const [first, second] = typeAtEnd(a, "ab");
      const remove = a.delete([second.id]);
      const third = a.insertAfter(first.id, "c");
      b.apply(first);
      return [first, second, remove, third, ...typeAfter(b, first.id, "de"), b.delete([first.id])];
    },
    "equal counters at three sites, then a reply to the middle one": () => {
      const [a, b, c] = [new Rga("a"), new Rga("b"), new Rga("c")];
      const [fromA] = typeAtEnd(a, "a");
      const [fromB] = typeAtEnd(b, "b");
      const [fromC] = typeAtEnd(c, "c");
      a.apply(fromB);
      c.apply(fromB);
      return [
        fromA,
        fromB,
        fromC,
        ...typeAfter(a, fromB.id, "x"),
        ...typeAfter(c, fromB.id, "y"),
        a.delete([fromA.id]),
      ];
    },
  };

  for (const [name, makeOps] of Object.entries(cases)) {
    it(`${name}: every order gives the same text`, () => {
      const ops = makeOps();
      const expected = expectedText(ops);
      const orders = permutations(ops);

      expect(orders.length).toBeGreaterThanOrEqual(720);
      for (const order of orders) {
        const doc = replay(order);
        if (doc.text() !== expected || doc.waitingCount !== 0) {
          throw new Error(`"${doc.text()}" is not "${expected}" for ${JSON.stringify(order)}`);
        }
      }
    });
  }

  it("the same holds when every operation is delivered twice, in every order of 3 + 3", () => {
    const [a, b] = [new Rga("a"), new Rga("b")];
    const [first] = typeAtEnd(a, "a");
    b.apply(first);
    const ops = [first, a.delete([first.id]), ...typeAfter(b, first.id, "b")];
    const expected = expectedText(ops);

    for (const order of permutations([...ops, ...ops])) {
      expect(replay(order).text()).toBe(expected);
    }
  });
});

describe("random editing at three sites (seeded, so a failure can be repeated)", () => {
  interface Site {
    doc: Rga;
    /** Operations of the other sites that have not arrived here yet. */
    inbox: Edit[];
  }

  /**
   * Three sites edit and receive in a random order. An operation can reach a
   * site long after it was made, twice, and before the operations it needs.
   */
  function runRandomSession(seed: number, steps: number) {
    const random = createRandom(seed);
    const sites: Site[] = ["a", "b", "c"].map((name) => ({ doc: new Rga(name), inbox: [] }));
    const allOps: Edit[] = [];

    const makeOp = (site: Site): Edit => {
      const ids = site.doc.ids();
      if (ids.length > 0 && random() < 0.3) {
        // One character, or a range of up to four.
        const from = pickIndex(random, ids.length);
        return site.doc.delete(ids.slice(from, from + 1 + pickIndex(random, 4)));
      }
      const left = pickIndex(random, ids.length + 1);
      // One character, or a run of up to four typed in one go.
      const text = Array.from({ length: 1 + pickIndex(random, 4) }, () =>
        String.fromCharCode(97 + pickIndex(random, 26)),
      ).join("");
      return site.doc.insertAfter(left === 0 ? null : ids[left - 1], text);
    };

    while (allOps.length < steps) {
      const site = sites[pickIndex(random, sites.length)];
      if (random() < 0.5 || site.inbox.length === 0) {
        const op = makeOp(site);
        allOps.push(op);
        for (const other of sites.filter((candidate) => candidate !== site)) {
          other.inbox.push(op);
          if (random() < 0.2) {
            other.inbox.push(op); // The network sends it twice.
          }
        }
      } else {
        // Any waiting operation, not the oldest: the order is not kept.
        const [op] = site.inbox.splice(pickIndex(random, site.inbox.length), 1);
        site.doc.apply(op);
      }
    }

    for (const site of sites) {
      shuffled(site.inbox, random).forEach((op) => site.doc.apply(op));
    }
    return { sites, allOps, random };
  }

  it("200 operations: the three sites end with the same text (50 seeds)", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { sites, allOps } = runRandomSession(seed, 200);
      const expected = expectedText(allOps);

      for (const site of sites) {
        if (site.doc.text() !== expected || site.doc.waitingCount !== 0) {
          throw new Error(`seed ${seed}: site ${site.doc.site} has "${site.doc.text()}"`);
        }
      }
    }
  });

  it("a reader that gets the 200 operations in a shuffled order, some twice, has the same text", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { sites, allOps, random } = runRandomSession(seed, 200);

      for (let round = 0; round < 5; round += 1) {
        const withDuplicates = [...allOps, ...allOps.filter(() => random() < 0.3)];
        const reader = replay(shuffled(withDuplicates, random));

        expect(reader.text()).toBe(sites[0].doc.text());
        expect(reader.waitingCount).toBe(0);
      }
    }
  });

  it("2,000 operations still end the same", () => {
    const { sites, allOps } = runRandomSession(99, 2000);

    expect(sites[1].doc.text()).toBe(sites[0].doc.text());
    expect(sites[2].doc.text()).toBe(sites[0].doc.text());
    expect(sites[0].doc.text()).toBe(expectedText(allOps));
  });
});

describe("the caret, kept as an id", () => {
  it("is 0 for the start of the text", () => {
    const doc = new Rga("a");
    typeAtEnd(doc, "abc");

    expect(doc.caretIndex(null)).toBe(0);
  });

  it("stays after the same character when another site types before it", () => {
    const a = new Rga("a");
    const b = new Rga("b");
    typeAtEnd(a, "abc").forEach((op) => b.apply(op));
    const caret = b.ids()[1]; // After "b": index 2.

    typeAfter(a, null, "xyz").forEach((op) => b.apply(op));

    expect(b.text()).toBe("xyzabc");
    expect(b.caretIndex(caret)).toBe(5);
  });

  it("stays at the same place when the character on its left is deleted", () => {
    const doc = new Rga("a");
    typeAtEnd(doc, "abc");
    const caret = doc.ids()[1];

    doc.delete([caret]);

    expect(doc.caretIndex(caret)).toBe(1);
  });

  it("is 0 for an id that this document does not know", () => {
    const doc = new Rga("a");
    typeAtEnd(doc, "abc");

    expect(doc.caretIndex({ site: "nobody", counter: 9 })).toBe(0);
  });
});

describe("a run of characters in one edit", () => {
  it("is one edit with one id, and gives each character its own id", () => {
    const doc = new Rga("a");

    const edit = doc.insertAfter(null, "hello");

    expect(edit).toEqual({
      type: "insert",
      id: { site: "a", counter: 1 },
      after: null,
      text: "hello",
    });
    expect(doc.text()).toBe("hello");
    expect(doc.ids().map((id) => id.counter)).toEqual([1, 2, 3, 4, 5]);
    expect(doc.insertAfter(null, "x").id.counter).toBe(6);
  });

  it("gives an emoji two ids, one for each of its two halves", () => {
    const doc = new Rga("a");

    const edit = doc.insertAfter(null, "a😀b");

    expect(doc.text()).toBe("a😀b");
    expect(doc.ids()).toHaveLength(4);
    expect(doc.insertAfter(null, "x").id.counter).toBe(edit.id.counter + 4);
  });

  it("gives the same text as the same characters typed one by one", () => {
    const [a, b] = [new Rga("a"), new Rga("b")];
    const run = a.insertAfter(null, "hello");
    const single = typeAtEnd(b, "world");

    expect(replay([run, ...single]).text()).toBe(replay([...single, run]).text());
    expect(replay([run, ...single]).text()).toBe("worldhello");
  });

  it("lets another site type in the middle of the run", () => {
    const [a, b] = [new Rga("a"), new Rga("b")];
    const run = a.insertAfter(null, "held");
    b.apply(run);
    const inside = b.insertAfter(b.ids()[2], "lo wor");
    a.apply(inside);

    expect(a.text()).toBe("hello word");
    expect(replay([inside, run]).text()).toBe("hello word");
  });

  it("changes nothing when it arrives a second time", () => {
    const a = new Rga("a");
    const run = a.insertAfter(null, "abc");

    const doc = replay([run, run]);

    expect(doc.text()).toBe("abc");
    expect(doc.ids()).toHaveLength(3);
  });

  it("adds only the missing characters when a part of it is already there", () => {
    const whole: InsertEdit = {
      type: "insert",
      id: { site: "a", counter: 1 },
      after: null,
      text: "abcd",
    };
    const firstHalf: InsertEdit = { ...whole, text: "ab" };

    expect(replay([firstHalf, whole]).text()).toBe("abcd");
    expect(replay([whole, firstHalf]).text()).toBe("abcd");
  });

  it("waits as a whole for the character on its left", () => {
    const a = new Rga("a");
    const first = a.insertAfter(null, "ab");
    const second = a.insertAfter(a.ids()[1], "cd");
    const doc = new Rga("reader");

    doc.apply(second);
    expect(doc.text()).toBe("");
    doc.apply(first);

    expect(doc.text()).toBe("abcd");
    expect(doc.waitingCount).toBe(0);
  });

  it("deletes a range in one edit, also the part whose insert has not arrived yet", () => {
    const a = new Rga("a");
    const first = a.insertAfter(null, "ab");
    const second = a.insertAfter(a.ids()[1], "cd");
    const remove = a.delete(a.ids().slice(1, 3)); // "b" and "c"
    const doc = new Rga("reader");

    doc.apply(first);
    doc.apply(remove);
    expect(doc.text()).toBe("a");
    expect(doc.waitingCount).toBe(1);
    doc.apply(second);

    expect(doc.text()).toBe("ad");
  });

  it("every order of four runs and two range deletes gives the same text", () => {
    const [a, b, c] = [new Rga("a"), new Rga("b"), new Rga("c")];
    const base = a.insertAfter(null, "abcd");
    [b, c].forEach((doc) => doc.apply(base));
    const edits: Edit[] = [
      base,
      a.insertAfter(a.ids()[1], "XY"),
      b.insertAfter(b.ids()[1], "pq"),
      c.delete(c.ids().slice(1, 3)),
      b.delete(b.ids().slice(0, 2)),
      c.insertAfter(c.ids()[1], "!!"),
    ];
    const expected = expectedText(edits);

    for (const order of permutations(edits)) {
      expect(replay(order).text()).toBe(expected);
    }
  });
});

describe("the index (why it holds at scale)", () => {
  it("keeps the text between two changes, and builds a new one after a change", () => {
    const doc = new Rga("a");
    doc.insertAfter(null, "abc");
    const first = doc.text();

    expect(doc.text()).toBe(first);
    doc.delete([doc.ids()[0]]);

    expect(doc.text()).toBe("bc");
  });

  it("applies an edit in a text of 200,000 characters without walking over the text", () => {
    const doc = new Rga("a");
    doc.insertAfter(null, "x".repeat(200_000));
    const ids = doc.ids();
    const remote = new Rga("b");
    remote.apply({
      type: "insert",
      id: { site: "a", counter: 1 },
      after: null,
      text: "x".repeat(200_000),
    });
    const edits = Array.from({ length: 2000 }, (_, index) =>
      remote.insertAfter(ids[index * 100], "y"),
    );

    const startedAt = performance.now();
    edits.forEach((edit) => doc.apply(edit));
    const msForEach = (performance.now() - startedAt) / edits.length;

    // A walk over 200,000 characters takes about a millisecond. This takes
    // a few microseconds. The limit is wide, so a slow machine still passes.
    expect(msForEach).toBeLessThan(0.2);
    expect(doc.text()).toHaveLength(202_000);
  });
});

describe("visibleAtOrBefore", () => {
  it("is the character itself when the user sees it", () => {
    const doc = new Rga("a");
    doc.insertAfter(null, "abc");
    const [, b] = doc.ids();

    expect(doc.visibleAtOrBefore(b)).toEqual(b);
  });

  it("is the nearest shown character on the left of a deleted one", () => {
    const doc = new Rga("a");
    doc.insertAfter(null, "abcd");
    const [a, b, c] = doc.ids();
    doc.delete([b, c]);

    expect(doc.visibleAtOrBefore(c)).toEqual(a);
  });

  it("is null when nothing on the left is shown, or the id is not known", () => {
    const doc = new Rga("a");
    doc.insertAfter(null, "ab");
    const [a] = doc.ids();
    doc.delete([a]);

    expect(doc.visibleAtOrBefore(a)).toBeNull();
    expect(doc.visibleAtOrBefore({ site: "nobody", counter: 4 })).toBeNull();
  });
});
