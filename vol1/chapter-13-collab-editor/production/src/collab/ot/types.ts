/*
 * NOT PART OF THE INTERVIEW: production version.
 * What travels between an OT editor and its server.
 */
import type { OtOp } from "./transform";

/** One change in the history of the server: the operations of one submit, already transformed. */
export interface OtEntry {
  site: string;
  /** The number the site gave this submit: 1, 2, 3. The site knows its own change by it. */
  id: number;
  /** The place of this entry in the history, from 1. */
  revision: number;
  ops: OtOp[];
}

export type OtClientMessage =
  /** "I am back. I have the history up to this revision." */
  | { type: "hello"; site: string; revision: number }
  /** Operations made on the text of the given revision. */
  | { type: "submit"; site: string; id: number; revision: number; ops: OtOp[] };

export type OtServerMessage =
  /** The answer to hello: every entry after the revision of the site. */
  | { type: "sync"; entries: OtEntry[] }
  /** A new entry. The site that sent it reads it as the acknowledgement. */
  | { type: "entry"; entry: OtEntry };
