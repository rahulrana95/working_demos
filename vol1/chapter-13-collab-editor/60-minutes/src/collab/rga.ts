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
 *   3. An edit that arrives before the character it needs waits.
 *
 * Why it holds at scale:
 *   1. A Map finds a character by its id in O(1), and the list is linked,
 *      so putting a character in costs the same in a text of 100 and of
 *      100,000 characters.
 *   2. A pasted page is one edit with one id, not one edit per character.
 *   3. The text is built once after a change, and kept until the next one.
 */
import type { DeleteEdit, Edit, Id, InsertEdit } from "./types";

interface Node {
  id: Id;
  char: string;
  deleted: boolean;
  prev: Node | null;
  next: Node | null;
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

/**
 * The ids of the characters of one insert. One character is one UTF-16
 * unit, the unit a textarea counts its caret in. So an emoji has two ids.
 */
export function idsOf(edit: InsertEdit): Id[] {
  const length = edit.text.length;
  return Array.from({ length }, (_, index) => ({ ...edit.id, counter: edit.id.counter + index }));
}

export class Rga {
  /** A node before the first character. It is never shown. */
  private readonly head: Node = {
    id: { site: "", counter: 0 },
    char: "",
    deleted: true,
    prev: null,
    next: null,
  };
  private readonly nodes = new Map<string, Node>();
  /** Edits that arrived too early, by the key of the id they wait for. */
  private readonly waiting = new Map<string, Edit[]>();
  /** The highest counter seen so far, in any id from any site. */
  private clock = 0;
  private cachedText: string | null = "";

  constructor(readonly site: string) {}

  /** Types a run of characters here. Returns the edit to send to the others. */
  insertAfter(after: Id | null, text: string): InsertEdit {
    // One more than every counter we have seen. So a new character always
    // has a higher counter than the character it comes after.
    const id = { site: this.site, counter: this.clock + 1 };
    const edit: InsertEdit = { type: "insert", id, after, text };
    this.apply(edit);
    return edit;
  }

  /** Deletes characters here. Returns the edit to send to the others. */
  delete(ids: Id[]): DeleteEdit {
    const edit: DeleteEdit = { type: "delete", ids };
    this.apply(edit);
    return edit;
  }

  /** Applies an edit from here or from another editor. Safe to call twice. */
  apply(edit: Edit): void {
    // A list, not a function that calls itself: a long run of waiting
    // edits must not overflow the call stack.
    const todo = [edit];
    for (let next = todo.pop(); next !== undefined; next = todo.pop()) {
      const arrived = next.type === "insert" ? this.integrate(next) : this.markDeleted(next);
      for (const id of arrived) {
        todo.push(...(this.waiting.get(keyOf(id)) ?? []));
        this.waiting.delete(keyOf(id));
      }
    }
    this.cachedText = null;
  }

  /** The text that the user sees. */
  text(): string {
    if (this.cachedText === null) {
      const chars: string[] = [];
      for (let node = this.head.next; node !== null; node = node.next) {
        if (!node.deleted) {
          chars.push(node.char);
        }
      }
      this.cachedText = chars.join("");
    }
    return this.cachedText;
  }

  /** The ids of the characters that the user sees, in order. */
  ids(): Id[] {
    const ids: Id[] = [];
    for (let node = this.head.next; node !== null; node = node.next) {
      if (!node.deleted) {
        ids.push(node.id);
      }
    }
    return ids;
  }

  /**
   * Where a caret is that sits just after the character with this id.
   * null is the start of the text. A deleted character still gives a place:
   * the place where it was.
   */
  caretIndex(id: Id | null): number {
    const target = id === null ? undefined : this.nodes.get(keyOf(id));
    let index = 0;
    for (let node = this.head.next; target !== undefined && node !== null; node = node.next) {
      index += node.deleted ? 0 : 1;
      if (node === target) {
        return index;
      }
    }
    return 0;
  }

  /** The id of the character itself if the user sees it, or of the nearest one on its left that the user sees. */
  visibleAtOrBefore(id: Id): Id | null {
    let node = this.nodes.get(keyOf(id)) ?? null;
    while (node !== null && node.deleted) {
      node = node.prev;
    }
    return node === null ? null : node.id;
  }

  /** How many edits wait for a character that has not arrived yet. */
  get waitingCount(): number {
    return [...this.waiting.values()].reduce((count, edits) => count + edits.length, 0);
  }

  /** Puts a run of characters in its place. Returns the ids that are new in the list. */
  private integrate(edit: InsertEdit): Id[] {
    this.clock = Math.max(this.clock, edit.id.counter + edit.text.length - 1);
    if (edit.after !== null && !this.nodes.has(keyOf(edit.after))) {
      this.waitFor(edit.after, edit);
      return [];
    }
    // The check above says the left character is in the map, when there is one.
    let left = (edit.after !== null && this.nodes.get(keyOf(edit.after))) || this.head;

    const arrived: Id[] = [];
    for (const id of idsOf(edit)) {
      const known = this.nodes.get(keyOf(id));
      if (known !== undefined) {
        left = known; // We have it already. The network sent it twice.
        continue;
      }
      // Start just after the left character. Walk over every character that
      // goes before the new one. Those are the characters that other editors
      // typed at the same place at the same time, and what was typed after
      // them. They all have a higher id. The first lower id is where we stop.
      while (left.next !== null && goesFirst(left.next.id, id)) {
        left = left.next;
      }
      const char = edit.text[id.counter - edit.id.counter];
      const node: Node = { id, char, deleted: false, prev: left, next: left.next };
      if (left.next !== null) {
        left.next.prev = node;
      }
      left.next = node;
      this.nodes.set(keyOf(id), node);
      arrived.push(id);
      left = node;
    }
    return arrived;
  }

  private markDeleted(edit: DeleteEdit): Id[] {
    for (const id of edit.ids) {
      const node = this.nodes.get(keyOf(id));
      if (node === undefined) {
        this.waitFor(id, { type: "delete", ids: [id] }); // The delete came before its insert.
      } else {
        node.deleted = true;
      }
    }
    return [];
  }

  private waitFor(id: Id, edit: Edit): void {
    this.waiting.set(keyOf(id), [...(this.waiting.get(keyOf(id)) ?? []), edit]);
  }
}
