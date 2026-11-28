/*
 * NOT PART OF THE INTERVIEW: production version.
 * What travels between a CRDT editor and the server. The first half is the
 * 60-minute answer. The second half is new: carets of other people, what
 * each site has seen, and which tombstones can go.
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

/** Where another person is. The two ends are the ids of the characters on their left. */
export interface Presence {
  site: string;
  name: string;
  start: Id | null;
  end: Id | null;
}

/** "This is everything I have, and this is the hash of my text." */
export interface Digest {
  site: string;
  /** With the site's own operations in it. */
  vector: VersionVector;
  hash: number;
}

export type ClientMessage =
  /** "I am back. This is what I have." */
  | { type: "hello"; site: string; vector: VersionVector }
  | { type: "ops"; ops: Op[] }
  | { type: "presence"; presence: Presence }
  /** Sent after remote operations were applied. The server uses it to find old tombstones. */
  | { type: "seen"; digest: Digest };

export type ServerMessage =
  /** The answer to hello: the last `seq` of yours that I have, and what you miss. */
  | { type: "sync"; ack: number; ops: Op[] }
  | { type: "ops"; ops: Op[] }
  | { type: "ack"; seq: number }
  | { type: "presence"; presence: Presence }
  | { type: "left"; site: string }
  /** What another site has, to compare hashes with. */
  | { type: "digest"; digest: Digest }
  /** Tombstones that no site needs any more. */
  | { type: "collect"; ids: Id[] };

/**
 * One piece of a snapshot: characters of one site with counters that follow
 * each other. A string is text that is shown. A number is that many deleted
 * characters, whose letters are not kept.
 */
export type SnapshotRun = [site: string, counter: number, content: string | number];

/** Everything an editor needs to start again without the old operations. */
export interface SavedDocument {
  version: 1;
  site: string;
  /** The `seq` of the last operation this site made. */
  seq: number;
  /** The highest counter this site has seen. Never lower after a load: an id must not be used twice. */
  clock: number;
  vector: VersionVector;
  /** The characters in the order of the document, tombstones too. */
  runs: SnapshotRun[];
  /** Edits that still wait for a character. */
  waiting: Edit[];
  /** Operations the server has not acknowledged. */
  outbox: Op[];
}
