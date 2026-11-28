/*
 * NOT PART OF THE INTERVIEW: production version.
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
 *   8. Sampling by session: a busy product can send one session in ten and
 *      still see whole funnels.
 *   9. `track` only writes the call down. The hooks, the JSON and the storage
 *      write run later, when the browser is idle, so a click handler that
 *      calls `track` is not slowed down.
 *  10. Each event becomes JSON once. The request body and the stored queue
 *      are made by joining those texts.
 */
import { backoffDelayMs, MAX_RETRY_AFTER_MS } from "./backoff";
import { byteLength, countThatFit } from "./batchBytes";
import { isValidEventName } from "./eventNames";
import { whenIdle } from "./idle";
import { NOOP_ANALYTICS } from "./noop";
import { watchPageChanges } from "./pageTracking";
import { scrubPageUrls } from "./scrub";
import { isSampled, nextSession, parseSession, SESSION_IDLE_MS } from "./session";
import type { Session } from "./session";
import { readStorage, writeStorage } from "./storage";
import { QUEUE_PREFIX, removeStoredQueues, saveQueue, takeOverOldQueues } from "./storedQueue";
import { fetchTransport, sendOnExit } from "./transport";
import type {
  Analytics,
  AnalyticsEvent,
  AnalyticsOptions,
  Consent,
  ErrorSource,
  EventMap,
  Plugin,
  Properties,
  SendResult,
  Stats,
  StubCall,
} from "./types";
import { uuid } from "./uuid";

const ANONYMOUS_ID_KEY = "analytics:anonymousId";
const CONSENT_KEY = "analytics:consent";
const SESSION_KEY = "analytics:session";
/** A request with no answer after this long counts as failed. */
export const SEND_TIMEOUT_MS = 10_000;
/** In debug mode, a wrong event name is reported once. This many names are remembered. */
const MAX_WARNED_NAMES = 100;

/** A call to `track`, `page` or `identify`, written down to be handled in idle time. */
interface RecordedCall {
  type: AnalyticsEvent["type"];
  name: string;
  properties: Properties;
  timestamp: number;
  userId: string | undefined;
}

/** An event that is ready to send, with its JSON text and the size of that text. */
interface QueuedEvent {
  event: AnalyticsEvent;
  json: string;
  bytes: number;
}

