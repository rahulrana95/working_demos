/*
 * PART OF THE INTERVIEW: yes (about 4 minutes).
 * Write these types first. They are what travels between an editor and the
 * server.
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

/** A run of characters typed in one go. The first has `id`, the next `counter + 1`, and so on. */
export interface InsertEdit {
  type: "insert";
  id: Id;
  /** The character that was on the left of the run. null is the start of the text. */
  after: Id | null;
  text: string;
}

export interface DeleteEdit {
  type: "delete";
  ids: Id[];
}

export type Edit = InsertEdit | DeleteEdit;

/**
 * An edit on its way. `seq` numbers the operations of one site: 1, 2, 3,
 * with no gaps. A counter can have gaps, so it cannot show that something
 * is missing. `seq` can.
 */
export type Op = Edit & { site: string; seq: number };

/** For each site, the `seq` of its last operation that we have. */
export type VersionVector = Record<string, number>;

export type ClientMessage =
  /** "I am back. This is what I have." */
  { type: "hello"; site: string; vector: VersionVector } | { type: "ops"; ops: Op[] };

export type ServerMessage =
  /** The answer to hello: the last `seq` of yours that I have, and what you miss. */
  | { type: "sync"; ack: number; ops: Op[] }
  | { type: "ops"; ops: Op[] }
  | { type: "ack"; seq: number };

/** The open line to the server. The owner of the line calls `session.receive`. */
export interface Connection {
  send(message: ClientMessage): void;
}
