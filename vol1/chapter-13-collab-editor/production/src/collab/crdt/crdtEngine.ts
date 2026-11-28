/*
 * NOT PART OF THE INTERVIEW: production version.
 * The session of the 60-minute answer, behind the `CollabEngine` interface,
 * plus what the first week adds: carets of other people, events for
 * monitoring, a size limit, a check that two sites with the same operations
 * have the same text, removal of old tombstones, saving and loading, and
 * waiting while the user builds a character with an input method.
 *
 * Why it holds at scale:
 *   1. Fast typing is one operation, not one per key press: edits wait a
 *      short time, and a run of characters is joined into one insert.
 *   2. After a long time offline we ask only for what we miss. The server
 *      reads our version vector and does not send the whole document.
 *   3. An operation is applied once: `seq` must be the next number for its
 *      site. A repeat is dropped. A gap makes us ask again.
 *   4. Carets are sent at most once in `presenceMs`, however fast they move.
 *   5. A saved document is a snapshot, so opening it does not replay every
 *      key press since the document was made.
 */
import { DEFAULT_MAX_LENGTH } from "../engine";
import type { CollabEngine, CollabEvent, Connection, EngineOptions, PeerCaret } from "../engine";
import { hashText } from "../hash";
import { diffText } from "../textChange";
import { idsOf, keyOf, Rga } from "./rga";
import type { ClientMessage, Digest, Edit, Id, Op, Presence, SavedDocument } from "./types";
import type { ServerMessage, VersionVector } from "./types";

/** What one change of the user did, so it can be taken back. */
interface UndoEntry {
  inserted: Id[];
  /** Where the deleted text was: the first deleted character, or what is left of it. */
  removedAt: Id | null;
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

/** How many characters an operation adds or removes. Used in events, in place of the text. */
function sizeOf(ops: Op[]): number {
  return ops.reduce((sum, op) => sum + (op.type === "insert" ? op.text.length : op.ids.length), 0);
}

function sameVector(a: VersionVector, b: VersionVector): boolean {
  const sites = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...sites].every((site) => (a[site] ?? 0) === (b[site] ?? 0));
}

