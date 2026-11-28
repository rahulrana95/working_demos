/*
 * NOT PART OF THE INTERVIEW: production version.
 * Operational transformation (OT), the other way to build this editor.
 * An operation is an index, as in the first wrong answer of the chapter:
 * "insert at 5". The index is made right again by `transform`: when another
 * operation was applied first, shift this one so it still does what its
 * author meant.
 *
 * The functions here are pure. They need a server that puts all operations
 * in one order. See `otEngine.ts` and `server/otServer.ts`.
 */

export type OtOp =
  | { type: "insert"; pos: number; text: string }
  | { type: "delete"; pos: number; length: number };

export function applyOp(text: string, op: OtOp): string {
  return op.type === "insert"
    ? text.slice(0, op.pos) + op.text + text.slice(op.pos)
    : text.slice(0, op.pos) + text.slice(op.pos + op.length);
}

export function applyOps(text: string, ops: OtOp[]): string {
  return ops.reduce(applyOp, text);
}

/**
 * Changes `op` so that it can be applied after `other`, when both were made
 * on the same text. The answer can be no operation (the text to delete is
 * gone already) or two (an insert landed in the middle of the range to
 * delete).
 *
 * `opIsFirst` settles two inserts at the same place: the one that is first
 * stays on the left. Every site and the server must agree on who is first.
 * Here it is the site whose name sorts lower, so two words typed at the
 * same place at the same time do not mix letter by letter.
 */
export function transform(op: OtOp, other: OtOp, opIsFirst: boolean): OtOp[] {
  if (other.type === "insert") {
    const shift = other.text.length;
    if (op.type === "insert") {
      const staysLeft = op.pos < other.pos || (op.pos === other.pos && opIsFirst);
      return [staysLeft ? op : { ...op, pos: op.pos + shift }];
    }
    if (other.pos <= op.pos) {
      return [{ ...op, pos: op.pos + shift }];
    }
    if (other.pos >= op.pos + op.length) {
      return [op];
    }
    // The insert is inside the range. Delete what is on its left, then what
    // is on its right. After the first delete, the right part starts just
    // after the inserted text.
    const leftLength = other.pos - op.pos;
    return [
      { type: "delete", pos: op.pos, length: leftLength },
      { type: "delete", pos: op.pos + shift, length: op.length - leftLength },
    ];
  }

  const otherEnd = other.pos + other.length;
  if (op.type === "insert") {
    if (op.pos <= other.pos) {
      return [op];
    }
    // After the deleted range: move left. Inside it: land where the range was.
    return [{ ...op, pos: op.pos >= otherEnd ? op.pos - other.length : other.pos }];
  }

  const opEnd = op.pos + op.length;
  if (opEnd <= other.pos) {
    return [op];
  }
  if (op.pos >= otherEnd) {
    return [{ ...op, pos: op.pos - other.length }];
  }
  // The two ranges overlap. Delete only what `other` left.
  const overlap = Math.min(opEnd, otherEnd) - Math.max(op.pos, other.pos);
  const length = op.length - overlap;
  return length === 0 ? [] : [{ type: "delete", pos: Math.min(op.pos, other.pos), length }];
}

/**
 * Transforms two lists of operations against each other. Both were made on
 * the same text. Returns `a` to apply after `b`, and `b` to apply after `a`.
 */
export function transformLists(a: OtOp[], b: OtOp[], aIsFirst: boolean): [OtOp[], OtOp[]] {
  if (a.length === 0 || b.length === 0) {
    return [a, b];
  }
  if (a.length === 1 && b.length === 1) {
    return [transform(a[0], b[0], aIsFirst), transform(b[0], a[0], !aIsFirst)];
  }
  if (a.length > 1) {
    const [head, bAfterHead] = transformLists([a[0]], b, aIsFirst);
    const [rest, bAfterAll] = transformLists(a.slice(1), bAfterHead, aIsFirst);
    return [[...head, ...rest], bAfterAll];
  }
  const [aAfterHead, head] = transformLists(a, [b[0]], aIsFirst);
  const [aAfterAll, rest] = transformLists(aAfterHead, b.slice(1), aIsFirst);
  return [aAfterAll, [...head, ...rest]];
}

/** Where a caret is after an operation of another person. */
export function transformIndex(index: number, op: OtOp): number {
  if (op.type === "insert") {
    // An insert at the caret goes to its right: the caret does not move.
    return op.pos < index ? index + op.text.length : index;
  }
  if (index <= op.pos) {
    return index;
  }
  return index >= op.pos + op.length ? index - op.length : op.pos;
}
