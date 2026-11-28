/*
 * NOT PART OF THE INTERVIEW: production version.
 * The queue of edits that the server has not answered yet. It has no React
 * in it. The hook draws the queue on top of the confirmed events.
 *
 * Why a queue and not one request for each edit:
 *   1. Order. Edits are sent one at a time, in the order the user made them.
 *      Two saves of one event can never arrive the wrong way round.
 *   2. Offline. When the server cannot be reached, the edit stays in the
 *      queue and on screen. It is sent again when the browser says it is
 *      online, when the tab is shown again, when the user makes the next
 *      edit, or when the user presses "Send now". There is no timer that
 *      tries again and again.
 *   3. Reload. The queue is kept in localStorage, so an edit made offline is
 *      still there after the tab is closed and opened again.
 */
import { withTimeout } from "./timeout";
import { TimeoutError } from "./timeout";
import { ConflictError, OfflineError } from "./types";
import type { CalendarEvent } from "./types";

export interface QueuedWrite {
  /** The id of the event. */
  id: string;
  /** The event to store. `null` means "delete this event". */
  event: CalendarEvent | null;
  /** What the user did, for monitoring. */
  action: "create" | "move" | "delete";
  by: "drag" | "keyboard" | "form";
  /** When the user did it, as a timestamp. */
  startedAt: number;
}

export type WriteResult =
  | { status: "saved"; event: CalendarEvent | null }
  /** Someone else changed the event first. `current` is the server's version. */
  | { status: "conflict"; current: CalendarEvent | null }
  /** The server refused. The edit is dropped. */
  | { status: "failed" };

export interface WriteQueueOptions {
  /** Sends one write. Resolves with the stored event, or null after a delete. */
  send: (write: QueuedWrite, signal: AbortSignal) => Promise<CalendarEvent | null>;
  /** Called once for every write that left the queue, with how it ended. */
  onResult: (write: QueuedWrite, result: WriteResult) => void;
  /** Called whenever the queue, or whether it waits for the connection, has changed. */
  onChange: () => void;
  timeoutMs: number;
  /** Where the queue is kept between visits. `null` keeps it in memory only. */
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  storageKey: string;
}

export class WriteQueue {
  private items: QueuedWrite[] = [];
  private isSending = false;
  private isStopped = false;
  /** True when the head of the queue could not reach the server and waits to be sent again. */
  isWaiting = false;

  constructor(private readonly options: WriteQueueOptions) {
    try {
      const saved: unknown = JSON.parse(options.storage?.getItem(options.storageKey) ?? "[]");
      this.items = Array.isArray(saved) ? saved : [];
    } catch {
      // Storage that cannot be read (private mode, broken text) is an empty queue.
    }
  }

  /** The writes that are not answered yet, oldest first. */
  get writes(): readonly QueuedWrite[] {
    return this.items;
  }

  add(write: QueuedWrite): void {
    // The write in flight is left alone. A write of the same event that still waits is replaced.
    const firstFree = this.isSending ? 1 : 0;
    const index = this.items.findIndex((item, at) => at >= firstFree && item.id === write.id);
    const replaced = index === -1 ? undefined : this.items[index];

    if (replaced?.action === "create" && write.event === null) {
      // The server never saw this event. Deleting it needs no request at all.
      this.items.splice(index, 1);
    } else if (replaced !== undefined) {
      // It is still a new event for the server if the write it replaces was one.
      this.items[index] = {
        ...write,
        action: replaced.action === "create" ? "create" : write.action,
      };
    } else {
      this.items.push(write);
    }
    this.changed();
    void this.flush();
  }

  /** Sends the queue, oldest first, until it is empty or the server cannot be reached. */
  async flush(): Promise<void> {
    if (this.isSending || this.isStopped) {
      return;
    }
    this.isSending = true;
    this.isWaiting = false;

    while (this.items.length > 0 && !this.isStopped) {
      const write = this.items[0];
      const result = await this.sendOne(write);
      if (result === "unreachable") {
        this.isWaiting = true;
        break;
      }
      this.items.shift();
      if (result.status === "saved" && result.event !== null) {
        // Later edits of this event were made on the old version. Give them the new one.
        const { updatedAt } = result.event;
        this.items = this.items.map((item) =>
          item.id === write.id && item.event !== null
            ? { ...item, event: { ...item.event, updatedAt } }
            : item,
        );
      }
      if (result.status === "conflict") {
        // Later edits of this event were made on a version that lost.
        this.items = this.items.filter((item) => item.id !== write.id);
      }
      // After `stop` nobody listens. The write still leaves the saved queue below.
      if (!this.isStopped) {
        this.options.onResult(write, result);
      }
      this.changed();
    }
    this.isSending = false;
    this.changed();
  }

  /**
   * Stops sending. A request in flight is not aborted, so that edit still
   * reaches the server. What is left stays in storage for the next visit.
   */
  stop(): void {
    this.isStopped = true;
  }

  private async sendOne(write: QueuedWrite): Promise<WriteResult | "unreachable"> {
    try {
      const event = await withTimeout(
        (signal) => this.options.send(write, signal),
        this.options.timeoutMs,
      );
      return { status: "saved", event };
    } catch (error) {
      if (error instanceof ConflictError) {
        return { status: "conflict", current: error.current };
      }
      // After a timeout we do not know if the server got the edit. Sending it
      // again is safe: a save replaces the event with the same id.
      return error instanceof OfflineError || error instanceof TimeoutError
        ? "unreachable"
        : { status: "failed" };
    }
  }

  private changed(): void {
    try {
      this.options.storage?.setItem(this.options.storageKey, JSON.stringify(this.items));
    } catch {
      // A full or blocked storage must not break the calendar. The queue still works in memory.
    }
    if (!this.isStopped) {
      this.options.onChange();
    }
  }
}
