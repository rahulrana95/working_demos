/*
 * NOT PART OF THE INTERVIEW: production version.
 * How one user's board stays the same as everyone else's.
 *
 * The server puts every operation in one order and gives each a sequence
 * number. Every client applies the operations in that order, so every client
 * ends with the same scene. That is all the conflict handling there is:
 *   - Two people change the same value of a shape: the later number wins.
 *   - Two people change different values of a shape: both changes stay,
 *     because a command names only the values it changes.
 *   - Two people move the same shape: both moves stay, because a move is a
 *     distance, not a position.
 *
 * The user must not wait for the server. So their own operations show at
 * once: `scene` is the confirmed scene with the operations the server has
 * not confirmed yet applied on top. When an operation of someone else
 * arrives first, it goes under them, and they are applied again on top.
 */
import { apply, targetId } from "./commands";
import type { Command } from "./commands";
import type { Scene } from "./scene";

/** One command on its way to the server. The id makes a second delivery harmless. */
export interface Operation {
  id: string;
  userId: string;
  command: Command;
}

export interface SyncState {
  /** The scene after every operation the server has confirmed, in the server's order. */
  confirmed: Scene;
  /** The sequence number of the last confirmed operation. */
  lastSeq: number;
  /** This user's operations that the server has not confirmed yet, oldest first. */
  unconfirmed: Operation[];
  /** What the user sees: `confirmed` with `unconfirmed` applied on top. */
  scene: Scene;
}

export function createSync(scene: Scene, lastSeq = 0): SyncState {
  return { confirmed: scene, lastSeq, unconfirmed: [], scene };
}

function replay(scene: Scene, operations: Operation[]): Scene {
  return operations.reduce((current, operation) => apply(current, operation.command), scene);
}

/** Shows this user's own operation at once, before the server has seen it. */
export function addLocal(sync: SyncState, operation: Operation): SyncState {
  return {
    ...sync,
    unconfirmed: [...sync.unconfirmed, operation],
    scene: apply(sync.scene, operation.command),
  };
}

export interface ReceiveResult {
  sync: SyncState;
  /** True when someone else changed a shape that an unconfirmed operation of ours also changes. */
  isConflict: boolean;
}

/**
 * Takes one operation from the server.
 *
 * The transport must deliver operations in order, each exactly once, and
 * after a reconnect it must start again from `lastSeq + 1`. If it fails at
 * that, this function protects the scene: a number we already have is
 * ignored (no double apply), and a number that skips one is ignored too (the
 * missing one must come first).
 */
export function receive(sync: SyncState, seq: number, operation: Operation): ReceiveResult {
  if (seq !== sync.lastSeq + 1) {
    return { sync, isConflict: false };
  }
  const confirmed = apply(sync.confirmed, operation.command);
  // Our own operation came back: the server has it, so it is not waiting any more.
  const unconfirmed = sync.unconfirmed.filter((own) => own.id !== operation.id);
  const isOurs = unconfirmed.length < sync.unconfirmed.length;
  const isConflict =
    !isOurs && unconfirmed.some((own) => targetId(own.command) === targetId(operation.command));
  const scene = replay(confirmed, unconfirmed);
  return { sync: { confirmed, lastSeq: seq, unconfirmed, scene }, isConflict };
}
