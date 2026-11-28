/*
 * NOT PART OF THE INTERVIEW.
 * A fake server for the demo. It keeps the events in memory and answers after
 * a random delay, so an older request can finish after a newer one, like on a
 * real network.
 */
import type { CalendarEvent, CalendarServer } from "../calendar";

const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 600;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export interface FakeServerOptions {
  /** When this returns true, the next request fails. */
  shouldFail: () => boolean;
  /** Called for every request that reaches the server, with a short description. */
  onRequest: (description: string) => void;
}

export interface FakeServer extends CalendarServer {
  /** Puts `count` random events into the day that starts at `dayStart`. */
  addRandomEvents: (count: number, dayStart: number) => void;
  eventCount: () => number;
}

const iso = (timestamp: number) => new Date(timestamp).toISOString();

/** Waits for a random time. Rejects at once if the request is aborted. */
function randomDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timerId);
      reject(new DOMException("The request was aborted.", "AbortError"));
    };
    const timerId = setTimeout(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS),
    );
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
    }
  });
}

/** A day with a mix of events: some alone, some that overlap, some very short. */
export function createDemoEvents(dayStart: number): CalendarEvent[] {
  const at = (hour: number, minute = 0) => iso(dayStart + hour * HOUR_MS + minute * MINUTE_MS);
  const rows: [title: string, start: string, end: string][] = [
    ["Night deploy", at(-1), at(1)],
    ["Stand-up", at(9), at(9, 15)],
    // A overlaps B, and B overlaps C, but A and C do not overlap.
    ["Design review (A)", at(10), at(11)],
    ["Budget call (B)", at(10, 30), at(12)],
    ["Interview (C)", at(11), at(12)],
    ["Lunch", at(12), at(13)],
    ["Roadmap", at(14), at(16)],
    ["1:1 with Asha", at(14), at(14, 30)],
    ["1:1 with Ravi", at(14, 30), at(15)],
    ["Release check", at(15), at(15, 5)],
    ["Call with New York", at(18, 30), at(19, 30)],
    ["Flight to Delhi", at(22), at(26)],
  ];
  return rows.map(([title, start, end], index) => ({ id: `demo-${index}`, title, start, end }));
}

/**
 * Events on the two days of 2026 on which the clocks change in New York.
 * Their times are fixed instants, so they are right in every time zone.
 */
export function createClockChangeEvents(): CalendarEvent[] {
  const rows: [title: string, start: string, end: string][] = [
    // 8 March: 02:00 does not exist. 01:00 EST is 06:00 UTC, 03:00 EDT is 07:00 UTC.
    ["Deploy (01:00 to 03:00, one real hour)", "2026-03-08T06:00:00Z", "2026-03-08T07:00:00Z"],
    ["Brunch (11:00 to 12:00)", "2026-03-08T15:00:00Z", "2026-03-08T16:00:00Z"],
    // 1 November: 01:00 happens twice. 01:00 EDT is 05:00 UTC, 02:00 EST is 07:00 UTC.
    ["Backup (01:00 to 02:00, two real hours)", "2026-11-01T05:00:00Z", "2026-11-01T07:00:00Z"],
    ["Brunch (11:00 to 12:00)", "2026-11-01T16:00:00Z", "2026-11-01T17:00:00Z"],
  ];
  return rows.map(([title, start, end], index) => ({ id: `clock-${index}`, title, start, end }));
}

export function createFakeServer(seed: CalendarEvent[], options: FakeServerOptions): FakeServer {
  const events = new Map(seed.map((event) => [event.id, event]));

  async function answer(description: string, signal: AbortSignal): Promise<void> {
    options.onRequest(description);
    await randomDelay(signal);
    if (options.shouldFail()) {
      throw new Error("The fake server was told to fail.");
    }
  }

  return {
    async fetchEvents(rangeStart, rangeEnd, signal) {
      await answer(`load ${rangeStart.slice(0, 16)} to ${rangeEnd.slice(0, 16)}`, signal);
      const [from, to] = [Date.parse(rangeStart), Date.parse(rangeEnd)];
      return [...events.values()].filter(
        (event) => Date.parse(event.start) < to && Date.parse(event.end) >= from,
      );
    },
    async saveEvent(event, signal) {
      await answer("save one event", signal);
      events.set(event.id, event);
      return event;
    },
    async deleteEvent(id, signal) {
      await answer("delete one event", signal);
      events.delete(id);
    },
    addRandomEvents(count, dayStart) {
      for (let index = 0; index < count; index++) {
        const start = dayStart + Math.floor(Math.random() * 23 * 12) * 5 * MINUTE_MS;
        const length = (1 + Math.floor(Math.random() * 12)) * 5 * MINUTE_MS;
        const id = `random-${events.size}-${index}`;
        events.set(id, {
          id,
          title: `Event ${index + 1}`,
          start: iso(start),
          end: iso(start + length),
        });
      }
    },
    eventCount: () => events.size,
  };
}
