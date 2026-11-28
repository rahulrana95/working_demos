/*
 * NOT PART OF THE INTERVIEW: production version.
 * The same editor with operational transformation behind it, to compare
 * with the CRDT. It is the smallest version that is correct: plain text,
 * one server, no carets of other people, no undo.
 *
 * How it works:
 *   1. A local edit is applied at once and kept in `buffer`.
 *   2. At most one submit is on its way (`inFlight`). The next one waits
 *      for the answer. So the server only ever has to transform against
 *      entries the site had not seen, and the site against its own two lists.
 *   3. An entry of another site is transformed against `inFlight` and
 *      `buffer` before it touches the text, and they are transformed against
 *      it, so they stay right for the next revision.
 */
import { DEFAULT_MAX_LENGTH } from "../engine";
import type { CollabEngine, CollabEvent, Connection, EngineOptions, PeerCaret } from "../engine";
import { diffText } from "../textChange";
import { applyOps, transformIndex, transformLists } from "./transform";
import type { OtOp } from "./transform";
import type { OtClientMessage, OtEntry, OtServerMessage } from "./types";

function sizeOf(ops: OtOp[]): number {
  return ops.reduce((sum, op) => sum + (op.type === "insert" ? op.text.length : op.length), 0);
}

export class OtEngine implements CollabEngine<OtClientMessage, OtServerMessage> {
  readonly site: string;
  private readonly maxLength: number;
  private readonly onEvent: (event: CollabEvent) => void;
  private content = "";
  /** How many entries of the server history are in `content`. */
  private revision = 0;
  private nextId = 1;
  /** The submit the server has not answered yet. */
  private inFlight: { id: number; ops: OtOp[] } | null = null;
  /** Local operations made after `inFlight` was sent. */
  private buffer: OtOp[] = [];
  private connection: Connection<OtClientMessage> | null = null;
  private synced = false;
  private syncStartedAt = 0;
  private caret = { start: 0, end: 0 };
  private composing = false;
  private held: OtServerMessage[] = [];
  private remoteChangeCount = 0;
  private readonly listeners = new Set<() => void>();
  private changes = 0;

  constructor(options: EngineOptions) {
    this.site = options.site;
    this.maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  text(): string {
    return this.content;
  }

  edit(newText: string, caret: number): void {
    if (newText.length > this.maxLength && newText.length > this.content.length) {
      this.onEvent({ type: "edit_rejected", reason: "too_long" });
      this.notify();
      return;
    }
    const change = diffText(this.content, newText, caret);
    const ops: OtOp[] = [];
    if (change.removed > 0) {
      ops.push({ type: "delete", pos: change.start, length: change.removed });
    }
    if (change.inserted !== "") {
      ops.push({ type: "insert", pos: change.start, text: change.inserted });
    }
    if (ops.length > 0) {
      this.content = newText;
      this.buffer.push(...ops);
      this.submit();
      this.notify();
    }
  }

  setSelection(start: number, end: number): void {
    this.caret = { start, end };
  }

  selection(): { start: number; end: number } {
    return this.caret;
  }

  /** This small engine does not send carets. */
  peers(): PeerCaret[] {
    return [];
  }

  /** This small engine has no undo. */
  undo(): void {}

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

  connect(connection: Connection<OtClientMessage>): void {
    this.connection = connection;
    this.sayHello();
    this.notify();
  }

  disconnect(): void {
    this.connection = null;
    this.synced = false;
    this.held = [];
    this.notify();
  }

  receive(message: OtServerMessage): void {
    if (this.connection === null) {
      return; // A late message of a line that is closed.
    }
    if (this.composing) {
      this.held.push(message);
      return;
    }
    const entries = message.type === "sync" ? message.entries : [message.entry];
    for (const entry of entries) {
      if (entry.revision === this.revision + 1) {
        this.applyEntry(entry);
      } else if (entry.revision > this.revision + 1) {
        this.sayHello(); // An entry is missing. Ask the server again.
        return;
      }
    }
    if (message.type === "sync") {
      this.synced = true;
      // The submit that was on its way is not in the history: it was lost.
      // Send it again, as it is now. If it is in the history, it was
      // answered above, and the next one can go.
      const sent = this.inFlight === null ? 0 : 1;
      this.resend();
      this.submit();
      this.onEvent({
        type: "sync_finished",
        durationMs: Math.round(performance.now() - this.syncStartedAt),
        sent,
        received: entries.length,
      });
    }
    this.notify();
  }

  get isOnline(): boolean {
    return this.connection !== null;
  }

  get pendingCount(): number {
    return (this.inFlight === null ? 0 : 1) + (this.buffer.length > 0 ? 1 : 0);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  version = (): number => this.changes;

  dispose(): void {
    this.listeners.clear();
  }

  private sayHello(): void {
    this.synced = false;
    this.syncStartedAt = performance.now();
    this.onEvent({ type: "sync_started" });
    this.connection?.send({ type: "hello", site: this.site, revision: this.revision });
  }

  private applyEntry(entry: OtEntry): void {
    this.revision = entry.revision;
    if (entry.site === this.site) {
      // Our own submit, in the history now. Our text has it already.
      if (this.inFlight?.id === entry.id) {
        this.inFlight = null;
        this.submit();
      }
      return;
    }
    // Two inserts at the same place: the lower site name stays on the left.
    const first = entry.site < this.site;
    const [afterInFlight, inFlight] = transformLists(entry.ops, this.inFlight?.ops ?? [], first);
    const [ops, buffer] = transformLists(afterInFlight, this.buffer, first);
    if (this.inFlight !== null) {
      this.inFlight = { ...this.inFlight, ops: inFlight };
    }
    this.buffer = buffer;
    this.content = applyOps(this.content, ops);
    this.caret = {
      start: ops.reduce(transformIndex, this.caret.start),
      end: ops.reduce(transformIndex, this.caret.end),
    };
    this.remoteChangeCount += 1;
    this.onEvent({ type: "op_received", ops: ops.length, characters: sizeOf(ops) });
  }

  /** Sends the buffer, when nothing is on its way. */
  private submit(): void {
    if (this.synced && this.inFlight === null && this.buffer.length > 0) {
      this.inFlight = { id: this.nextId, ops: this.buffer };
      this.nextId += 1;
      this.buffer = [];
      this.resend();
    }
  }

  private resend(): void {
    if (this.synced && this.connection !== null && this.inFlight !== null) {
      const { id, ops } = this.inFlight;
      this.connection.send({ type: "submit", site: this.site, id, revision: this.revision, ops });
      this.onEvent({ type: "op_sent", ops: ops.length, characters: sizeOf(ops) });
    }
  }

  private notify(): void {
    this.changes += 1;
    this.listeners.forEach((listener) => listener());
  }
}
