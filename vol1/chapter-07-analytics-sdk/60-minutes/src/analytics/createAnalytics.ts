/*
 * PART OF THE INTERVIEW: yes (about 36 minutes).
 * This file is the heart of the answer. Write the queue and `send` first,
 * then the retry, then the page exit, then opt-out. In the last 15 minutes
 * add the stored queue, `beforeSend` and the typed events.
 *
 * Why it holds at scale:
 *   1. Batching: 20 events cost one request, not 20.
 *   2. One request in flight: a slow collector never gets a pile of requests from one page.
 *   3. Backoff with a random part: after an outage the pages do not come back all at once.
 *   4. Bounded queue: a page that stays open all day with no network holds at most 500 events.
 *   5. Ids: a retry can deliver a batch twice, and the collector can drop the copy.
 *   6. Nothing can throw into the host page.
 *   7. The queue is stored, so a crash or a reload loses nothing, and five
 *      open tabs do not send the same stored events five times.
 */
import { backoffDelayMs } from "./backoff";
import { readStorage, writeStorage } from "./storage";
import { QUEUE_PREFIX, removeStoredQueues, saveQueue, takeOverOldQueues } from "./storedQueue";
import { fetchTransport, sendOnExit } from "./transport";
import type {
  Analytics,
  AnalyticsEvent,
  AnalyticsOptions,
  Batch,
  EventMap,
  Properties,
  SendResult,
} from "./types";
import { uuid } from "./uuid";

const ANONYMOUS_ID_KEY = "analytics:anonymousId";
const OPT_OUT_KEY = "analytics:optOut";
/** A request with no answer after this long counts as failed. */
export const SEND_TIMEOUT_MS = 10_000;

interface InFlight {
  batch: AnalyticsEvent[];
  controller: AbortController;
  done: Promise<void>;
}

const doNothing = () => {};
const NOOP_ANALYTICS: Analytics = {
  track: doNothing,
  identify: doNothing,
  page: doNothing,
  flush: () => Promise.resolve(),
  optOut: doNothing,
  optIn: doNothing,
};

/** Wraps a function so that an error in it never reaches the host page. */
function safe<Args extends unknown[]>(fn: (...args: Args) => void): (...args: Args) => void {
  return (...args) => {
    try {
      fn(...args);
    } catch {
      // Losing an event is better than breaking the page of another team.
    }
  };
}

/**
 * Pass the events of your product as `Events`, and `track` accepts only
 * those names, each with its own properties.
 */
export function createAnalytics<Events extends object = EventMap>(
  options: AnalyticsOptions,
): Analytics<Events> {
  let analytics = NOOP_ANALYTICS;
  try {
    // On the server there is no page and no user. Every call does nothing.
    analytics = typeof window === "undefined" ? NOOP_ANALYTICS : createBrowserAnalytics(options);
  } catch {
    // Keep the one that does nothing.
  }
  // The cast is safe: at run time `track` takes any name and any properties.
  // `Events` only limits what the compiler lets the caller write.
  return analytics as unknown as Analytics<Events>;
}

