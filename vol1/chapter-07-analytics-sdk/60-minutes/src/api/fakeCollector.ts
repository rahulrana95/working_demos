/*
 * NOT PART OF THE INTERVIEW.
 * A fake collector that lives in the page. It answers after a short random
 * time, can be told to fail, and remembers every batch, so the demo can show
 * what the SDK sent.
 */
import type { Batch, SendResult, Transport } from "../analytics";

export interface CollectorSettings {
  /** Answer 500: the SDK retries. */
  fail500: boolean;
  /** Answer 400: the SDK drops the batch. */
  fail400: boolean;
  /** Answer after 3 seconds. */
  slow: boolean;
  /** Make `sendBeacon` return false, as a browser does when it holds too much beacon data. */
  refuseBeacon: boolean;
}

export interface CollectorRequest {
  number: number;
  /** Seconds since the page loaded. */
  atSeconds: number;
  via: "fetch" | "beacon";
  eventCount: number;
  outcome: string;
}

export interface CollectorState {
  requests: CollectorRequest[];
  /** Events stored, each id counted once. */
  stored: number;
  /** Events that arrived a second time and were dropped by id. */
  copies: number;
  /** The newest "dropped" count that the SDK reported. */
  droppedBySdk: number;
}

const SLOW_MS = 3000;

export function createFakeCollector() {
  const settings: CollectorSettings = {
    fail500: false,
    fail400: false,
    slow: false,
    refuseBeacon: false,
  };
  const seenIds = new Set<string>();
  const startedAt = Date.now();
  const listeners = new Set<() => void>();
  let state: CollectorState = { requests: [], stored: 0, copies: 0, droppedBySdk: 0 };

  function record(
    via: CollectorRequest["via"],
    batch: Batch,
    outcome: string,
    isStored: boolean,
  ): void {
    let { stored, copies } = state;
    if (isStored) {
      for (const event of batch.events) {
        if (seenIds.has(event.id)) {
          copies += 1;
        } else {
          seenIds.add(event.id);
          stored += 1;
        }
      }
    }
    const request: CollectorRequest = {
      number: state.requests.length + 1,
      atSeconds: (Date.now() - startedAt) / 1000,
      via,
      eventCount: batch.events.length,
      outcome,
    };
    state = { requests: [...state.requests, request], stored, copies, droppedBySdk: batch.dropped };
    listeners.forEach((listener) => listener());
  }

  function answer(batch: Batch): SendResult {
    if (settings.fail500) {
      record("fetch", batch, "500: the SDK will retry", false);
      return { kind: "retry" };
    }
    if (settings.fail400) {
      record("fetch", batch, "400: the SDK drops the batch", false);
      return { kind: "drop" };
    }
    record("fetch", batch, "200: stored", true);
    return { kind: "ok" };
  }

  const transport: Transport = (_url, body, signal) =>
    new Promise<SendResult>((resolve, reject) => {
      const delayMs = settings.slow ? SLOW_MS : 100 + Math.random() * 300;
      const timerId = setTimeout(() => resolve(answer(JSON.parse(body) as Batch)), delayMs);
      signal.addEventListener("abort", () => {
        clearTimeout(timerId);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });

  /**
   * Stands in for `navigator.sendBeacon`. A beacon gets no answer from the
   * server, so the failure switches of the collector do not apply to it.
   */
  function sendBeacon(_url: string | URL, body?: BodyInit | null): boolean {
    if (settings.refuseBeacon) {
      return false;
    }
    record("beacon", JSON.parse(String(body)) as Batch, "stored", true);
    return true;
  }

  return {
    transport,
    sendBeacon,
    settings,
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
