/*
 * NOT PART OF THE INTERVIEW: production version.
 * The one interface the editor talks to. Two engines implement it: the CRDT
 * of the interview answers, and operational transformation (OT). The editor
 * does not know which one it has.
 */

/** Another person's caret, as places in the text of this editor. */
export interface PeerCaret {
  site: string;
  name: string;
  start: number;
  end: number;
}

/**
 * What the engines tell the monitoring. No event holds text from the
 * document, a name or an id: only counts, times and fixed words.
 */
export type CollabEvent =
  | { type: "op_sent"; ops: number; characters: number }
  | { type: "op_received"; ops: number; characters: number }
  | { type: "sync_started" }
  | { type: "sync_finished"; durationMs: number; sent: number; received: number }
  | { type: "divergence_detected" }
  | { type: "edit_rejected"; reason: "too_long" }
  | { type: "tombstones_collected"; count: number };

export interface EngineOptions {
  /** A name no other editor of this document has, for example a random id per tab. */
  site: string;
  /** The name that other people see next to this caret. */
  name: string;
  /** How long edits wait to be joined and sent, in milliseconds. */
  flushMs?: number;
  /** The shortest time between two caret messages, in milliseconds. */
  presenceMs?: number;
  /** The shortest time between two "this is what I have" messages, in milliseconds. */
  seenMs?: number;
  /** A local edit that would make the text longer than this is refused. */
  maxLength?: number;
  onEvent?: (event: CollabEvent) => void;
}

export const DEFAULT_MAX_LENGTH = 200_000;

/** The open line to the server. The owner of the line calls `engine.receive`. */
export interface Connection<ClientMessage> {
  send(message: ClientMessage): void;
}

/** The half of an engine that the editor component uses. */
export interface EditorEngine {
  readonly site: string;
  /** The text that the user sees. */
  text(): string;
  /** The user changed the text of the textarea. */
  edit(newText: string, caret: number): void;
  /** The user moved the caret. */
  setSelection(start: number, end: number): void;
  /** Where the caret is now, after every local and remote change. */
  selection(): { start: number; end: number };
  /** The carets of the other people. An engine without presence gives none. */
  peers(): PeerCaret[];
  /** Takes back the last change of this user. An engine without undo does nothing. */
  undo(): void;
  /**
   * True while the user builds a character with an input method (Hindi,
   * Japanese, Chinese). Remote changes wait until it is false again, because
   * a new value in the textarea would break the character that is being built.
   */
  setComposing(composing: boolean): void;
  /** How many remote changes were applied so far. The editor uses it to tell a screen reader. */
  remoteChanges(): number;
  readonly isOnline: boolean;
  /** How many changes wait for the server. */
  readonly pendingCount: number;
  /** Arrow functions in the engines, so React can use them as they are. */
  subscribe: (listener: () => void) => () => void;
  /** A number that grows with every change. */
  version: () => number;
  /** Stops the timers. Call it when the editor is closed. */
  dispose(): void;
}

/** A whole engine: the half for the editor, and the half for the network. */
export interface CollabEngine<ClientMessage, ServerMessage> extends EditorEngine {
  connect(connection: Connection<ClientMessage>): void;
  disconnect(): void;
  receive(message: ServerMessage): void;
}
