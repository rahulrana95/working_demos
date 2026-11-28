/*
 * PART OF THE INTERVIEW: yes (about 20 minutes).
 * Write it after the CRDT. It is everything around the document that has no
 * UI: what to send, what was already received, what to do after a train
 * tunnel, where the caret is, and undo.
 *
 * Why it holds at scale:
 *   1. Fast typing is one operation, not one per key press: edits wait a
 *      short time, and a run of characters is joined into one insert.
 *   2. After a long time offline we ask only for what we miss. The server
 *      reads our version vector and does not send the whole document.
 *   3. An operation is applied once: `seq` must be the next number for its
 *      site. A repeat is dropped. A gap makes us ask again.
 */
import { idsOf, Rga } from "./rga";
import { diffText } from "./textChange";
import type { Connection, Edit, Id, Op, ServerMessage, VersionVector } from "./types";

export interface SessionOptions {
  /** A name no other editor of this document has, for example a random id per tab. */
  site: string;
  /** How long edits wait to be joined and sent, in milliseconds. */
  flushMs?: number;
}

/** What one change of the user did, so it can be taken back. */
interface UndoEntry {
  inserted: Id[];
  removed: Id[];
  removedText: string;
}

const MAX_UNDO = 100;

/** Joins an edit to the one before it, when they are one run of typing or deleting. */
function joinEdits(last: Edit | undefined, edit: Edit): Edit | null {
  if (last?.type === "delete" && edit.type === "delete") {
    return { type: "delete", ids: [...last.ids, ...edit.ids] };
  }
  if (last?.type === "insert" && edit.type === "insert" && edit.after !== null) {
    const next = last.id.counter + last.text.length;
    const follows = edit.after.site === last.id.site && edit.after.counter === next - 1;
    if (follows && edit.id.site === last.id.site && edit.id.counter === next) {
      return { ...last, text: last.text + edit.text };
    }
  }
  return null;
}

export class CollabSession {
  readonly site: string;
  readonly doc: Rga;
  private readonly flushMs: number;
  private seq = 0;
  /** What we have from every other site. */
  private readonly vector: VersionVector = {};
  /** Edits of the user that have no `seq` yet. */
  private unsent: Edit[] = [];
  /** Operations that the server has not acknowledged. They survive going offline. */
  private outbox: Op[] = [];
  private undoStack: UndoEntry[] = [];
  private connection: Connection | null = null;
  /** True after the server answered our hello. Before that we send no operations. */
  private synced = false;
  /** The two ends of the selection, as the ids of the characters on their left. */
  private caret: { start: Id | null; end: Id | null } = { start: null, end: null };
  private readonly listeners = new Set<() => void>();
  private changes = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor({ site, flushMs = 50 }: SessionOptions) {
    this.site = site;
    this.flushMs = flushMs;
    this.doc = new Rga(site);
  }

  /** The user changed the text of the textarea. */
  edit(newText: string, caret: number): void {
    const oldText = this.doc.text();
    const change = diffText(oldText, newText, caret);
    const ids = this.doc.ids();
    const removed = ids.slice(change.start, change.start + change.removed);
    const edits: Edit[] = removed.length > 0 ? [this.doc.delete(removed)] : [];
    let inserted: Id[] = [];
    if (change.inserted !== "") {
      const left = change.start === 0 ? null : ids[change.start - 1];
      const insert = this.doc.insertAfter(left, change.inserted);
      edits.push(insert);
      inserted = idsOf(insert);
    }
    if (edits.length > 0) {
      const removedText = oldText.slice(change.start, change.start + change.removed);
      this.undoStack = [...this.undoStack.slice(1 - MAX_UNDO), { inserted, removed, removedText }];
      this.commit(edits);
    }
  }

  /** Takes back the last change of this user. Changes of other people stay. */
  undo(): void {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return;
    }
    const edits: Edit[] = entry.inserted.length > 0 ? [this.doc.delete(entry.inserted)] : [];
    if (entry.removedText !== "") {
      // The deleted characters are still in the list as tombstones. The new
      // copy goes after the nearest character on their left that is shown.
      const left = this.doc.visibleAtOrBefore(entry.removed[0]);
      edits.push(this.doc.insertAfter(left, entry.removedText));
    }
    this.commit(edits);
  }

  /** The user moved the caret. Kept as ids, so remote edits do not move it. */
  setSelection(start: number, end: number): void {
    const ids = this.doc.ids();
    this.caret = { start: ids[start - 1] ?? null, end: ids[end - 1] ?? null };
  }

  selection(): { start: number; end: number } {
    return {
      start: this.doc.caretIndex(this.caret.start),
      end: this.doc.caretIndex(this.caret.end),
    };
  }

  /** The line to the server is open. Say what we have, then wait for "sync". */
  connect(connection: Connection): void {
    this.connection = connection;
    this.synced = false;
    this.flush();
    connection.send({ type: "hello", site: this.site, vector: { ...this.vector } });
    this.notify();
  }

  disconnect(): void {
    this.connection = null;
    this.synced = false;
    this.notify();
  }

  /** A message from the server. */
  receive(message: ServerMessage): void {
    if (this.connection === null) {
      return; // A late message of a line that is closed.
    }
    if (message.type === "sync") {
      // The server tells us which of our operations it has. Send the rest.
      this.outbox = this.outbox.filter((op) => op.seq > message.ack);
      this.synced = true;
      if (this.outbox.length > 0) {
        this.connection.send({ type: "ops", ops: this.outbox });
      }
    }
    if (message.type === "ack") {
      this.outbox = this.outbox.filter((op) => op.seq > message.seq);
    } else {
      this.applyRemote(message.ops);
    }
    this.notify();
  }

  get isOnline(): boolean {
    return this.connection !== null;
  }

  /** How many operations wait for the server. */
  get pendingCount(): number {
    return this.outbox.length + this.unsent.length;
  }

  /** Arrow functions, so React can use them as they are. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A number that grows with every change. */
  version = (): number => this.changes;

  /** Stops the timers. Call it when the editor is closed. */
  dispose(): void {
    clearTimeout(this.flushTimer);
    this.listeners.clear();
  }

  private applyRemote(ops: Op[]): void {
    for (const op of ops) {
      const expected = (this.vector[op.site] ?? 0) + 1;
      if (op.seq > expected) {
        // Something before it is missing. Ask the server again.
        this.synced = false;
        this.connection?.send({ type: "hello", site: this.site, vector: { ...this.vector } });
        return;
      }
      if (op.seq === expected) {
        this.doc.apply(op);
        this.vector[op.site] = op.seq;
      }
    }
  }

  private commit(edits: Edit[]): void {
    for (const edit of edits) {
      const joined = joinEdits(this.unsent[this.unsent.length - 1], edit);
      this.unsent.splice(joined === null ? this.unsent.length : -1, 1, joined ?? edit);
    }
    this.flushTimer ??= setTimeout(() => this.flush(), this.flushMs);
    this.notify();
  }

  /** Gives the waiting edits their `seq` and sends them. */
  private flush(): void {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    const ops = this.unsent.map((edit) => ({ ...edit, site: this.site, seq: ++this.seq }));
    this.unsent = [];
    this.outbox.push(...ops);
    if (this.synced && ops.length > 0) {
      this.connection?.send({ type: "ops", ops });
    }
  }

  private notify(): void {
    this.changes += 1;
    this.listeners.forEach((listener) => listener());
  }
}