function createBrowserAnalytics({
  endpoint,
  writeKey,
  flushIntervalMs = 5000,
  batchSize = 20,
  maxQueueSize = 500,
  transport = fetchTransport,
  beforeSend = (event) => event,
}: AnalyticsOptions): Analytics {
  const queuePrefix = `${QUEUE_PREFIX}${writeKey}:`;
  const queueKey = queuePrefix + uuid();
  let queue: AnalyticsEvent[] = [];
  let inFlight: InFlight | null = null;
  let failedAttempts = 0;
  let dropped = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let optedOut = readStorage(OPT_OUT_KEY) === "1";
  let anonymousId = readStorage(ANONYMOUS_ID_KEY) ?? uuid();
  let userId: string | undefined;

  /** Mirrors what we hold to storage, so it survives a crash or a reload. */
  function persist(): void {
    saveQueue(queueKey, [...(inFlight?.batch ?? []), ...queue]);
  }

  /** Adds the events that closed or crashed tabs left in storage to our queue. */
  function takeOver(): void {
    takeOverOldQueues(
      queuePrefix,
      queueKey,
      safe((events) => {
        if (!optedOut && events.length > 0) {
          queue.unshift(...events);
          trimQueue();
          persist();
          schedule(flushIntervalMs);
        }
      }),
    );
  }

  function enqueue(type: AnalyticsEvent["type"], name: string, properties: Properties = {}): void {
    if (optedOut) {
      return;
    }
    let event: AnalyticsEvent | null = null;
    try {
      // A copy, so the event does not change when the host changes its object later.
      const copy = { ...properties };
      const timestamp = Date.now();
      event = beforeSend({
        id: uuid(),
        type,
        name,
        properties: copy,
        timestamp,
        anonymousId,
        userId,
      });
    } catch {
      // A hook that failed may not have removed the personal data. Do not send the event.
      dropped += 1;
    }
    if (!event) {
      return;
    }
    queue.push(event);
    trimQueue();
    persist();

    // While the collector is failing, a full batch waits for the retry timer like the rest.
    if (queue.length >= batchSize && failedAttempts === 0) {
      void send();
    } else {
      schedule(flushIntervalMs);
    }
  }

  function trimQueue(): void {
    const extra = queue.length - maxQueueSize;
    if (extra > 0) {
      queue.splice(0, extra);
      dropped += extra;
    }
  }

  function schedule(delayMs: number): void {
    if (timerId !== null || inFlight !== null) {
      return;
    }
    timerId = setTimeout(
      safe(() => {
        timerId = null;
        void send();
      }),
      delayMs,
    );
  }

  function clearTimer(): void {
    clearTimeout(timerId ?? undefined);
    timerId = null;
  }

  /** Returns the request body, or null when the events cannot be turned into JSON. */
  function toBody(events: AnalyticsEvent[]): string | null {
    try {
      const batch: Batch = { writeKey, sentAt: Date.now(), dropped, events };
      return JSON.stringify(batch);
    } catch {
      return null;
    }
  }

  /** Sends one batch, unless a request is already in flight. Never rejects. */
  function send(): Promise<void> {
    if (inFlight !== null) {
      return inFlight.done;
    }
    if (queue.length === 0) {
      return Promise.resolve();
    }
    clearTimer();

    const batch = queue.splice(0, batchSize);
    const body = toBody(batch);
    if (body === null) {
      // For example a property that points back to itself. It will never work, so drop it.
      dropped += batch.length;
      persist();
      return send();
    }

    const controller = new AbortController();
    const done = deliver(body, controller).then(
      safe((result) => {
        // Opt-out and page exit set `inFlight` to null. The answer is then not ours to handle.
        if (inFlight === current) {
          inFlight = null;
          settle(batch, result);
        }
      }),
    );
    const current: InFlight = { batch, controller, done };
    inFlight = current;
    return done;
  }

  /** Calls the transport with a time limit. Resolves with "retry" for every kind of failure. */
  function deliver(body: string, controller: AbortController): Promise<SendResult> {
    // After the time limit the signal aborts, and the transport rejects.
    const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    // The promise turns an error thrown by the transport into a rejection.
    return new Promise<SendResult>((resolve) =>
      resolve(transport(endpoint, body, controller.signal)),
    )
      .catch((): SendResult => ({ kind: "retry" }))
      .finally(() => clearTimeout(timeoutId));
  }

  function settle(batch: AnalyticsEvent[], answer: SendResult): void {
    // A transport written in plain JavaScript may resolve with nothing.
    const result: SendResult = answer ?? { kind: "retry" };

    if (result.kind === "ok" || result.kind === "drop") {
      if (result.kind === "drop") {
        dropped += batch.length;
      }
      failedAttempts = 0;
      persist();
      // The collector works, so this is a good time to look for what other tabs left behind.
      takeOver();
      if (queue.length >= batchSize) {
        void send();
      } else if (queue.length > 0) {
        schedule(flushIntervalMs);
      }
      return;
    }

    // Back to the front, so the events stay in order. The ids do not change.
    queue.unshift(...batch);
    trimQueue();
    // Storing again also tells the other tabs that this tab is alive.
    persist();
    failedAttempts += 1;
    schedule(backoffDelayMs(failedAttempts));
  }

  async function flush(): Promise<void> {
    do {
      await send();
    } while (queue.length > 0 && failedAttempts === 0);
  }

  function cancelInFlight(): AnalyticsEvent[] {
    const batch = inFlight === null ? [] : inFlight.batch;
    inFlight?.controller.abort();
    inFlight = null;
    return batch;
  }

  /** Hands everything we hold to the browser, because the page may be gone in a moment. */
  function flushOnExit(): void {
    // The request in flight may die with the page, so its events go out again.
    // If both arrive, the collector drops the copy by id.
    queue.unshift(...cancelInFlight());
    clearTimer();

    while (queue.length > 0) {
      const batch = queue.slice(0, batchSize);
      const body = toBody(batch);
      if (body === null) {
        dropped += batch.length;
      } else if (!sendOnExit(endpoint, body)) {
        break;
      }
      queue.splice(0, batch.length);
    }

    // What the browser did not take stays in storage. If the page dies, the
    // next page of this site sends it. If the page lives, the timer does.
    persist();
    if (queue.length > 0) {
      schedule(flushIntervalMs);
    }
  }

  // "hidden" is the last event a page can count on: it fires when the user
  // switches tab or app, and a phone may kill the page after it with no other
  // event. `pagehide` is for browsers that do not fire it on navigation.
  // We never use `unload` or `beforeunload`: phones often do not fire them,
  // and a page with an `unload` handler is kept out of the back/forward cache.
  document.addEventListener(
    "visibilitychange",
    safe(() => {
      if (document.visibilityState === "hidden") {
        flushOnExit();
      }
    }),
  );
  window.addEventListener("pagehide", safe(flushOnExit));

  if (!optedOut) {
    writeStorage(ANONYMOUS_ID_KEY, anonymousId);
    takeOver();
  }

  return {
    track: safe((name: string, properties?: Properties) => enqueue("track", name, properties)),
    identify: safe((id: string, traits?: Properties) => {
      if (!optedOut) {
        userId = id;
      }
      enqueue("identify", "identify", traits);
    }),
    page: safe((name?: string) =>
      enqueue("page", name ?? document.title, {
        url: location.href,
        path: location.pathname,
        referrer: document.referrer,
      }),
    ),
    flush: () => flush().catch(doNothing),
    optOut: safe(() => {
      optedOut = true;
      queue = [];
      cancelInFlight();
      clearTimer();
      failedAttempts = 0;
      userId = undefined;
      // A new id, so a later opt-in cannot be linked to what was collected before.
      anonymousId = uuid();
      writeStorage(OPT_OUT_KEY, "1");
      writeStorage(ANONYMOUS_ID_KEY, null);
      removeStoredQueues(queuePrefix);
    }),
    optIn: safe(() => {
      optedOut = false;
      writeStorage(OPT_OUT_KEY, null);
      writeStorage(ANONYMOUS_ID_KEY, anonymousId);
    }),
  };
}
