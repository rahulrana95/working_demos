/*
 * PART OF THE INTERVIEW: yes (about 2 minutes).
 * Write these types first. They are what travels between the editors.
 */

/**
 * The name of one character. It never changes and is never used twice:
 * `site` is the editor that typed the character, and `counter` is a number
 * that only grows in that editor.
 */
export interface Id {
  site: string;
  counter: number;
}

export interface InsertOp {
  type: "insert";
  id: Id;
  /** The character that was on the left when this one was typed. null is the start of the text. */
  after: Id | null;
  char: string;
}

export interface DeleteOp {
  type: "delete";
  id: Id;
}

export type Op = InsertOp | DeleteOp;

/**
 * How operations leave and reach an editor. The network may deliver them
 * late, twice, or in another order. The document still ends up the same.
 */
export interface Transport {
  send(ops: Op[]): void;
  /** Returns a function that stops the listening. */
  subscribe(onOps: (ops: Op[]) => void): () => void;
}
