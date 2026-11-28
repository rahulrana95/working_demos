/*
 * NOT PART OF THE INTERVIEW.
 * Helpers for the tests: promises resolved by hand, and a server that the test
 * answers by hand. That is how a test forces one answer to arrive before another.
 */
import type { CalendarEvent, CalendarServer } from "./types";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Call<TArgs, TResult> extends Deferred<TResult> {
  args: TArgs;
  signal: AbortSignal;
}

export interface ManualServer extends CalendarServer {
  loads: Call<{ rangeStart: string; rangeEnd: string }, CalendarEvent[]>[];
  saves: Call<CalendarEvent, CalendarEvent>[];
  deletes: Call<string, void>[];
}

/** A server that records every call and answers only when the test says so. */
export function createManualServer(): ManualServer {
  const server: ManualServer = {
    loads: [],
    saves: [],
    deletes: [],
    fetchEvents(rangeStart, rangeEnd, signal) {
      const call = { args: { rangeStart, rangeEnd }, signal, ...createDeferred<CalendarEvent[]>() };
      server.loads.push(call);
      return call.promise;
    },
    saveEvent(event, signal) {
      const call = { args: event, signal, ...createDeferred<CalendarEvent>() };
      server.saves.push(call);
      return call.promise;
    },
    deleteEvent(id, signal) {
      const call = { args: id, signal, ...createDeferred<void>() };
      server.deletes.push(call);
      return call.promise;
    },
  };
  return server;
}

/** A local time on 3 March 2026 (a Tuesday), as an ISO string in UTC. */
export function at(hour: number, minute = 0, day = 3): string {
  return new Date(2026, 2, day, hour, minute).toISOString();
}

export function makeEvent(id: string, start: string, end: string, title = id): CalendarEvent {
  return { id, title, start, end };
}
