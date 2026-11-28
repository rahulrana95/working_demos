/*
 * NOT PART OF THE INTERVIEW.
 * Helpers for the tests: every order of a list, a random generator that
 * gives the same numbers on every run, and a second, slower way to compute
 * the text, to compare the real one with.
 */
import { goesFirst } from "./rga";
import type { Id, Op } from "./types";

/** Every order of the items. 6 items give 720 orders. */
export function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

/** A random generator with a seed (mulberry32). The same seed gives the same numbers. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickIndex(random: () => number, length: number): number {
  return Math.floor(random() * length);
}

export function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = pickIndex(random, index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function keyOf(id: Id | null): string {
  return id === null ? "start" : `${id.counter}:${id.site}`;
}

/**
 * The text that a set of operations must give, computed in another way than
 * the real code does it. It follows the description of RGA as a tree: each
 * character is a child of the character it was typed after, children are
 * sorted with the newest first, and the text is the tree read depth first.
 */
export function expectedText(ops: Op[]): string {
  const children = new Map<string, { id: Id; char: string }[]>();
  const deleted = new Set<string>();
  const seen = new Set<string>();

  for (const op of ops) {
    if (op.type === "delete") {
      deleted.add(keyOf(op.id));
    } else if (!seen.has(keyOf(op.id))) {
      seen.add(keyOf(op.id));
      const siblings = children.get(keyOf(op.after)) ?? [];
      siblings.push({ id: op.id, char: op.char });
      children.set(keyOf(op.after), siblings);
    }
  }

  let text = "";
  // A stack, with the next node to read on top.
  const stack = [...(children.get("start") ?? [])].sort((a, b) => (goesFirst(a.id, b.id) ? 1 : -1));
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (!deleted.has(keyOf(node.id))) {
      text += node.char;
    }
    const below = [...(children.get(keyOf(node.id)) ?? [])];
    stack.push(...below.sort((a, b) => (goesFirst(a.id, b.id) ? 1 : -1)));
  }
  return text;
}
