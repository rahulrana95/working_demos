/*
 * PART OF THE INTERVIEW: yes (about 20 minutes).
 * This is the heart of the answer. Write it before any UI, and talk through
 * `integrate` while you write it.
 *
 * The document is a list of characters. Every character has an id, and a
 * deleted character stays in the list with `deleted: true` (a tombstone).
 * An insert says "put me after the character with this id", never "put me
 * at index 5". An index means another place in every editor. An id does not.
 *
 * Why every editor ends with the same text:
 *   1. An insert is placed by ids only, so the order of arrival does not
 *      matter. Two inserts after the same character are sorted by id.
 *   2. A delete only sets a flag. Doing it twice changes nothing.
 *   3. An operation that arrives before the character it needs waits.
 *
 * Why it holds at scale: it does not, beyond about 10,000 characters. Finding
 * a character is a walk over the array, so `apply` is O(n). The 60-minute
 * answer adds an index that makes it O(1).
 */
import type { DeleteOp, Id, InsertOp, Op } from "./types";

interface Element {
  id: Id;
  char: string;
  deleted: boolean;
}

/**
 * True when `a` goes before `b`, for two characters typed after the same
 * character. The higher counter goes first. Two editors can use the same
 * counter, and then the site name decides. Strings are compared by their
 * character codes, so the answer is the same in every browser language.
 */
export function goesFirst(a: Id, b: Id): boolean {
  return a.counter !== b.counter ? a.counter > b.counter : a.site > b.site;
}

function keyOf(id: Id): string {
  return `${id.counter}:${id.site}`;
}

export class Rga {
  private readonly elements: Element[] = [];
  /** Operations that arrived too early, by the key of the id they wait for. */
  private readonly waiting = new Map<string, Op[]>();
  /** The highest counter seen so far, in any id from any site. */
  private clock = 0;

  constructor(readonly site: string) {}

  /** Types one character here. Returns the operation to send to the others. */
  insertAfter(after: Id | null, char: string): InsertOp {
    // One more than every counter we have seen. So a new character always
    // has a higher counter than the character it comes after.
    const id = { site: this.site, counter: this.clock + 1 };
    const op: InsertOp = { type: "insert", id, after, char };
    this.apply(op);
    return op;
  }

  /** Deletes one character here. Returns the operation to send to the others. */
  delete(id: Id): DeleteOp {
    const op: DeleteOp = { type: "delete", id };
    this.apply(op);
    return op;
  }

  /** Applies an operation from here or from another editor. Safe to call twice. */
  apply(op: Op): void {
    // A list, not a function that calls itself: a long run of waiting
    // operations must not overflow the call stack.
    const todo = [op];
    for (let next = todo.pop(); next !== undefined; next = todo.pop()) {
      const arrived = next.type === "insert" ? this.integrate(next) : this.markDeleted(next);
      if (arrived) {
        todo.push(...(this.waiting.get(keyOf(next.id)) ?? []));
        this.waiting.delete(keyOf(next.id));
      }
    }
  }

  /** The text that the user sees. */
  text(): string {
    return this.elements.map((element) => (element.deleted ? "" : element.char)).join("");
  }

  /** The ids of the characters that the user sees, in order. */
  ids(): Id[] {
    return this.elements.filter((element) => !element.deleted).map((element) => element.id);
  }

  /**
   * Where a caret is that sits just after the character with this id.
   * null is the start of the text. A deleted character still gives a place:
   * the place where it was.
   */
  caretIndex(id: Id | null): number {
    const index = id === null ? -1 : this.indexOf(id);
    return this.elements.slice(0, index + 1).filter((element) => !element.deleted).length;
  }

  /** How many operations wait for a character that has not arrived yet. */
  get waitingCount(): number {
    return [...this.waiting.values()].reduce((count, ops) => count + ops.length, 0);
  }

  /** Puts a character in its place. Returns true when it is new in the list. */
  private integrate(op: InsertOp): boolean {
    this.clock = Math.max(this.clock, op.id.counter);
    if (this.indexOf(op.id) !== -1) {
      return false; // We have it already. The network sent it twice.
    }

    const leftIndex = op.after === null ? -1 : this.indexOf(op.after);
    if (op.after !== null && leftIndex === -1) {
      this.waitFor(op.after, op);
      return false;
    }

    // Start just after the left character. Walk over every character that
    // goes before the new one. Those are the characters that other editors
    // typed at the same place at the same time, and what was typed after them.
    // They all have a higher id. The first lower id is where we stop.
    let index = leftIndex + 1;
    while (index < this.elements.length && goesFirst(this.elements[index].id, op.id)) {
      index += 1;
    }
    this.elements.splice(index, 0, { id: op.id, char: op.char, deleted: false });
    return true;
  }

  private markDeleted(op: DeleteOp): boolean {
    const index = this.indexOf(op.id);
    if (index === -1) {
      this.waitFor(op.id, op); // The delete came before its insert.
    } else {
      this.elements[index].deleted = true;
    }
    return false;
  }

  private waitFor(id: Id, op: Op): void {
    this.waiting.set(keyOf(id), [...(this.waiting.get(keyOf(id)) ?? []), op]);
  }

  private indexOf(id: Id): number {
    return this.elements.findIndex(
      (element) => element.id.counter === id.counter && element.id.site === id.site,
    );
  }
}