export class CrdtEngine implements CollabEngine<ClientMessage, ServerMessage> {
  readonly site: string;
  readonly doc: Rga;
  private readonly name: string;
  private readonly flushMs: number;
  private readonly presenceMs: number;
  private readonly seenMs: number;
  private readonly maxLength: number;
  private readonly onEvent: (event: CollabEvent) => void;
  private seq = 0;
  /** What we have from every other site. */
  private readonly vector: VersionVector = {};
  /** Edits of the user that have no `seq` yet. */
  private unsent: Edit[] = [];
  /** Operations that the server has not acknowledged. They survive going offline. */
  private outbox: Op[] = [];
  private undoStack: UndoEntry[] = [];
  private connection: Connection<ClientMessage> | null = null;
  /** True after the server answered our hello. Before that we send no operations. */
  private synced = false;
  private syncStartedAt = 0;
  /** The two ends of the selection, as the ids of the characters on their left. */
  private caret: { start: Id | null; end: Id | null } = { start: null, end: null };
  private readonly presences = new Map<string, Presence>();
  private composing = false;
  /** Messages that arrived while the user was building a character. */
  private held: ServerMessage[] = [];
  private remoteChangeCount = 0;
  private readonly listeners = new Set<() => void>();
  private changes = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private presenceTimer: ReturnType<typeof setTimeout> | undefined;
  private seenTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: EngineOptions, saved?: SavedDocument) {
    this.site = options.site;
    this.name = options.name;
    this.flushMs = options.flushMs ?? 50;
    this.presenceMs = options.presenceMs ?? 100;
    this.seenMs = options.seenMs ?? 500;
    this.maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
    this.onEvent = options.onEvent ?? (() => undefined);
    this.doc = new Rga(this.site);
    if (saved !== undefined) {
      if (saved.version !== 1 || saved.site !== this.site) {
        throw new Error("This saved document is for another site or another version.");
      }
      this.doc.load(saved.runs, saved.clock, saved.waiting);
      this.seq = saved.seq;
      Object.assign(this.vector, saved.vector);
      this.outbox = [...saved.outbox];
    }
  }

  text(): string {
    return this.doc.text();
  }

  edit(newText: string, caret: number): void {
    const oldText = this.doc.text();
    if (newText.length > this.maxLength && newText.length > oldText.length) {
      // Refuse it. The listeners draw again, so the textarea shows the old text.
      this.onEvent({ type: "edit_rejected", reason: "too_long" });
      this.notify();
      return;
    }
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
      const entry = { inserted, removedAt: removed[0] ?? null, removedText };
      this.undoStack = [...this.undoStack.slice(1 - MAX_UNDO), entry];
      this.commit(edits);
    }
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return;
    }
    const edits: Edit[] = entry.inserted.length > 0 ? [this.doc.delete(entry.inserted)] : [];
    if (entry.removedText !== "") {
      // Never after a tombstone: another site may have removed it already.
      // After the nearest character on its left that is shown.
      const left = entry.removedAt === null ? null : this.doc.visibleAtOrBefore(entry.removedAt);
      edits.push(this.doc.insertAfter(left, entry.removedText));
    }
    this.commit(edits);
  }

  setSelection(start: number, end: number): void {
    const ids = this.doc.ids();
    this.caret = { start: ids[start - 1] ?? null, end: ids[end - 1] ?? null };
    this.presenceTimer ??= setTimeout(() => {
      this.presenceTimer = undefined;
      if (this.synced) {
        const presence = { site: this.site, name: this.name, ...this.caret };
        this.connection?.send({ type: "presence", presence });
      }
    }, this.presenceMs);
  }

  selection(): { start: number; end: number } {
    return {
      start: this.doc.caretIndex(this.caret.start),
      end: this.doc.caretIndex(this.caret.end),
    };
  }

  peers(): PeerCaret[] {
    return [...this.presences.values()].map(({ site, name, start, end }) => ({
      site,
      name,
      start: this.doc.caretIndex(start),
      end: this.doc.caretIndex(end),
    }));
  }

  setComposing(composing: boolean): void {
    this.composing = composing;
    if (!composing) {
      const held = this.held;
      this.held = [];
      held.forEach((message) => this.receive(message));
    }
  }

  remoteChanges(): number {
    return this.remoteChangeCount;
  }

  /** The line to the server is open. Say what we have, then wait for "sync". */
  connect(connection: Connection<ClientMessage>): void {
    this.connection = connection;
    this.synced = false;
    this.flush();
    this.sayHello();
    this.notify();
  }

  disconnect(): void {
    this.connection = null;
    this.synced = false;
    this.held = [];
    this.presences.clear();
    this.notify();
  }

  receive(message: ServerMessage): void {
    if (this.connection === null) {
      return; // A late message of a line that is closed.
    }
    if (this.composing) {
      this.held.push(message);
      return;
    }
    switch (message.type) {
      case "sync": {
        // The server tells us which of our operations it has. Send the rest.
        this.outbox = this.outbox.filter((op) => op.seq > message.ack);
        this.synced = true;
        this.send(this.outbox);
        this.applyRemote(message.ops);
        this.sendSeen();
        this.setSelection(this.selection().start, this.selection().end);
        this.onEvent({
          type: "sync_finished",
          durationMs: Math.round(performance.now() - this.syncStartedAt),
          sent: this.outbox.length,
          received: message.ops.length,
        });
        break;
      }
      case "ops":
        this.applyRemote(message.ops);
        this.sendSeen();
        break;
      case "ack":
        this.outbox = this.outbox.filter((op) => op.seq > message.seq);
        break;
      case "presence":
        this.presences.set(message.presence.site, message.presence);
        break;
      case "left":
        this.presences.delete(message.site);
        break;
      case "digest":
        this.compareWith(message.digest);
        break;
      case "collect":
        this.collect(message.ids);
        break;
    }
    this.notify();
  }

  /**
   * Everything needed to open the document again later, in a small form.
   * Save it before the page closes, and pass it to the constructor.
   */
  save(): SavedDocument {
    this.flush();
    return {
      version: 1,
      site: this.site,
      seq: this.seq,
      clock: this.doc.highestCounter,
      vector: { ...this.vector },
      runs: this.doc.toRuns(),
      waiting: this.doc.waitingEdits(),
      outbox: [...this.outbox],
    };
  }

  get isOnline(): boolean {
    return this.connection !== null;
  }

  get pendingCount(): number {
    return this.outbox.length + this.unsent.length;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  version = (): number => this.changes;

  dispose(): void {
    clearTimeout(this.flushTimer);
    clearTimeout(this.presenceTimer);
    clearTimeout(this.seenTimer);
    this.listeners.clear();
  }

  private sayHello(): void {
    this.syncStartedAt = performance.now();
    this.onEvent({ type: "sync_started" });
    this.connection?.send({ type: "hello", site: this.site, vector: { ...this.vector } });
  }

  private applyRemote(ops: Op[]): void {
    const applied: Op[] = [];
    for (const op of ops) {
      const expected = (this.vector[op.site] ?? 0) + 1;
      if (op.seq > expected) {
        // Something before it is missing. Ask the server again.
        this.synced = false;
        this.sayHello();
        break;
      }
      if (op.seq === expected) {
        this.doc.apply(op);
        this.vector[op.site] = op.seq;
        applied.push(op);
      }
    }
    if (applied.length > 0) {
      this.remoteChangeCount += 1;
      this.onEvent({ type: "op_received", ops: applied.length, characters: sizeOf(applied) });
    }
  }

  /** Everything this site has, with its own operations in it. */
  private fullVector(): VersionVector {
    return { ...this.vector, [this.site]: this.seq };
  }

  /**
   * Tells the server what we have, at most once in `seenMs`. Our own waiting
   * edits go first: the server may only remove a tombstone when every
   * operation that was made before its site saw the delete has arrived.
   */
  private sendSeen(): void {
    this.seenTimer ??= setTimeout(() => {
      this.seenTimer = undefined;
      if (this.synced) {
        this.flush();
        const digest = {
          site: this.site,
          vector: this.fullVector(),
          hash: hashText(this.doc.text()),
        };
        this.connection?.send({ type: "seen", digest });
      }
    }, this.seenMs);
  }

  /** Two sites with the same operations must have the same text. */
  private compareWith(other: Digest): void {
    if (this.unsent.length > 0 || !sameVector(this.fullVector(), other.vector)) {
      return; // One of us has something the other has not. Nothing to compare.
    }
    if (hashText(this.doc.text()) !== other.hash || this.doc.waitingCount > 0) {
      this.onEvent({ type: "divergence_detected" });
    }
  }

  /** Removes tombstones that the server says no site needs. */
  private collect(ids: Id[]): void {
    // Our own notes may point at a tombstone that is about to go. Move each
    // one to the nearest shown character on its left, which is never removed.
    const dead = new Set(ids.map(keyOf));
    const moved = (id: Id | null) =>
      id !== null && dead.has(keyOf(id)) ? this.doc.visibleAtOrBefore(id) : id;
    this.caret = { start: moved(this.caret.start), end: moved(this.caret.end) };
    for (const [site, presence] of this.presences) {
      this.presences.set(site, {
        ...presence,
        start: moved(presence.start),
        end: moved(presence.end),
      });
    }
    this.undoStack = this.undoStack.map((entry) => ({
      ...entry,
      removedAt: moved(entry.removedAt),
    }));
    this.onEvent({ type: "tombstones_collected", count: this.doc.collect(ids) });
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
    this.send(ops);
  }

  private send(ops: Op[]): void {
    if (this.synced && this.connection !== null && ops.length > 0) {
      this.connection.send({ type: "ops", ops });
      this.onEvent({ type: "op_sent", ops: ops.length, characters: sizeOf(ops) });
    }
  }

  private notify(): void {
    this.changes += 1;
    this.listeners.forEach((listener) => listener());
  }
}
