/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tests for the transform function. The classic cases by name, then every
 * pair of operations on a short text.
 */
import { createRandom, pickIndex } from "../crdt/testHelpers";
import { applyOp, applyOps, transform, transformIndex, transformLists } from "./transform";
import type { OtOp } from "./transform";

const insert = (pos: number, text: string): OtOp => ({ type: "insert", pos, text });
const remove = (pos: number, length: number): OtOp => ({ type: "delete", pos, length });

/** Applies a and b in both orders, each transformed against the other. */
function bothOrders(text: string, a: OtOp, b: OtOp): [string, string] {
  const aThenB = applyOps(applyOp(text, a), transform(b, a, false));
  const bThenA = applyOps(applyOp(text, b), transform(a, b, true));
  return [aThenB, bThenA];
}

describe("applyOp", () => {
  it("inserts and deletes at an index", () => {
    expect(applyOp("held", insert(3, "lo wor"))).toBe("hello word");
    expect(applyOp("hello", remove(1, 3))).toBe("ho");
  });
});

describe("transform: the classic cases", () => {
  it("insert against an insert on its left: moves right", () => {
    expect(transform(insert(5, "x"), insert(2, "ab"), false)).toEqual([insert(7, "x")]);
  });

  it("insert against an insert on its right: stays", () => {
    expect(transform(insert(2, "x"), insert(5, "ab"), false)).toEqual([insert(2, "x")]);
  });

  it("two inserts at the same place: the first one stays on the left", () => {
    expect(transform(insert(3, "x"), insert(3, "y"), true)).toEqual([insert(3, "x")]);
    expect(transform(insert(3, "y"), insert(3, "x"), false)).toEqual([insert(4, "y")]);
    expect(bothOrders("abcdef", insert(3, "x"), insert(3, "y"))).toEqual(["abcxydef", "abcxydef"]);
  });

  it("insert against a delete on its left: moves left (the example of the chapter)", () => {
    // "I insert at index 5, and at the same moment you delete index 2."
    expect(transform(insert(5, "x"), remove(2, 1), false)).toEqual([insert(4, "x")]);
    expect(bothOrders("abcdefg", insert(5, "x"), remove(2, 1))).toEqual(["abdexfg", "abdexfg"]);
  });

  it("insert against a delete on its right: stays", () => {
    expect(transform(insert(1, "x"), remove(2, 3), false)).toEqual([insert(1, "x")]);
  });

  it("insert inside a deleted range: lands where the range was", () => {
    expect(transform(insert(4, "x"), remove(2, 4), false)).toEqual([insert(2, "x")]);
  });

  it("delete against an insert on its left: moves right", () => {
    expect(transform(remove(4, 2), insert(1, "ab"), false)).toEqual([remove(6, 2)]);
  });

  it("delete against an insert on its right: stays", () => {
    expect(transform(remove(1, 2), insert(3, "ab"), false)).toEqual([remove(1, 2)]);
  });

  it("delete against an insert inside its range: splits in two, and keeps the inserted text", () => {
    expect(transform(remove(2, 4), insert(4, "XY"), false)).toEqual([remove(2, 2), remove(4, 2)]);
    expect(bothOrders("abcdefgh", remove(2, 4), insert(4, "XY"))).toEqual(["abXYgh", "abXYgh"]);
  });

  it("delete against a delete on its left: moves left", () => {
    expect(transform(remove(5, 2), remove(1, 3), false)).toEqual([remove(2, 2)]);
  });

  it("delete against a delete of the same range: nothing is left to do", () => {
    expect(transform(remove(2, 3), remove(2, 3), false)).toEqual([]);
    expect(transform(remove(3, 1), remove(2, 3), false)).toEqual([]);
  });

  it("delete against a delete that overlaps: deletes only what is left", () => {
    expect(transform(remove(2, 4), remove(4, 4), false)).toEqual([remove(2, 2)]);
    expect(transform(remove(4, 4), remove(2, 4), false)).toEqual([remove(2, 2)]);
    expect(transform(remove(1, 6), remove(3, 2), false)).toEqual([remove(1, 4)]);
  });
});

describe("transform: every pair of operations on a short text", () => {
  function allOps(length: number): OtOp[] {
    const ops: OtOp[] = [];
    for (let pos = 0; pos <= length; pos += 1) {
      ops.push(insert(pos, "X"), insert(pos, "YZ"));
      for (let size = 1; pos + size <= length; size += 1) {
        ops.push(remove(pos, size));
      }
    }
    return ops;
  }

  it("both orders give the same text, for all 27 x 27 pairs on 'abcde'", () => {
    const ops = allOps(5);
    expect(ops).toHaveLength(27);

    for (const a of ops) {
      for (const b of ops) {
        const [aThenB, bThenA] = bothOrders("abcde", a, b);
        if (aThenB !== bThenA) {
          throw new Error(`${JSON.stringify(a)} and ${JSON.stringify(b)}: ${aThenB} / ${bThenA}`);
        }
      }
    }
  });

  it("an insert is never lost, and a deleted character never comes back", () => {
    for (const a of allOps(5)) {
      for (const b of allOps(5)) {
        const [result] = bothOrders("abcde", a, b);
        for (const op of [a, b]) {
          if (op.type === "insert") {
            expect(result).toContain(op.text);
          } else {
            for (const char of "abcde".slice(op.pos, op.pos + op.length)) {
              expect(result).not.toContain(char);
            }
          }
        }
      }
    }
  });
});

describe("transformLists", () => {
  it("returns the lists as they are when one of them is empty", () => {
    expect(transformLists([insert(0, "a")], [], true)).toEqual([[insert(0, "a")], []]);
  });

  it("both orders give the same text for random lists of operations (3,000 pairs, seeded)", () => {
    const random = createRandom(11);
    const randomOps = (start: string): OtOp[] => {
      const ops: OtOp[] = [];
      let text = start;
      for (let count = pickIndex(random, 4); count > 0; count -= 1) {
        const pos = pickIndex(random, text.length + 1);
        const op =
          text.length > pos && random() < 0.5
            ? remove(pos, 1 + pickIndex(random, text.length - pos))
            : insert(pos, "xyz".slice(pickIndex(random, 3)));
        ops.push(op);
        text = applyOp(text, op);
      }
      return ops;
    };

    for (let round = 0; round < 3000; round += 1) {
      const start = "abcdef".slice(pickIndex(random, 6));
      const a = randomOps(start);
      const b = randomOps(start);
      const [aAfterB, bAfterA] = transformLists(a, b, true);

      expect(applyOps(applyOps(start, a), bAfterA)).toBe(applyOps(applyOps(start, b), aAfterB));
    }
  });
});

describe("transformIndex", () => {
  it("moves a caret right when text is inserted before it", () => {
    expect(transformIndex(5, insert(2, "ab"))).toBe(7);
  });

  it("does not move a caret for an insert at the caret or after it", () => {
    expect(transformIndex(5, insert(5, "ab"))).toBe(5);
    expect(transformIndex(5, insert(8, "ab"))).toBe(5);
  });

  it("moves a caret left when text before it is deleted", () => {
    expect(transformIndex(5, remove(1, 2))).toBe(3);
  });

  it("puts a caret that was inside a deleted range at the start of the range", () => {
    expect(transformIndex(5, remove(3, 4))).toBe(3);
  });

  it("does not move a caret for a delete after it", () => {
    expect(transformIndex(2, remove(2, 3))).toBe(2);
  });
});