interface InFlight {
  batch: QueuedEvent[];
  controller: AbortController;
  done: Promise<void>;
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
  consent: firstConsent = "granted",
  beforeSend = scrubPageUrls,
  sampleRate = 1,
  trackPages = true,
  plugins: firstPlugins = [],
  debug = false,
  onError,
}: AnalyticsOptions): Analytics {
  const queuePrefix = `${QUEUE_PREFIX}${writeKey}:`;
  const queueKey = queuePrefix + uuid();
  const plugins: Plugin[] = [...firstPlugins];
  const warnedNames = new Set<string>();
  const stats = { sent: 0, retried: 0, dropped: 0, lastError: null as string | null };

  let recorded: RecordedCall[] = [];
  let queue: QueuedEvent[] = [];
  let inFlight: InFlight | null = null;
  let failedAttempts = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let cancelIdleWork: (() => void) | null = null;
  /** True when the stored queue is older than the queue in memory. */
  let needsStoring = false;
  let isStopped = false;
  const storedConsent = readStorage(CONSENT_KEY);
  let consent: Consent =
    storedConsent === "granted" || storedConsent === "denied" ? storedConsent : firstConsent;
  let anonymousId = readStorage(ANONYMOUS_ID_KEY) ?? uuid();
  let session: Session | null = null;
  let userId: string | undefined;

  function log(...parts: unknown[]): void {
    if (debug) {
      console.debug("[analytics]", ...parts);
    }
  }

  /** Remembers a failure and tells the host. It never throws. */
  function report(error: unknown, source: ErrorSource): void {
    const problem = error instanceof Error ? error : new Error(String(error));
    stats.lastError = `${source}: ${problem.message}`;
    log("error,", stats.lastError);
    try {
      onError?.(problem, source);
    } catch {
      // An error in the error hook has nowhere to go.
    }
  }

  /** Wraps a function so that an error in it never reaches the host page. */
  function safe<Args extends unknown[]>(fn: (...args: Args) => void): (...args: Args) => void {
    return (...args) => {
      try {
        fn(...args);
      } catch (error) {
        // Losing an event is better than breaking the page of another team.
        report(error, "sdk");
      }
    };
  }

  function drop(count: number, reason: string): void {
    stats.dropped += count;
    log("dropped", count, "event(s):", reason);
  }

  /** Writes a call down and returns. This is all that `track` costs the caller. */
  function record(
    type: AnalyticsEvent["type"],
    name: string,
    properties: Properties = {},
    timestamp: number = Date.now(),
  ): void {
    if (consent === "denied" || isStopped) {
      return;
    }
    // A copy, so the event does not change when the host changes its object later.
    recorded.push({ type, name, properties: { ...properties }, timestamp, userId });
    if (recorded.length > maxQueueSize) {
      recorded.shift();
      drop(1, "the queue is full");
    }
    requestIdleWork();
  }

  function requestIdleWork(): void {
    if (cancelIdleWork === null && !isStopped) {
      cancelIdleWork = whenIdle(safe(doIdleWork));
    }
  }

  /**
   * Turns recorded calls into queued events while `hasTime` says yes. Always
   * handles at least one, so the work cannot stand still.
   */
  function prepareRecorded(hasTime: () => boolean): void {
    // A hook may call `track`, which adds to `recorded`. So we work on our own list.
    const calls = recorded;
    recorded = [];
    let handled = 0;
    while (handled < calls.length && (handled === 0 || hasTime())) {
      prepare(calls[handled]);
      handled += 1;
    }
    recorded = [...calls.slice(handled), ...recorded];
  }

  /** Prepares everything now. Used before a flush, on page exit and when consent is given. */
  function prepareAll(): void {
    prepareRecorded(() => true);
  }

  /**
   * The work that waits for an idle moment: prepare the recorded calls, store
   * the queue, and start the timer or a request. It stops when the browser
   * needs the thread back, and asks for another idle moment.
   */
  function doIdleWork(hasTime: () => boolean): void {
    cancelIdleWork = null;
    prepareRecorded(hasTime);
    if (recorded.length > 0) {
      requestIdleWork();
    }

    if (consent !== "granted") {
      return;
    }
    if (needsStoring) {
      persist();
    }
    // While the collector is failing, a full batch waits for the retry timer like the rest.
    if (queue.length >= batchSize && failedAttempts === 0) {
      void send();
    } else if (queue.length > 0) {
      schedule(flushIntervalMs);
    }
  }

  /** Returns the session of an event at `now`, and keeps it alive. */
  function touchSession(now: number): Session {
    if (session === null || now - session.lastSeenAt >= SESSION_IDLE_MS) {
      // Another tab may have kept the session alive, or started a new one.
      session = parseSession(readStorage(SESSION_KEY)) ?? session;
    }
    session = nextSession(session, now);
    needsStoring = true;
    return session;
  }

  /** Runs the hooks and the plugins on one event. Returns null when the event must not be sent. */
  function runHooks(first: AnalyticsEvent): AnalyticsEvent | null {
    let event: AnalyticsEvent | null = first;
    const steps: Array<[ErrorSource, Plugin["enrich"]]> = [
      ["beforeSend", beforeSend],
      ...plugins.map((plugin): [ErrorSource, Plugin["enrich"]] => ["plugin", plugin.enrich]),
    ];
    for (const [source, step] of steps) {
      if (event === null || step === undefined) {
        continue;
      }
      try {
        event = step(event) ?? null;
      } catch (error) {
        // A hook that failed may not have removed the personal data. Do not send the event.
        report(error, source);
        drop(1, `${source} threw`);
        return null;
      }
    }
    return event;
  }

  /** Turns one recorded call into a queued event. */
  function prepare(call: RecordedCall): void {
    const sessionId = touchSession(call.timestamp).id;
    if (!isSampled(sessionId, sampleRate)) {
      return;
    }
    const event = runHooks({
      id: uuid(),
      type: call.type,
      name: call.name,
      properties: call.properties,
      timestamp: call.timestamp,
      anonymousId,
      userId: call.userId,
      sessionId,
    });
    if (event === null) {
      return;
    }
    warnAboutName(event);

    let json: string;
    try {
      json = JSON.stringify(event);
    } catch (error) {
      // For example a property that points back to itself. Only this event is lost.
      report(error, "sdk");
      drop(1, "the event cannot become JSON");
      return;
    }
    queue.push({ event, json, bytes: byteLength(json) });
    trimQueue();
    log("queued", event.type, event.name);
    if (consent === "granted") {
      handToDestinations([event]);
    }
  }

  function warnAboutName(event: AnalyticsEvent): void {
    const isNew = !warnedNames.has(event.name) && warnedNames.size < MAX_WARNED_NAMES;
    if (debug && event.type === "track" && isNew && !isValidEventName(event.name)) {
      warnedNames.add(event.name);
      console.warn(
        `[analytics] The event name "${event.name}" does not follow the naming rule: ` +
          "lower case words joined by _, for example checkout_started.",
      );
    }
  }

  function handToDestinations(events: AnalyticsEvent[]): void {
    for (const plugin of plugins) {
      for (const event of events) {
        try {
          plugin.deliver?.(event);
        } catch (error) {
          report(error, "plugin");
        }
      }
    }
  }

  /** Mirrors what we hold to storage, so it survives a crash or a reload. */
  function persist(): void {
    needsStoring = false;
    if (session !== null) {
      writeStorage(SESSION_KEY, JSON.stringify(session));
    }
    saveQueue(
      queueKey,
      [...(inFlight?.batch ?? []), ...queue].map((queued) => queued.json),
    );
  }

  /** Asks for the queue to be stored in the next idle moment. */
  function storeSoon(): void {
    needsStoring = true;
    requestIdleWork();
  }

  /** Adds the events that closed or crashed tabs left in storage to our queue. */
  function takeOver(): void {
    takeOverOldQueues(
      queuePrefix,
      queueKey,
      safe((events) => {
        if (consent === "granted" && events.length > 0 && !isStopped) {
          const adopted = events.map((event) => {
            const json = JSON.stringify(event);
            return { event, json, bytes: byteLength(json) };
          });
          queue.unshift(...adopted);
          trimQueue();
          log("took over", events.length, "event(s) that another tab left behind");
          storeSoon();
        }
      }),
    );
  }

  /** Runs when we have consent: at the start, and when the user says yes. */
  function startStoring(): void {
    writeStorage(ANONYMOUS_ID_KEY, anonymousId);
    // Events that waited for the choice have not been handed to the destinations yet.
    handToDestinations(queue.map((queued) => queued.event));
    takeOver();
    storeSoon();
  }

  function trimQueue(): void {
    const extra = queue.length - maxQueueSize;
    if (extra > 0) {
      queue.splice(0, extra);
      drop(extra, "the queue is full");
    }
  }

  function schedule(delayMs: number): void {
    if (timerId !== null || inFlight !== null || isStopped) {
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

  /** Takes the next batch off the queue: at most `batchSize` events and at most about 60 KB. */
  function takeBatch(): { batch: QueuedEvent[]; body: string } {
    const count = countThatFit(
      queue.map((queued) => queued.bytes),
      batchSize,
    );
    const batch = queue.splice(0, count);
    // The same shape as `Batch` in types.ts. The events are JSON already, so we join them.
    const head = JSON.stringify({ writeKey, sentAt: Date.now(), dropped: stats.dropped });
    const body = `${head.slice(0, -1)},"events":[${batch.map((queued) => queued.json).join(",")}]}`;
    return { batch, body };
  }

  /** Sends one batch, unless a request is already in flight. Never rejects. */
  function send(): Promise<void> {
    if (inFlight !== null) {
      return inFlight.done;
    }
    if (queue.length === 0 || consent !== "granted" || isStopped) {
      return Promise.resolve();
    }
    clearTimer();

    const { batch, body } = takeBatch();
    const controller = new AbortController();
    log("sending", batch.length, "event(s)");
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
    return new Promise<SendResult>((resolve) => {
      const retry = () => resolve({ kind: "retry" });
      const timeoutId = setTimeout(() => {
        controller.abort();
        retry();
      }, SEND_TIMEOUT_MS);

      // The inner promise turns an error thrown by the transport into a rejection.
      new Promise<SendResult>((started) => started(transport(endpoint, body, controller.signal)))
        .then(resolve, retry)
        .finally(() => clearTimeout(timeoutId));
    });
  }

  function settle(batch: QueuedEvent[], answer: SendResult): void {
    // A transport written in plain JavaScript may resolve with nothing.
    const result: SendResult = answer ?? { kind: "retry" };
    log("the collector answered", result.kind, "for", batch.length, "event(s)");

    if (result.kind === "ok" || result.kind === "drop") {
      if (result.kind === "drop") {
        drop(batch.length, "the collector refused the batch");
        report(new Error("The collector refused a batch"), "transport");
      } else {
        stats.sent += batch.length;
      }
      failedAttempts = 0;
      storeSoon();
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
    storeSoon();
    failedAttempts += 1;
    stats.retried += 1;
    report(new Error("A batch did not reach the collector. It will be sent again."), "transport");
    // `|| 0` also turns NaN into 0. A server that asks for no wait still gets the backoff.
    const askedMs = result.retryAfterMs || 0;
    schedule(Math.min(Math.max(backoffDelayMs(failedAttempts), askedMs), MAX_RETRY_AFTER_MS));
  }

  async function flush(): Promise<void> {
    prepareAll();
    do {
      await send();
    } while (queue.length > 0 && failedAttempts === 0 && consent === "granted" && !isStopped);
  }

  function cancelInFlight(): QueuedEvent[] {
    const batch = inFlight === null ? [] : inFlight.batch;
    inFlight?.controller.abort();
    inFlight = null;
    return batch;
  }

  /** Hands everything we hold to the browser, because the page may be gone in a moment. */
  function flushOnExit(): void {
    // There may be no idle moment any more. Prepare the recorded calls now.
    prepareAll();
    if (consent !== "granted") {
      return;
    }
    // The request in flight may die with the page, so its events go out again.
    // If both arrive, the collector drops the copy by id.
    queue.unshift(...cancelInFlight());
    clearTimer();

    while (queue.length > 0) {
      const { batch, body } = takeBatch();
      if (!sendOnExit(endpoint, body)) {
        queue.unshift(...batch);
        break;
      }
      stats.sent += batch.length;
      log("handed", batch.length, "event(s) to the browser on page exit");
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
  const onVisibilityChange = safe(() => {
    if (document.visibilityState === "hidden") {
      flushOnExit();
    }
  });
  const onPageHide = safe(flushOnExit);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);

  function setConsent(choice: "granted" | "denied"): void {
    if (choice === consent || (choice !== "granted" && choice !== "denied") || isStopped) {
      return;
    }
    if (choice === "granted") {
      // The calls made before the choice become events first, so they are handed over once.
      prepareAll();
    }
    consent = choice;
    writeStorage(CONSENT_KEY, choice);
    log("consent is now", choice);

    if (choice === "granted") {
      startStoring();
      return;
    }
    recorded = [];
    queue = [];
    cancelInFlight();
    clearTimer();
    failedAttempts = 0;
    userId = undefined;
    session = null;
    needsStoring = false;
    // A new id, so a later "yes" cannot be linked to what was collected before.
    anonymousId = uuid();
    writeStorage(ANONYMOUS_ID_KEY, null);
    writeStorage(SESSION_KEY, null);
    removeStoredQueues(queuePrefix);
  }

  function identify(id: string, traits?: Properties, timestamp?: number): void {
    if (consent !== "denied") {
      userId = id;
    }
    record("identify", "identify", traits, timestamp);
  }

  function page(name?: string, timestamp?: number): void {
    record(
      "page",
      name ?? document.title,
      { url: location.href, path: location.pathname, referrer: document.referrer },
      timestamp,
    );
  }

  /** Runs one call that the loader stub recorded before the SDK had loaded. */
  function replayCall({ method, args, at }: StubCall): void {
    const [first, second] = args;
    if (method === "track") {
      record("track", first as string, second as Properties | undefined, at);
    } else if (method === "identify") {
      identify(first as string, second as Properties | undefined, at);
    } else if (method === "page") {
      // The URL is the one of now. The page may have changed since the call.
      page(first as string | undefined, at);
    } else if (method === "setConsent") {
      setConsent(first as "granted" | "denied");
    } else if (method === "optOut" || method === "optIn") {
      setConsent(method === "optOut" ? "denied" : "granted");
    } else if (method === "flush") {
      void flush().catch((error: unknown) => report(error, "sdk"));
    }
  }

  let stopWatchingPages = () => {};
  if (trackPages) {
    safe(() => {
      page();
      stopWatchingPages = watchPageChanges(safe(() => page()));
    })();
  }
  if (consent === "granted") {
    safe(startStoring)();
  }

  return {
    track: safe((name: string, properties?: Properties) => record("track", name, properties)),
    identify: safe((id: string, traits?: Properties) => identify(id, traits)),
    page: safe((name?: string) => page(name)),
    flush: () => flush().catch((error: unknown) => report(error, "sdk")),
    setConsent: safe(setConsent),
    optOut: safe(() => setConsent("denied")),
    optIn: safe(() => setConsent("granted")),
    use: safe((plugin: Plugin) => {
      if (typeof plugin?.name === "string") {
        plugins.push(plugin);
        log("plugin added:", plugin.name);
      }
    }),
    getStats: (): Stats => ({
      ...stats,
      queued: recorded.length + queue.length + (inFlight?.batch.length ?? 0),
    }),
    replay: safe((calls: StubCall[]) => calls.forEach(safe(replayCall))),
    shutdown: safe(() => {
      if (isStopped) {
        return;
      }
      flushOnExit();
      isStopped = true;
      clearTimer();
      cancelIdleWork?.();
      cancelIdleWork = null;
      stopWatchingPages();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    }),
  };
}
